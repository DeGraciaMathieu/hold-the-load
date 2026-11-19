import {
  DT, SIZES, API_BAD_LAT, API_BAD_ERR, TIMEOUT_SHORT, TIMEOUT_LONG,
  CACHE_WARMUP, WORKER_RATE, CAMP_START_CASH, QUEUE_GAUGE_MAX, POOLER_GAUGE_MAX, DIAG_MIN_SHARE,
} from './config.js';
import { defaultOpts, brickCost, layoutCost, emptyLayout, cloneLayout, hasType } from './rules/layout.js';
import { goalsMet, missionStars, missionUnlocked } from './rules/goals.js';
import { campRevenue, campOutcome, nextRound, campRecord } from './rules/campaign.js';
import { isDailyRecord } from './rules/daily.js';
import { LEVELS } from './content/levels.js';
import { rng, genLevel, dailyLevel } from './rules/procgen.js';
import { makeSim } from './rules/sim/make.js';
import { useCard } from './rules/sim/cards.js';
import { stepSim } from './rules/sim/step.js';
import { resultOf } from './rules/sim/result.js';
import { ROW_DEF, CATALOG, CLASSES } from './content/catalog.js';
import { REGION_NAMES, CARDS } from './content/texts.js';

// ============ Moteur de simulation v2 ============
const REGION_SHORT = { eu: 'PAR', us: 'NYC', asia: 'TYO' };
const OPT_DEFS = {
  lb: [{ k: 'algo', label: 'Répartition', choices: [['rr', 'Tourniquet'], ['sticky', 'Sticky'], ['least', 'Moins chargé']],
    help: { rr: 'Chaque serveur reçoit la même part, quelle que soit sa taille.', sticky: 'Un utilisateur reste sur le même serveur : les sessions marchent sans Redis, mais la charge est moins bien répartie (−15 % de capacité).', least: 'Envoie vers le serveur le moins chargé : indispensable si les tailles sont mélangées.' } }],
  waf: [{ k: 'mode', label: 'Filtrage', choices: [['souple', 'Souple'], ['strict', 'Strict']] }],
  server: [{ k: 'size', label: 'Taille', choices: [['s', 'Petit · 25 €'], ['m', 'Moyen · 40 €'], ['l', 'Gros · 85 €']] }],
  autoscale: [
    { k: 'min', label: 'Instances minimum', choices: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] },
    { k: 'max', label: 'Instances maximum', choices: [[4, '4'], [6, '6'], [8, '8']] },
    { k: 'seuil', label: 'Seuil de déclenchement', choices: [[50, '50 %'], [70, '70 %'], [85, '85 %']] },
  ],
  cache: [
    { k: 'ttl', label: 'Durée de vie', choices: [['court', 'Courte'], ['moyen', 'Moyenne'], ['long', 'Longue']],
      help: { court: '60 % des lectures servies, toujours fraîches.', moyen: '80 % servies, 1 % périmées.', long: '93 % servies, 8 % périmées.' } },
    { k: 'antiRuee', label: 'Protection anti-ruée (+10 €)', choices: [[false, 'Non'], [true, 'Oui']],
      help: { false: 'Cache vide : chaque requête manquée part en base, souvent plusieurs fois pour la même donnée.', true: 'Cache vide : une seule requête par donnée part en base, les autres attendent.' } },
  ],
  db: [{ k: 'sensible', label: 'Lectures sensibles', choices: [[false, 'Partout'], [true, 'Sur la primaire']],
    help: { false: 'Les lectures juste après une écriture peuvent tomber sur une réplique en retard.', true: 'Les lectures juste après une écriture vont sur la primaire : toujours fraîches, mais plus de charge.' } }],
};
const REASONS = {
  noServer: 'Aucun serveur pour répondre',
  noLb: 'Sans load balancer, un seul serveur reçoit tout le trafic',
  serverSat: 'Serveurs saturés',
  crash: 'Le serveur tombé n’avait pas de relève',
  session: 'Sessions perdues : l’utilisateur arrive sur un serveur qui ne le connaît pas',
  noDb: 'Aucune base de données',
  dbDown: 'Plus de base primaire pour écrire',
  dbSat: 'Base de données saturée',
  conn: 'Trop de connexions ouvertes sur la base',
  stale: 'Lecture d’une donnée pas encore répliquée (« mon panier est vide »)',
  apiDown: 'API de paiement en panne',
  apiTimeout: 'Paiements expirés (timeout)',
  blocked: 'Vrais clients bloqués par le pare-feu',
  backlog: 'Tâches jamais traitées à la fin (workers manquants ou trop lents)',
  queueLost: 'File de messages perdue avec sa région',
  objDown: 'Stockage objet indisponible',
  promoLoss: 'Écritures perdues pendant la bascule',
};

// ============ Interface ============
const COLORS = { lb: '#f4a259', cdn: '#b8a1e3', waf: '#e7a3b8', server: '#9cc3e6', autoscale: '#7fb0e0', worker: '#a9d3cf', cache: '#ef8a7c', queue: '#f2d36b',
  pooler: '#d9c89c', breaker: '#f0b27a', db: '#8fd1a6', replica: '#c4e6cf', objstore: '#c9c3e8' };
