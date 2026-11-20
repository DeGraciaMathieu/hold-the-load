import { DT, SIZES, API_BAD_LAT, API_BAD_ERR, CACHE_WARMUP, WORKER_RATE, QUEUE_GAUGE_MAX, POOLER_GAUGE_MAX } from '../config.js';
import { ROW_DEF, CATALOG, GLOBAL } from '../content/catalog.js';
import { REGION_SHORT } from '../content/texts.js';
import { defaultOpts, brickCost } from '../rules/layout.js';
import { CUR, RUN, lay, regionsOf, mixNow, hasPay } from '../state/context.js';
import { fmt } from './dom.js';
import { ctx, W, H, G, FONT, center, placed, rr, tempSlots } from './geometry.js';
import { particles, bursts } from './particles.js';

export const COLORS = { lb: '#f4a259', cdn: '#b8a1e3', waf: '#e7a3b8', server: '#9cc3e6', autoscale: '#7fb0e0', worker: '#a9d3cf', cache: '#ef8a7c', queue: '#f2d36b',
  pooler: '#d9c89c', breaker: '#f0b27a', db: '#8fd1a6', replica: '#c4e6cf', objstore: '#c9c3e8' };
const REG_COLORS = { eu: '#3b6fd8', us: '#c0392b', asia: '#d18a00' };

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

function pill(x, y, label, dot, alarm) {
  ctx.font = FONT(800, 10);
  const lw = ctx.measureText(label).width + (dot ? 24 : 14);
  ctx.fillStyle = '#1d1b18'; rr(x - lw / 2, y - 12 + 3, lw, 24, 12); ctx.fill();
  ctx.fillStyle = alarm ? '#f8dcd6' : '#fff'; ctx.strokeStyle = '#1d1b18'; ctx.lineWidth = 2; rr(x - lw / 2, y - 12, lw, 24, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d1b18'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + (dot ? 5 : 0), y + 1);
  if (dot) { ctx.beginPath(); ctx.arc(x - lw / 2 + 11, y, 3.5, 0, 7); ctx.fillStyle = dot; ctx.fill(); }
}

// Libellé Internet le plus complet qui tient entre le chrono (à gauche) et la pastille API (à droite).
function internetLabel(T, bots, timer) {
  ctx.font = FONT(700, 10);
  const left = G.grid.x + (timer ? ctx.measureText(timer).width + 6 : 0);
  ctx.font = FONT(800, 10);
  const right = hasPay() ? G.api.x - (ctx.measureText('API €').width + 24) / 2 - 6 : G.grid.x + G.grid.w;
  const room = 2 * Math.min(G.internet.x - left, right - G.internet.x);
  const traffic = fmt(T) + ' r/s' + (bots ? ' + ' + fmt(bots) + ' bots' : '');
  const full = 'INTERNET · ' + traffic;
  return ctx.measureText(full).width + 24 <= room ? full : traffic;
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
  const lift = extra && extra.lift ? LIFT : 0;
  if (lift) s = { ...s, y: s.y - lift };
  const dead = st && st.dead;
  ctx.fillStyle = '#1d1b18'; rr(s.x, s.y + 3 + lift, s.w, s.h, 11); ctx.fill();
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

// Hors run et sans particule, le plateau ne bouge pas : on ne le redessine qu'après un changement signalé.
let dirty = true;
export const invalidate = () => { dirty = true; };
let hover = null; // case survolée à la souris, hors run
const hovered = (row, i) => !RUN && hover?.row === row && hover?.i === i;
const LIFT = 2; // px dont une case survolée se soulève, son ombre s'allonge d'autant
export function setHover(slot) {
  if (hover?.row === slot?.row && hover?.i === slot?.i) return;
  hover = slot; invalidate();
}
export function drawIfNeeded() {
  if (!dirty && !RUN && !particles.length && !bursts.length) return;
  dirty = false; draw();
}

export function draw() {
  ctx.clearRect(0, 0, W, H);
  const L = lay(), lv = CUR.level;
  for (const [a, b, al] of links()) drawLink(a, b, al);
  const tk = RUN && RUN.tk;
  const T = tk ? tk.T : lv.rps * lv.profile(0);
  const timer = RUN && tk ? Math.floor(tk.t) + '/' + lv.duration + ' s' : '';
  pill(G.internet.x, G.internet.y, internetLabel(T, tk && tk.bots, timer), RUN ? (tk && tk.bots ? '#d64534' : '#2f9e5b') : '#7a7266', tk && tk.bots > 0);
  if (hasPay()) { const bad = tk && tk.api && (tk.api.lat > API_BAD_LAT || tk.api.err > API_BAD_ERR); pill(G.api.x, G.api.y, 'API €', bad ? '#d64534' : tk ? '#2f9e5b' : '#7a7266', bad); }
  const letters = 'ABCDE';
  let srvIdx = 0;
  const regs = regionsOf(lv);
  for (const r of ROW_DEF) {
    const R = G.rows[r.key];
    ctx.fillStyle = '#7a7266'; ctx.font = FONT(600, 8.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (G.gutter) { ctx.textBaseline = 'middle'; ctx.fillText(r.label, R.labelX, R.labelY); }
    else ctx.fillText(r.label, R.slots[0].x, R.labelY + 8);
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
        // case vide survolée : elle devient un bouton (fond carte, bord encre, ombre), le + passe à l'encre
        if (hovered(r.key, i)) {
          const y = s.y - LIFT;
          ctx.fillStyle = '#1d1b18'; rr(s.x, s.y + 3, s.w, s.h, 11); ctx.fill();
          ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = '#1d1b18'; ctx.lineWidth = 1.5; rr(s.x, y, s.w, s.h, 11); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#1d1b18'; ctx.font = FONT(400, 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', s.x + s.w / 2, y + s.h / 2);
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
      drawBrick(b, s, st, label, { sub: (optSummary(b) ? optSummary(b) + ' · ' : '') + brickCost(b) + '€', region: regs && !GLOBAL.includes(b.type) ? (b.region || regs[0]) : null, lift: hovered(r.key, i) });
    });
  }
  for (const p of particles) { ctx.beginPath(); ctx.arc(p.x, p.y, p.bot ? 2.4 : 2.8, 0, 7); ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha; ctx.fill(); ctx.globalAlpha = 1; }
  for (const b of bursts) {
    ctx.save(); ctx.globalAlpha = 1 - b.age / .5; ctx.strokeStyle = b.color || '#d64534'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x - 4, b.y - 4); ctx.lineTo(b.x + 4, b.y + 4); ctx.moveTo(b.x + 4, b.y - 4); ctx.lineTo(b.x - 4, b.y + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, 4 + b.age * 20, 0, 7); ctx.stroke(); ctx.restore();
  }
  if (timer) { ctx.font = FONT(700, 10); ctx.textAlign = 'left'; ctx.fillStyle = '#1d1b18'; ctx.textBaseline = 'middle'; ctx.fillText(timer, G.grid.x, G.internet.y); }
}