const REG_COLORS = { eu: '#3b6fd8', us: '#c0392b', asia: '#d18a00' };
const KEY = 'tenir-la-charge-v2';
const GLOBAL = ['lb', 'cdn', 'waf'];
const ST = { mode: 'missions', level: 0, layouts: {}, settings: {}, stars: {}, camp: null, campBest: 0, daily: {} };
try { Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('fr-FR');
// Seules sources d'aléa et d'horloge du jeu : la graine d'une partie Croissance et la date du défi.
const randomSeed = () => Math.floor(Math.random() * 1e9);
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---------- contexte courant ----------
let CUR = null; // { kind, level, key }
function campLevel() { return genLevel(rng(ST.camp.seed + ':' + ST.camp.round), ST.camp.round); }
function buildCtx() {
  if (ST.mode === 'camp') {
    if (!ST.camp) newCamp(randomSeed());
    const lv = campLevel();
    CUR = { kind: 'camp', level: lv, key: 'camp' };
  } else if (ST.mode === 'daily') {
    const d = todayStr();
    CUR = { kind: 'daily', level: dailyLevel(d), key: 'daily-' + d, date: d };
  } else {
    ST.level = Math.min(ST.level, LEVELS.length - 1);
    const lv = LEVELS[ST.level];
    CUR = { kind: 'mission', level: lv, key: lv.id };
  }
  if (!ST.layouts[CUR.key]) ST.layouts[CUR.key] = CUR.level.preset ? cloneLayout(CUR.level.preset) : emptyLayout();
  if (!ST.settings[CUR.key]) ST.settings[CUR.key] = { retries: 0, timeout: 'long', shed: false };
}
function newCamp(seed) { ST.camp = { seed, round: 1, cash: CAMP_START_CASH, history: [], over: false }; ST.layouts.camp = emptyLayout(); ST.settings.camp = { retries: 0, timeout: 'long', shed: false }; }
const lay = () => ST.layouts[CUR.key];
const sets = () => ST.settings[CUR.key];
const regionsOf = lv => (lv.regions ? Object.keys(lv.regions) : null);
const lbAlgosOf = lv => lv.lbAlgos || (lv.bricks.includes('cache') ? ['rr', 'sticky', 'least'] : ['rr']);

// ---------- canvas ----------
const board = $('board'), ctx = board.getContext('2d');
let W = 360, H = 460, G = {};
const FONT = (w, s) => `${w} ${s}px "JetBrains Mono", ui-monospace, monospace`;
function layout() {
  W = board.clientWidth || 360;
  const pad = 6, gap = 6;
  const sw = Math.min(78, (W - pad * 2 - gap * 4) / 5), sh = 58;
  G = { sw, sh, rows: {}, internet: { x: W / 2 - 20, y: 24 }, api: { x: W - 46, y: 24 } };
  let y = 58;
  for (const r of ROW_DEF) {
    const total = r.slots * sw + (r.slots - 1) * gap, x0 = (W - total) / 2;
    G.rows[r.key] = { labelY: y, slots: [...Array(r.slots)].map((_, i) => ({ x: x0 + i * (sw + gap), y: y + 12, w: sw, h: sh })) };
    y += 12 + sh + 22;
  }
  H = y - 6;
  const dpr = window.devicePixelRatio || 1;
  board.style.height = H + 'px'; board.width = W * dpr; board.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const center = (row, i) => { const s = G.rows[row].slots[i]; return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; };
function placed(type) { const L = lay(), out = []; for (const r of ROW_DEF) L[r.key].forEach((b, i) => { if (b && b.type === type) out.push({ row: r.key, i, b }); }); return out; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function icon(type, cx, cy, s) {
  ctx.save(); ctx.strokeStyle = '#1d1b18'; ctx.fillStyle = '#1d1b18'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
  if (type === 'server' || type === 'autoscale') {
    for (const dy of [-s * .28, s * .2]) { rr(cx - s * .5, cy + dy - s * .18, s, s * .36, 3); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + s * .3, cy + dy, 1.5, 0, 7); ctx.fill(); L(cx - s * .32, cy + dy, cx, cy + dy); }
    if (type === 'autoscale') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + s * .5, cy - s * .45, 6, 0, 7); ctx.fill(); ctx.stroke(); L(cx + s * .5, cy - s * .45 + 3, cx + s * .5, cy - s * .45 - 3); L(cx + s * .5 - 2.5, cy - s * .45 - 0.5, cx + s * .5, cy - s * .45 - 3); L(cx + s * .5 + 2.5, cy - s * .45 - 0.5, cx + s * .5, cy - s * .45 - 3); }
  } else if (type === 'lb') {
    L(cx - s * .5, cy, cx - s * .05, cy); L(cx - s * .05, cy, cx + s * .45, cy - s * .36); L(cx - s * .05, cy, cx + s * .45, cy + s * .36); L(cx - s * .05, cy, cx + s * .5, cy);
    ctx.beginPath(); ctx.arc(cx - s * .05, cy, 3, 0, 7); ctx.fill();
  } else if (type === 'cdn') {
    ctx.beginPath(); ctx.arc(cx, cy, s * .42, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy, s * .18, s * .42, 0, 0, 7); ctx.stroke(); L(cx - s * .42, cy, cx + s * .42, cy);
  } else if (type === 'waf') {
    ctx.beginPath(); ctx.moveTo(cx, cy - s * .48); ctx.lineTo(cx + s * .4, cy - s * .32); ctx.quadraticCurveTo(cx + s * .38, cy + s * .25, cx, cy + s * .5); ctx.quadraticCurveTo(cx - s * .38, cy + s * .25, cx - s * .4, cy - s * .32); ctx.closePath(); ctx.stroke();
    L(cx - s * .15, cy, cx - s * .02, cy + s * .14); L(cx - s * .02, cy + s * .14, cx + s * .18, cy - s * .12);
  } else if (type === 'worker') {
    ctx.beginPath(); ctx.arc(cx, cy, s * .2, 0, 7); ctx.stroke();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; L(cx + Math.cos(a) * s * .3, cy + Math.sin(a) * s * .3, cx + Math.cos(a) * s * .45, cy + Math.sin(a) * s * .45); }
  } else if (type === 'cache') {
    ctx.beginPath(); ctx.moveTo(cx + s * .1, cy - s * .5); ctx.lineTo(cx - s * .28, cy + s * .05); ctx.lineTo(cx + s * .02, cy + s * .05); ctx.lineTo(cx - s * .1, cy + s * .5); ctx.lineTo(cx + s * .3, cy - s * .08); ctx.lineTo(cx, cy - s * .08); ctx.closePath(); ctx.fill();
  } else if (type === 'queue') {
    for (let k = 0; k < 3; k++) { rr(cx - s * .5 + k * s * .36, cy - s * .25, s * .28, s * .5, 3); ctx.stroke(); }
  } else if (type === 'pooler') {
    ctx.beginPath(); ctx.moveTo(cx - s * .5, cy - s * .4); ctx.lineTo(cx + s * .5, cy - s * .4); ctx.lineTo(cx + s * .1, cy + s * .05); ctx.lineTo(cx + s * .1, cy + s * .45); ctx.lineTo(cx - s * .1, cy + s * .45); ctx.lineTo(cx - s * .1, cy + s * .05); ctx.closePath(); ctx.stroke();
  } else if (type === 'breaker') {
    L(cx - s * .5, cy + s * .1, cx - s * .2, cy + s * .1); L(cx + s * .2, cy + s * .1, cx + s * .5, cy + s * .1); L(cx - s * .2, cy + s * .1, cx + s * .2, cy - s * .25);
    ctx.beginPath(); ctx.arc(cx - s * .2, cy + s * .1, 2.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(cx + s * .2, cy + s * .1, 2.5, 0, 7); ctx.fill();
  } else if (type === 'db' || type === 'replica') {
    const w = s * .85, h = s * .95;
    ctx.beginPath(); ctx.ellipse(cx, cy - h * .35, w / 2, h * .14, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w / 2, cy - h * .35); ctx.lineTo(cx - w / 2, cy + h * .35); ctx.ellipse(cx, cy + h * .35, w / 2, h * .14, 0, Math.PI, 0, true); ctx.lineTo(cx + w / 2, cy - h * .35); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h * .14, 0, 0, Math.PI); ctx.stroke();
    if (type === 'replica') { ctx.font = FONT(800, 8); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', cx, cy - h * .1); }
  } else if (type === 'objstore') {
    ctx.beginPath(); ctx.moveTo(cx - s * .4, cy - s * .35); ctx.lineTo(cx + s * .4, cy - s * .35); ctx.lineTo(cx + s * .3, cy + s * .45); ctx.lineTo(cx - s * .3, cy + s * .45); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy - s * .35, s * .4, s * .1, 0, 0, 7); ctx.stroke();
  }
  ctx.restore();
}

// ---------- simulation en cours ----------
let RUN = null; // { S, tk, speed, acc, lastLog }
let particles = [], bursts = [];

function liveNode(b, row, i) {
  if (!RUN || !RUN.tk) return null;
  const S = RUN.S, tk = RUN.tk, id = row + i;
  const bk = S.bricks.find(x => x.id === id);
  const dead = bk && !bk.alive;
  const pct = x => Math.round(x * 100) + ' %';
  switch (b.type) {
    case 'server': {
      const f = S.fixed.find(x => x.id === id);
      if (!f || !f.alive) return { dead: true, text: 'HORS SERVICE' };
      if (S.t < f.readyAt) return { warm: true, text: 'démarre…', load: 0 };
      const s = tk.servers.find(x => x.id === id);
      if (!s || !s.receiving) return { load: 0, text: 'aucun trafic', idle: true };
      return { load: s.rho, text: pct(s.rho) };
    }
    case 'autoscale': {
      if (dead) return { dead: true, text: 'HORS LIGNE' };
      if (!S.lb) return { load: 0, text: 'sans LB', idle: true };
      const mine = tk.servers.filter(x => x.kind === 'auto');
      const u = mine.length ? mine.reduce((a, x) => a + x.rho, 0) / mine.length : 0;
      return { load: u, text: (tk.autoReady || 0) + '/' + (tk.autoCount || 0) + ' inst.' };
    }
    case 'worker': {
      if (dead) return { dead: true, text: 'HORS LIGNE' };
      const n = S.workers.filter(w => w.alive).length || 1;
      const d = (tk.drained.write + tk.drained.upload + tk.drained.pay) / DT / n;
      return { load: d / WORKER_RATE, text: Math.round(d) + ' t/s' };
    }
    case 'cache': {
      if (dead) return { dead: true, text: 'HORS LIGNE' };
      const cold = S.coldStart != null && S.t - S.coldStart < CACHE_WARMUP;
      return { load: tk.hit, text: (cold ? 'froid ' : 'hit ') + pct(tk.hit), noBar: false, good: true, warnTxt: cold };
    }
    case 'queue': {
      if (dead) return { dead: true, text: 'PERDUE' };
      const n = tk.backlog.write + tk.backlog.upload + tk.backlog.pay;
      return { load: Math.min(1, n / QUEUE_GAUGE_MAX), text: fmt(n) + ' en file' };
    }
    case 'pooler': return dead ? { dead: true, text: 'HORS LIGNE' } : { load: Math.min(1, tk.conns / (tk.maxConn || POOLER_GAUGE_MAX)), text: tk.conns + '/' + (tk.maxConn || 0) + ' cx' };
    case 'breaker': return dead ? { dead: true, text: 'HORS LIGNE' } : { load: 0, noBar: true, text: tk.brkOpen ? 'OUVERT' : 'fermé', alarm: tk.brkOpen };
    case 'db': case 'replica': {
      const isPrim = tk.primaryId === id;
      if (dead || tk.nodeRho[id] == null) return { dead: true, text: 'HORS LIGNE' };
      return { load: tk.nodeRho[id], text: (isPrim && b.type === 'replica' ? 'PRIM. ' : '') + pct(tk.nodeRho[id]) };
    }
    case 'objstore': return dead ? { dead: true, text: 'HORS LIGNE' } : { load: 0, noBar: true, text: fmt(tk.T * (mixNow(tk.t).upload || 0)) + ' up/s' };
    case 'lb': return { load: 0, noBar: true, text: fmt(tk.T + tk.botsPass) + ' r/s' };
    case 'cdn': return { load: 0, noBar: true, text: fmt(tk.T * mixNow(tk.t).static) + ' r/s' };
    case 'waf': return { load: 0, noBar: true, text: (S.wafMode === 'strict' ? 'strict' : 'souple') + (tk.bots ? ' −' + fmt(tk.bots - tk.botsPass) : ''), alarm: tk.bots > 0 };
  }
  return null;
}
const mixNow = t => (typeof CUR.level.mix === 'function' ? CUR.level.mix(t) : CUR.level.mix);

function optSummary(b) {
  const o = { ...defaultOpts(b.type), ...(b.opts || {}) };
  switch (b.type) {
    case 'server': return SIZES[o.size].label;
    case 'lb': return { rr: 'Tourniq.', sticky: 'Sticky', least: 'Moins ch.' }[o.algo];
    case 'cache': return { court: 'court', moyen: 'moyen', long: 'long' }[o.ttl] + (o.antiRuee ? '+AR' : '');
    case 'waf': return o.mode;
    case 'autoscale': return o.min + '→' + o.max + ' @' + o.seuil + '%';
    case 'db': return o.legacy ? 'ancienne' : o.sensible ? 'sensible→P' : '';
  }
  return '';
}

function tempSlots() {
  // positions des serveurs ajoutés par carte : cases vides de la rangée appli
  if (!RUN) return [];
  const L = lay(), free = []; L.app.forEach((b, i) => { if (!b) free.push(i); });
  return RUN.S.temps.map((s, k) => ({ s, i: free[k] })).filter(x => x.i != null);
}

function serverPos(id) {
  if (id.startsWith('app')) return center('app', +id.slice(3));
  if (id.startsWith('auto')) { const a = placed('autoscale')[0]; return a ? center(a.row, a.i) : null; }
  if (id.startsWith('tmp')) { const t = tempSlots().find(x => x.s.id === id); return t ? center('app', t.i) : null; }
  return null;
}

function links() {
  const out = [], net = G.internet;
  const P = t => placed(t).map(x => center(x.row, x.i));
  const lb = P('lb')[0], cdn = P('cdn')[0], waf = P('waf')[0];
  const srv = [...P('server'), ...P('autoscale')];
  const svc = [...P('cache'), ...P('pooler')], queue = P('queue')[0], brk = P('breaker')[0];
  const data = [...P('db'), ...P('replica')], obj = P('objstore')[0], wrk = P('worker');
  const entry = waf || net;
  if (waf) out.push([net, waf, .6]);
  if (cdn) out.push([entry, cdn, .5]);
  if (lb) { out.push([entry, lb, .6]); srv.forEach(s => out.push([lb, s, .45])); }
  else if (srv[0]) out.push([entry, srv[0], .6]);
  srv.forEach(s => { svc.forEach(c => out.push([s, c, .14])); if (queue) out.push([s, queue, .14]); data.forEach(d => out.push([s, d, .1])); if (obj) out.push([s, obj, .1]); if (brk) out.push([s, brk, .14]); });
  if (queue) wrk.forEach(w => out.push([queue, w, .35]));
  if (data[0]) wrk.forEach(w => out.push([w, data[0], .25]));
  if (CUR.level.mix && hasPay()) { const from = brk || (srv[0] ? { x: srv[0].x, y: srv[0].y } : null); if (from) out.push([from, G.api, brk ? .45 : .2]); }
  return out;
}
const hasPay = () => { const m = typeof CUR.level.mix === 'function' ? CUR.level.mix(0) : CUR.level.mix; return (m.pay || 0) > 0; };

function pill(x, y, label, dot, alarm) {
  ctx.font = FONT(800, 10);
  const lw = ctx.measureText(label).width + (dot ? 24 : 14);
  ctx.fillStyle = '#1d1b18'; rr(x - lw / 2, y - 12 + 3, lw, 24, 12); ctx.fill();
  ctx.fillStyle = alarm ? '#f8dcd6' : '#fff'; ctx.strokeStyle = '#1d1b18'; ctx.lineWidth = 2; rr(x - lw / 2, y - 12, lw, 24, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d1b18'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + (dot ? 5 : 0), y + 1);
  if (dot) { ctx.beginPath(); ctx.arc(x - lw / 2 + 11, y, 3.5, 0, 7); ctx.fillStyle = dot; ctx.fill(); }
}

function drawLink(a, b, alpha) { ctx.save(); ctx.strokeStyle = `rgba(29,27,24,${alpha})`; ctx.lineWidth = 1.3; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }

function fitText(txt, x, y, maxW, w, size) {
  let sz = size;
  ctx.font = FONT(w, sz);
  while (ctx.measureText(txt).width > maxW && sz > 5.6) { sz -= 0.4; ctx.font = FONT(w, sz); }
  while (ctx.measureText(txt).width > maxW && txt.length > 3) txt = txt.slice(0, -2) + '…';
  ctx.fillText(txt, x, y);
}
function drawBrick(b, s, st, label, extra) {
  const dead = st && st.dead;
  ctx.fillStyle = '#1d1b18'; rr(s.x, s.y + 3, s.w, s.h, 11); ctx.fill();
  ctx.fillStyle = dead ? '#c9c2b4' : (extra && extra.temp ? '#dfeaf5' : COLORS[b.type]);
  ctx.strokeStyle = '#1d1b18'; ctx.lineWidth = 2; rr(s.x, s.y, s.w, s.h, 11); ctx.fill(); ctx.stroke();
  if (st && ((st.load >= 1 && !st.noBar && !st.good) || st.alarm)) { ctx.save(); ctx.strokeStyle = '#d64534'; ctx.lineWidth = 3; ctx.globalAlpha = .5 + .5 * Math.sin(performance.now() / 120); rr(s.x - 3, s.y - 3, s.w + 6, s.h + 6, 13); ctx.stroke(); ctx.restore(); }
  icon(b.type, s.x + s.w / 2, s.y + 17, 18);
  ctx.fillStyle = '#1d1b18'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  fitText(label, s.x + s.w / 2, s.y + 38, s.w - 6, 800, 8.5);
  const line = st ? st.text : (extra && extra.sub) || '';
  ctx.fillStyle = st && (st.alarm || st.dead) ? '#a5281b' : '#3b372f';
  fitText(line, s.x + s.w / 2, s.y + 50, s.w - 6, 600, 7.6);
  if (b.locked) { ctx.font = FONT(800, 8); ctx.fillText('🔒', s.x + 8, s.y + 11); }
  if (extra && extra.region) {
    ctx.font = FONT(800, 7); const t = REGION_SHORT[extra.region]; const tw = ctx.measureText(t).width + 6;
    ctx.fillStyle = REG_COLORS[extra.region]; rr(s.x + s.w - tw - 3, s.y + 3, tw, 11, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t, s.x + s.w - tw / 2 - 3, s.y + 9); ctx.textBaseline = 'alphabetic';
  }
  if (st && !st.noBar && !st.dead && st.load != null) {
    const bw = s.w - 14, l = Math.min(1, st.load);
    ctx.fillStyle = 'rgba(29,27,24,.15)'; rr(s.x + 7, s.y + s.h + 6, bw, 4, 2); ctx.fill();
    ctx.fillStyle = st.good ? '#2f9e5b' : st.load >= 1 ? '#d64534' : st.load > .75 ? '#e08a1e' : '#2f9e5b';
    rr(s.x + 7, s.y + s.h + 6, Math.max(2, bw * l), 4, 2); ctx.fill();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const L = lay(), lv = CUR.level;
  for (const [a, b, al] of links()) drawLink(a, b, al);
  const tk = RUN && RUN.tk;
  const T = tk ? tk.T : lv.rps * lv.profile(0);
  pill(G.internet.x, G.internet.y, 'INTERNET · ' + fmt(T) + ' r/s' + (tk && tk.bots ? ' + ' + fmt(tk.bots) + ' bots' : ''), RUN ? (tk && tk.bots ? '#d64534' : '#2f9e5b') : '#7a7266', tk && tk.bots > 0);
  if (hasPay()) { const bad = tk && tk.api && (tk.api.lat > API_BAD_LAT || tk.api.err > API_BAD_ERR); pill(G.api.x, G.api.y, 'API €', bad ? '#d64534' : tk ? '#2f9e5b' : '#7a7266', bad); }
  const letters = 'ABCDE';
  let srvIdx = 0;
  const regs = regionsOf(lv);
  for (const r of ROW_DEF) {
    const R = G.rows[r.key];
    ctx.fillStyle = '#7a7266'; ctx.font = FONT(600, 8.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(r.label, R.slots[0].x, R.labelY + 8);
    R.slots.forEach((s, i) => {
      const b = L[r.key][i];
      if (!b) {
        const tmp = r.key === 'app' && tempSlots().find(x => x.i === i);
        if (tmp) {
          const sv = RUN.tk && RUN.tk.servers.find(x => x.id === tmp.s.id);
          const st = !tmp.s.alive ? { dead: true, text: 'HORS SERVICE' } : RUN.S.t < tmp.s.readyAt ? { text: 'démarre…', load: 0 } : { load: sv ? sv.rho : 0, text: sv ? Math.round(sv.rho * 100) + ' %' : '' };
          drawBrick({ type: 'server' }, s, st, 'RENFORT', { temp: true });
          return;
        }
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(29,27,24,.3)'; ctx.lineWidth = 1.4; rr(s.x, s.y, s.w, s.h, 11); ctx.stroke(); ctx.restore();
        if (!RUN) { ctx.fillStyle = 'rgba(29,27,24,.3)'; ctx.font = FONT(400, 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', s.x + s.w / 2, s.y + s.h / 2); }
        return;
      }
      const st = liveNode(b, r.key, i);
      let label = CATALOG[b.type].short;
      if (b.type === 'server') label = 'SRV ' + letters[srvIdx++];
      if (b.type === 'replica' && RUN && RUN.tk && RUN.tk.primaryId === r.key + i) label = 'PRIMAIRE';
      if (b.type === 'db' && b.opts && b.opts.legacy) label = 'ANCIENNE';
      drawBrick(b, s, st, label, { sub: (optSummary(b) ? optSummary(b) + ' · ' : '') + brickCost(b) + '€', region: regs && !GLOBAL.includes(b.type) ? (b.region || regs[0]) : null });
    });
  }
  for (const p of particles) { ctx.beginPath(); ctx.arc(p.x, p.y, p.bot ? 2.4 : 2.8, 0, 7); ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha; ctx.fill(); ctx.globalAlpha = 1; }
  for (const b of bursts) {
    ctx.save(); ctx.globalAlpha = 1 - b.age / .5; ctx.strokeStyle = b.color || '#d64534'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x - 4, b.y - 4); ctx.lineTo(b.x + 4, b.y + 4); ctx.moveTo(b.x + 4, b.y - 4); ctx.lineTo(b.x - 4, b.y + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, 4 + b.age * 20, 0, 7); ctx.stroke(); ctx.restore();
  }
  if (RUN && tk) { ctx.font = FONT(700, 10); ctx.textAlign = 'left'; ctx.fillStyle = '#1d1b18'; ctx.textBaseline = 'middle'; ctx.fillText(Math.floor(tk.t) + '/' + lv.duration + ' s', 4, G.internet.y); }
}

// ---------- particules ----------
const jit = (p, a = 9) => ({ x: p.x + (Math.random() - .5) * a * 2, y: p.y + (Math.random() - .5) * a });
function spawn() {
  const S = RUN.S, tk = RUN.tk, lv = CUR.level;
  const pts = [jit(G.internet, 40)];
  const P = t => placed(t).map(x => center(x.row, x.i));
  const alive = id => { const b = S.bricks.find(x => x.id === id); return b && b.alive; };
  const at = (t) => { const q = placed(t).filter(x => alive(x.row + x.i)); return q.length ? jit(center(q[0].row, q[0].i)) : null; };
  const done = (fail, col) => ({ pts, fail, color: fail ? '#d64534' : '#2f9e5b' });
  // bots
  const isBot = tk.bots > 0 && Math.random() < tk.bots / (tk.bots + tk.T);
  const waf = at('waf');
  if (waf) pts.push(waf);
  if (isBot) {
    if (waf && Math.random() > tk.botsPass / Math.max(1, tk.bots)) return { pts, fail: true, bot: true, color: '#8e44ad', blockColor: '#8e44ad' };
  } else if (waf && Math.random() < tk.vis.blockedFrac) return done(true);
  const m = mixNow(tk.t);
  const rnd = Math.random();
  let c = 'read', acc = 0;
  for (const k of CLASSES) { acc += m[k] || 0; if (rnd < acc) { c = k; break; } }
  if (isBot) c = 'read';
  if (c === 'static' && at('cdn')) { pts.push(at('cdn')); return done(false); }
  if (c === 'reco' && S.recoOff) return null;
  const lb = at('lb');
  if (lb) pts.push(lb);
  const recv = tk.servers.filter(x => x.receiving);
  if (!recv.length) { const sp = placed('server')[0]; if (sp) pts.push(jit(center(sp.row, sp.i))); else pts.push({ x: W / 2, y: G.rows.app.slots[0].y + 28 }); return done(true); }
  const sv = recv[Math.floor(Math.random() * recv.length)];
  const sp = serverPos(sv.id); if (sp) pts.push(jit(sp));
  const r = sets().retries;
  const served = sv.rho > 1 ? (r > 0 ? Math.max(0, 2 / sv.rho - 1) : 1 / sv.rho) : 1;
  if (Math.random() > served) return done(true);
  if (c === 'static') return done(false);
  if (!isBot && Math.random() < tk.vis.sessFrac) return done(true);
  const dbNodes = tk.dbNodes;
  const toDb = (fresh) => {
    if (!dbNodes.length) return done(true);
    if (Math.random() < tk.vis.connFail && at('pooler')) pts.push(at('pooler'));
    if (Math.random() < tk.vis.connFail) return done(true);
    const n = fresh && dbNodes[0].kind === 'p' && dbNodes.length && (S.primary && S.primary.brick.opts.sensible) ? dbNodes[0] : dbNodes[Math.floor(Math.random() * dbNodes.length)];
    const [row, i] = [n.id.replace(/\d+$/, ''), +n.id.match(/\d+$/)[0]];
    pts.push(jit(center(row, i)));
    if (Math.random() > n.served) return done(true);
    if (fresh && n.kind === 'r' && Math.random() < tk.vis.pStale) return done(true);
    return done(false);
  };
  if (c === 'upload') { const o = at('objstore'); if (o) { pts.push(o); return done(false); } return done(false); }
  if (c === 'pay') {
    const brk = at('breaker'); if (brk) pts.push(brk);
    if (tk.brkOpen) { const q = at('queue'); if (q && S.workers.some(w => w.alive)) { pts.push(q); return done(false); } return done(true); }
    pts.push(jit(G.api, 6));
    const to = sets().timeout === 'court' ? TIMEOUT_SHORT : TIMEOUT_LONG;
    return done(tk.api.lat > to || Math.random() < tk.api.err);
  }
  if (c === 'write') { const q = at('queue'); if (q) { pts.push(q); return done(false); } return toDb(false); }
  const fresh = c === 'read' && Math.random() < (lv.fresh || 0);
  if (!fresh && !isBot) { const ca = at('cache'); if (ca) { pts.push(ca); if (Math.random() < tk.hit) return done(false); } }
  return toDb(fresh);
}
function spawnJob() {
  const q = placed('queue')[0], w = placed('worker'), d = RUN.tk.dbNodes[0];
  if (!q || !w.length) return;
  const wk = w[Math.floor(Math.random() * w.length)];
  const pts = [jit(center(q.row, q.i)), jit(center(wk.row, wk.i))];
  if (d && RUN.tk.drained.write > 0 && Math.random() < RUN.tk.drained.write / Math.max(1e-9, RUN.tk.drained.write + RUN.tk.drained.upload + RUN.tk.drained.pay)) {
    const [row, i] = [d.id.replace(/\d+$/, ''), +d.id.match(/\d+$/)[0]]; pts.push(jit(center(row, i)));
  }
  particles.push({ pts, fail: false, color: '#b08900', seg: 0, prog: 0, x: pts[0].x, y: pts[0].y, alpha: 1, job: true });
}
function stepParticles(dt) {
  for (const p of particles) {
    if (p.dead) { p.alpha -= dt * 3; continue; }
    let move = 300 * dt;
    while (move > 0 && p.seg < p.pts.length - 1) {
      const a = p.pts[p.seg], b = p.pts[p.seg + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, rem = len * (1 - p.prog);
      if (move >= rem) { move -= rem; p.seg++; p.prog = 0; } else { p.prog += move / len; move = 0; }
    }
    if (p.seg >= p.pts.length - 1) {
      const l = p.pts[p.pts.length - 1]; p.x = l.x; p.y = l.y; p.dead = true;
      if (p.fail) { bursts.push({ x: p.x, y: p.y, age: 0, color: p.bot ? '#8e44ad' : '#d64534' }); p.alpha = 0; }
      else if (!p.job) p.color = '#2f9e5b';
    } else { const a = p.pts[p.seg], b = p.pts[p.seg + 1]; p.x = a.x + (b.x - a.x) * p.prog; p.y = a.y + (b.y - a.y) * p.prog; }
  }
  particles = particles.filter(p => p.alpha > 0);
  bursts.forEach(b => (b.age += dt)); bursts = bursts.filter(b => b.age < .5);
}

// ---------- panneaux ----------
let toastH;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastH); toastH = setTimeout(() => t.classList.remove('on'), 2400); }
function openSheet(html, after) { $('sheet').innerHTML = html; $('sheet').classList.add('on'); $('scrim').classList.add('on'); if (after) after($('sheet')); }
function closeAll() { $('sheet').classList.remove('on'); $('modal').classList.remove('on'); $('scrim').classList.remove('on'); }
$('scrim').onclick = closeAll;

function changed() { ST.lastRes && delete ST.lastRes[CUR.key]; save(); renderGoals(null); }

function addSheet(row, i) {
  const lv = CUR.level, L = lay(), r = ROW_DEF.find(x => x.key === row);
  const types = Object.keys(CATALOG).filter(t => CATALOG[t].row === row && lv.bricks.includes(t));
  let html = `<h3><span>Poser dans « ${r.label.toLowerCase()} »</span><span>✕</span></h3>`;
  const reasons = {};
  for (const t of types) {
    if (CATALOG[t].unique && hasType(L, t)) reasons[t] = 'Déjà en place.';
    if (t === 'replica' && !hasType(L, 'db')) reasons[t] = 'Il faut d’abord une base primaire à copier.';
    if (t === 'db' && hasType(L, 'db')) continue;
    html += `<button class="opt" data-t="${t}" ${reasons[t] ? 'disabled' : ''}><span class="sw" style="background:${COLORS[t]}">${CATALOG[t].short}</span><span><b>${CATALOG[t].name}</b><p>${reasons[t] || CATALOG[t].desc}</p></span><span class="price">${t === 'server' ? 'dès 25' : CATALOG[t].cost(defaultOpts(t))} €</span></button>`;
  }
  if (!types.length) html += '<p class="desc">Rien à poser ici dans cette mission.</p>';
  openSheet(html, el => {
    el.querySelector('h3 span:last-child').onclick = closeAll;
    el.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const t = btn.dataset.t; const b = { type: t, opts: defaultOpts(t) };
      const regs = regionsOf(lv); if (regs) b.region = regs[0];
      if (t === 'lb' && !lbAlgosOf(lv).includes(b.opts.algo)) b.opts.algo = lbAlgosOf(lv)[0];
      L[row][i] = b; changed(); closeAll();
      if (CATALOG[t].opts || (regs && !GLOBAL.includes(t))) editSheet(row, i);
    });
  });
}

function editSheet(row, i) {
  const lv = CUR.level, L = lay(), b = L[row][i];
  const regs = regionsOf(lv);
  const render = () => {
    const o = { ...defaultOpts(b.type), ...(b.opts || {}) };
    let html = `<h3><span>${CATALOG[b.type].name}</span><span>${brickCost(b)} € ✕</span></h3><p class="desc">${CATALOG[b.type].desc}</p>`;
    for (const d of OPT_DEFS[b.type] || []) {
      if (d.k === 'legacy') continue;
      if (b.type === 'server' && d.k === 'size' && !lv.sizes) continue;
      let choices = d.choices;
      if (b.type === 'lb') choices = choices.filter(c => lbAlgosOf(lv).includes(c[0]));
      if (b.type === 'db' && d.k === 'sensible' && !(lv.bricks.includes('replica'))) continue;
      if (b.opts && b.opts.legacy) continue;
      html += `<div class="grp"><div class="lab">${d.label}</div><div class="seg">${choices.map(c => `<button data-k="${d.k}" data-v='${JSON.stringify(c[0])}' class="${o[d.k] === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div><div class="help">${d.help ? d.help[String(o[d.k])] || '' : ''}</div></div>`;
    }
    if (regs && !GLOBAL.includes(b.type)) html += `<div class="grp"><div class="lab">Région</div><div class="seg">${regs.map(g => `<button data-reg="${g}" class="${(b.region || regs[0]) === g ? 'on' : ''}">${REGION_NAMES[g]}</button>`).join('')}</div></div>`;
    if (!b.locked) html += `<button class="opt rm" id="rmB"><span class="sw" style="background:#fff">✕</span><span><b>Retirer</b><p>Libère la case.</p></span><span class="price">−${brickCost(b)} €</span></button>`;
    else html += `<p class="desc">🔒 Cette brique fait partie de l’héritage : impossible de la retirer.</p>`;
    openSheet(html, el => {
      el.querySelector('h3 span:last-child').onclick = closeAll;
      el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { b.opts = { ...o, [x.dataset.k]: JSON.parse(x.dataset.v) }; changed(); render(); });
      el.querySelectorAll('[data-reg]').forEach(x => x.onclick = () => { b.region = x.dataset.reg; changed(); render(); });
      const rm = el.querySelector('#rmB');
      if (rm) rm.onclick = () => {
        L[row][i] = null;
        if (b.type === 'db' && L.data.some(x => x && x.type === 'replica')) { L.data = L.data.map(x => (x && x.type === 'replica' ? null : x)); toast('Sans base primaire, les répliques n’ont rien à copier : retirées aussi.'); }
        changed(); closeAll();
      };
    });
  };
  render();
}

const SET_DEFS = {
  retries: { label: 'Nouveaux essais', choices: [[0, 'Aucun'], [1, '1'], [2, '2']], help: { 0: 'Une requête qui échoue est perdue.', 1: 'Un nouvel essai (+300 ms). Sauve les erreurs passagères, mais sur des serveurs saturés chaque essai s’ajoute à la file et la saturation s’emballe.', 2: 'Deux nouveaux essais (+300 ms chacun). Encore plus efficace contre les erreurs passagères, encore plus dangereux en saturation.' } },
  timeout: { label: 'Timeout des appels externes', choices: [['court', '0,8 s'], ['long', '5 s']], help: { court: 'On abandonne vite : un serveur n’attend jamais plus de 0,8 s.', long: 'On attend jusqu’à 5 s : aucun paiement lent n’échoue, mais les serveurs restent bloqués pendant ce temps.' } },
  shed: { label: 'Délestage des recos', choices: [[false, 'Non'], [true, 'Oui']], help: { false: 'Quand ça sature, toutes les requêtes échouent pareil.', true: 'Au-delà de 90 % de charge, les recommandations sont rejetées en premier.' } },
};
function settingsSheet() {
  const al = CUR.level.settingsAllowed || [];
  const render = () => {
    const s = sets();
    let html = `<h3><span>Réglages de l’appli</span><span>✕</span></h3>`;
    for (const k of al) { const d = SET_DEFS[k]; html += `<div class="grp"><div class="lab">${d.label}</div><div class="seg">${d.choices.map(c => `<button data-k="${k}" data-v='${JSON.stringify(c[0])}' class="${s[k] === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div><div class="help">${d.help[String(s[k])]}</div></div>`; }
    openSheet(html, el => {
      el.querySelector('h3 span:last-child').onclick = () => { closeAll(); renderTools(); };
      el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { s[x.dataset.k] = JSON.parse(x.dataset.v); changed(); render(); renderTools(); });
    });
  };
  render();
}

board.addEventListener('click', e => {
  if (RUN) return;
  const rect = board.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
  for (const r of ROW_DEF) G.rows[r.key].slots.forEach((s, i) => {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) (lay()[r.key][i] ? editSheet : addSheet)(r.key, i);
  });
});

// ---------- rendu de l'écran ----------
function renderTop() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.m === ST.mode));
  const top = $('top');
  if (ST.mode === 'missions') {
    top.innerHTML = '<div class="levels" id="levels"></div>';
    const box = $('levels');
    LEVELS.forEach((lv, i) => {
      const st = ST.stars[lv.id] || 0;
      const unlocked = missionUnlocked(LEVELS, ST.stars, i, ST.level);
      const b = document.createElement('button');
      b.className = 'lvl' + (i === ST.level ? ' cur' : '') + (unlocked ? '' : ' locked');
      b.innerHTML = (i + 1) + '<small>' + '★'.repeat(st) + '☆'.repeat(3 - st) + '</small>';
      b.onclick = () => { if (RUN) return; ST.level = i; save(); refresh(); };
      box.appendChild(b);
      if (i === ST.level) setTimeout(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
    });
  } else if (ST.mode === 'camp') {
    const c = ST.camp;
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">Tour</div><div class="v">${c.round}</div><div class="t">record ${ST.campBest || 0}</div></div><div class="goal"><div class="k">Trésorerie</div><div class="v" style="color:${c.cash < 0 ? 'var(--bad)' : 'inherit'}">${fmt(c.cash)} €</div><div class="t">démarre à 300</div></div><div class="goal"><div class="k">Revenu max</div><div class="v">${fmt(campRevenue(CUR.level, 100, 0))} €</div><div class="t">si dispo ≥ 99 %</div></div></div>`;
  } else {
    const d = ST.daily[CUR.key];
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">Défi du jour</div><div class="v">${CUR.date.split('-').reverse().join('/')}</div><div class="t">même défi pour tout le monde</div></div><div class="goal"><div class="k">Ton record</div><div class="v">${d && d.best ? d.best + ' €' : '–'}</div><div class="t">le moins cher gagne</div></div></div>`;
  }
}

function goalTiles(res) {
  const lv = CUR.level, g = lv.goals, cost = layoutCost(lay());
  const met = res ? goalsMet(lv, res) : null;
  const tiles = [];
  tiles.push({ k: 'Disponibilité', v: res ? res.avail.toFixed(1) + ' %' : '?', t: '≥ ' + g.avail + ' %', s: met ? met.avail : null, id: 'avail' });
  tiles.push({ k: 'Latence p95', v: res ? (res.ok ? Math.round(res.p95) + ' ms' : '–') : '?', t: '≤ ' + g.p95 + ' ms', s: met ? met.p95 : null, id: 'p95' });
  const usage = !res && hasType(lay(), 'autoscale') ? '+' : '';
  if (g.budget != null) { const c = res ? res.cost : cost; tiles.push({ k: 'Budget', v: c + ' €' + usage, t: '≤ ' + g.budget + ' €', s: c > g.budget ? false : res ? true : null, id: 'budget' }); }
  else tiles.push({ k: 'Coût', v: (res ? res.cost : cost) + ' €', t: CUR.kind === 'daily' ? 'à minimiser' : 'payé chaque tour', s: null, id: 'budget' });
  if (g.fresh != null) tiles.push({ k: 'Fraîcheur', v: res ? res.fresh.toFixed(1) + ' %' : '?', t: '≥ ' + g.fresh + ' %', s: met ? met.fresh : null, id: 'fresh' });
  if (g.recos != null) tiles.push({ k: 'Recos servies', v: res ? Math.round(res.recos) + ' %' : '?', t: '≥ ' + g.recos + ' %', s: met ? met.recos : null, id: 'recos' });
  return tiles;
}
function renderGoals(res) {
  $('goals').innerHTML = goalTiles(res).map(x => `<div class="goal ${x.s === true ? 'ok' : x.s === false ? 'ko' : ''}" id="g-${x.id}"><div class="k">${x.k}</div><div class="v">${x.v}</div><div class="t">${x.t}</div></div>`).join('');
  const cost = layoutCost(lay()), g = CUR.level.goals;
  $('costK').textContent = CUR.kind === 'camp' ? 'Coût par tour' : 'Coût mensuel';
  const auto = hasType(lay(), 'autoscale') ? ' + usage' : '';
  $('cost').textContent = cost + ' €' + auto + (g.budget != null ? ' / ' + g.budget + ' €' : '');
  $('costBox').classList.toggle('over', g.budget != null && cost > g.budget);
}
function renderTools() {
  const lv = CUR.level, al = lv.settingsAllowed || [], s = sets();
  let html = '';
  if (al.length) {
    const bits = [];
    if (al.includes('retries')) bits.push('essais ' + s.retries);
    if (al.includes('timeout')) bits.push('timeout ' + (s.timeout === 'court' ? '0,8 s' : '5 s'));
    if (al.includes('shed')) bits.push('délestage ' + (s.shed ? 'oui' : 'non'));
    html += `<button class="chip" id="setBtn">⚙ ${bits.join(' · ')}</button>`;
  }
  const cards = Object.entries(lv.cards || {}).filter(([, n]) => n > 0);
  if (cards.length) html += `<button class="chip" id="cardsInfo">🃏 ${cards.map(([k, n]) => CARDS[k].name + (n > 1 ? ' ×' + n : '')).join(', ')}</button>`;
  if (CUR.kind !== 'camp') html += `<button class="chip" id="resetBtn">↺ Repartir de zéro</button>`;
  $('tools').innerHTML = html;
  if ($('setBtn')) $('setBtn').onclick = () => !RUN && settingsSheet();
  if ($('cardsInfo')) $('cardsInfo').onclick = () => openSheet(`<h3><span>Cartes d’action</span><span>✕</span></h3><p class="desc">Elles apparaissent pendant le run, à jouer au bon moment.</p>` + cards.map(([k, n]) => `<div class="opt"><span class="sw" style="background:#fff7e6">${n}</span><span><b>${CARDS[k].name}</b><p>${CARDS[k].desc}</p></span></div>`).join(''), el => (el.querySelector('h3 span:last-child').onclick = closeAll));
  if ($('resetBtn')) $('resetBtn').onclick = () => { if (RUN) return; ST.layouts[CUR.key] = lv.preset ? cloneLayout(lv.preset) : emptyLayout(); changed(); };
}
function refresh() {
  buildCtx(); renderTop();
  $('title').textContent = CUR.level.title;
  $('crumb').textContent = CUR.kind === 'mission' ? (ST.level + 1) + ' / ' + LEVELS.length : CUR.kind === 'camp' ? 'Croissance' : 'Défi';
  $('story').textContent = CUR.level.story;
  renderGoals(ST.lastRes && ST.lastRes[CUR.key]); renderTools();
  $('hint').textContent = 'Touche une case pour poser une brique, une brique pour la régler.';
  particles = []; bursts = [];
  layout();
}
document.querySelectorAll('.tab').forEach(t => (t.onclick = () => { if (RUN) return; ST.mode = t.dataset.m; save(); refresh(); }));

// ---------- run ----------
$('run').onclick = () => { if (RUN) { RUN.skip = true; return; } startRun(); };
$('speed').onclick = () => { if (!RUN) return; RUN.speed = RUN.speed === 2 ? 1 : 2; $('speed').textContent = '×' + RUN.speed; };
function startRun() {
  const S = makeSim(CUR.level, lay(), sets());
  RUN = { S, tk: null, speed: 2, acc: 0, logN: 0, spawnAcc: 0, jobAcc: 0 };
  stepSim(S); RUN.tk = S.ticks[S.ticks.length - 1];
  particles = []; bursts = [];
  $('run').textContent = 'Passer ⏭'; $('run').classList.remove('go'); $('speed').style.display = ''; $('speed').textContent = '×2';
  $('hint').textContent = 'Points noirs : requêtes. ✕ rouge : perdue. Violet : bots.';
  renderCards();
}
function renderCards() {
  const S = RUN && RUN.S, box = $('cards');
  const entries = S ? Object.entries(S.cards).filter(([k]) => (CUR.level.cards || {})[k]) : [];
  box.classList.toggle('on', entries.length > 0);
  box.innerHTML = entries.map(([k, n]) => `<button class="cardbtn" data-c="${k}" ${n ? '' : 'disabled'}>${CARDS[k].name} ×${n}<small>${CARDS[k].desc}</small></button>`).join('');
  box.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { if (!RUN) return; const r = useCard(RUN.S, b.dataset.c); toast(r.msg); renderCards(); }));
}
function liveGoals() {
  const S = RUN.S, a = S.acc;
  const avail = a.total ? Math.max(0, a.ok / a.total * 100) : 100;
  const el = $('g-avail'); if (el) el.querySelector('.v').textContent = avail.toFixed(1) + ' %';
}
function endRun() {
  const S = RUN.S;
  while (!S.done) stepSim(S);
  const res = resultOf(S);
  RUN = null; particles = []; bursts = [];
  $('cards').classList.remove('on'); $('speed').style.display = 'none';
  $('run').textContent = 'Lancer ▶'; $('run').classList.add('go');
  $('hint').textContent = 'Touche une case pour poser une brique, une brique pour la régler.';
  (ST.lastRes ||= {})[CUR.key] = { avail: res.avail, p95: res.p95, cost: res.cost, fresh: res.fresh, recos: res.recos, ok: res.ok };
  renderGoals(res);
  showResult(res);
}
function diagHtml(res) {
  const reasons = Object.entries(res.reasons).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / res.total > DIAG_MIN_SHARE).slice(0, 3);
  let h = '';
  if (reasons.length) h += '<div class="diag"><b>Ce qui a lâché</b>' + reasons.map(([k, n]) => `<div>✕ ${REASONS[k]} <span style="color:#7a7266">(${(n / res.total * 100).toFixed(1)} %)</span></div>`).join('') + '</div>';
  if (res.log.length) h += '<div class="diag"><b>Chronologie</b>' + res.log.slice(0, 8).map(l => `<div>${l.t.toFixed(0)} s · ${l.msg}</div>`).join('') + '</div>';
  return h;
}
function row(k, v, t, ok) { return `<div class="row"><span>${k}</span><span>${v} ${ok == null ? '' : `<span class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✕'}</span>`} <span style="color:#7a7266">${t}</span></span></div>`; }
function showModal(html, bind) { $('modal').innerHTML = html; $('modal').classList.add('on'); $('scrim').classList.add('on'); bind && bind($('modal')); }

function showResult(res) {
  const lv = CUR.level, g = lv.goals, met = goalsMet(lv, res);
  const rows = row('Disponibilité', res.avail.toFixed(2) + ' %', '≥ ' + g.avail, met.avail) + row('Latence p95', res.ok ? Math.round(res.p95) + ' ms' : '–', '≤ ' + g.p95, met.p95)
    + (g.budget != null ? row('Coût', res.cost + ' €', '≤ ' + g.budget, met.budget) : row('Coût', res.cost + ' €' + (res.autoAvg ? ` (dont autoscaling ${res.autoAvg.toFixed(1)} inst. en moyenne)` : ''), '', null))
    + (g.fresh != null ? row('Fraîcheur', res.fresh.toFixed(1) + ' %', '≥ ' + g.fresh, met.fresh) : '')
    + (g.recos != null ? row('Recos servies', Math.round(res.recos) + ' %', '≥ ' + g.recos, met.recos) : '');
  if (CUR.kind === 'mission') {
    const stars = missionStars(met);
    if (stars > (ST.stars[lv.id] || 0)) ST.stars[lv.id] = stars;
    save(); renderTop();
    const next = ST.level < LEVELS.length - 1;
    showModal(`<h2>${met.win ? 'Ça tient !' : stars ? 'Presque…' : 'Ça n’a pas tenu'}</h2><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>${rows}${diagHtml(res)}
      <div class="actions"><button class="btn light" id="mClose">Modifier l’infra</button>${met.win && next ? '<button class="btn go" id="mNext">Suivante →</button>' : ''}</div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      const n = el.querySelector('#mNext'); if (n) n.onclick = () => { closeAll(); ST.level++; save(); refresh(); };
    });
  } else if (CUR.kind === 'daily') {
    const d = (ST.daily[CUR.key] ||= {});
    let best = '';
    if (isDailyRecord(met, res, d.best)) { d.best = res.cost; best = '<p class="desc" style="font-size:12px;margin:8px 0">🏆 Nouveau record !</p>'; }
    save(); renderTop();
    const share = `Tenir la charge · ${lv.title} · ${met.win ? res.cost + ' €/mois ✓' : 'pas tenu'} (dispo ${res.avail.toFixed(2)} %, p95 ${Math.round(res.p95)} ms)`;
    showModal(`<h2>${met.win ? 'Défi tenu' : 'Ça n’a pas tenu'}</h2>${best}${rows}${diagHtml(res)}<div class="actions"><button class="btn light" id="mClose">Retenter</button><button class="btn" id="mCopy">Copier le score</button></div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      el.querySelector('#mCopy').onclick = () => { try { navigator.clipboard.writeText(share).then(() => toast('Score copié'), () => toast(share)); } catch (e) { toast(share); } };
    });
  } else {
    const c = ST.camp;
    const { rev, net, cash, brokeBy } = campOutcome(lv, res, c.cash);
    const lost = brokeBy != null;
    const why = brokeBy === 'avail' ? 'Trop de pannes : les clients sont partis.' : brokeBy === 'cash' ? 'Trésorerie à sec.' : '';
    const html = `<h2>${lost ? 'Faillite' : 'Tour ' + c.round + ' passé'}</h2>${rows}
      <div class="diag"><b>Bilan du tour</b><div>Revenu : +${fmt(rev)} €${res.avail < 99 ? ' (amputé par les pannes)' : ''}${res.p95 > lv.goals.p95 ? ' (−30 % pour la lenteur)' : ''}</div><div>Infra : −${fmt(res.cost)} €</div><div><b style="display:inline;color:inherit;font-size:11px;letter-spacing:0;text-transform:none">Net : ${net >= 0 ? '+' : ''}${fmt(net)} € → trésorerie ${fmt(cash)} €</b></div>${lost ? `<div>✕ ${why}</div>` : ''}</div>${diagHtml(res)}
      <div class="actions">${lost ? '<button class="btn go" id="mNew">Nouvelle partie</button>' : '<button class="btn light" id="mRetry">Rejouer le tour</button><button class="btn go" id="mNext">Tour suivant →</button>'}</div>`;
    showModal(html, el => {
      if (lost) {
        ST.campBest = campRecord(ST.campBest, c); save();
        el.querySelector('#mNew').onclick = () => { closeAll(); newCamp(randomSeed()); if (ST.lastRes) delete ST.lastRes.camp; save(); refresh(); };
      } else {
        el.querySelector('#mRetry').onclick = closeAll;
        el.querySelector('#mNext').onclick = () => {
          const before = new Set(campLevel().bricks);
          ST.camp = nextRound(c, { cash, net, avail: res.avail }); if (ST.lastRes) delete ST.lastRes.camp;
          ST.campBest = campRecord(ST.campBest, ST.camp);
          closeAll(); save(); refresh();
          const fresh = CUR.level.bricks.filter(t => !before.has(t));
          if (fresh.length) toast('Nouvelles briques : ' + fresh.map(t => CATALOG[t].name).join(', '));
        };
      }
    });
  }
}

// ---------- boucle ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (RUN) {
    const S = RUN.S;
    if (RUN.skip) { endRun(); }
    else {
      RUN.acc += dt * RUN.speed;
      while (RUN.acc >= DT && !S.done) { RUN.acc -= DT; stepSim(S); RUN.tk = S.ticks[S.ticks.length - 1]; }
      while (RUN.logN < S.log.length) toast(S.log[RUN.logN++].msg);
      const tk = RUN.tk;
      RUN.spawnAcc += Math.min(70, 10 + (tk.T + tk.bots) / 30) * dt;
      while (RUN.spawnAcc >= 1) { RUN.spawnAcc--; const p = spawn(); if (p) particles.push({ ...p, seg: 0, prog: 0, x: p.pts[0].x, y: p.pts[0].y, alpha: 1, color: p.bot ? '#8e44ad' : '#1d1b18' }); }
      const jobs = tk.drained.write + tk.drained.upload + tk.drained.pay;
      if (jobs > 0) { RUN.jobAcc += Math.min(12, jobs / DT / 40) * dt; while (RUN.jobAcc >= 1) { RUN.jobAcc--; spawnJob(); } }
      liveGoals();
      if (S.done) endRun();
    }
  }
  stepParticles(dt);
  draw();
  requestAnimationFrame(frame);
}
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
window.addEventListener('resize', layout);
refresh();
document.fonts && document.fonts.ready.then(() => draw());
requestAnimationFrame(frame);
