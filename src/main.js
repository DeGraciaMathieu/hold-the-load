import {
  DT, BASE_LAT, DIST, SIZES, TTL, LB_LAT,
  RETRY_LAT, STATIC_COST, UPLOAD_COST, SIGNED_UPLOAD_COST, PAY_WAIT_DIVISOR, STICKY_CAPACITY,
  API_DEFAULT_LAT, API_BAD_LAT, API_BAD_ERR, BREAKER_OPEN_AFTER, BREAKER_CLOSE_AFTER, TIMEOUT_SHORT,
  TIMEOUT_LONG, CACHE_WARMUP, STAMPEDE_LOAD, WAF_STRICT_BLOCKED, WAF_STRICT_BOTS_PASS, WAF_SOFT_BOTS_PASS,
  SESSION_LOSS_WINDOW, SHED_THRESHOLD, PRIMARY_CAP, PRIMARY_MAX_CONN, LEGACY_CAP, LEGACY_MAX_CONN,
  REPLICA_CAP, POOLER_MAX_CONN, FAILOVER_DELAY, PROMOTION_DURATION, LAG_MIN, LAG_SLOPE,
  LAG_REPLICA_THRESHOLD, LAG_WRITE_DIVISOR, STALE_MAX, STALE_LAG_DIVISOR, WORKER_RATE, WORKER_CONNS,
  BACKLOG_TOLERANCE, AUTO_INSTANCE_CAP, AUTO_INSTANCE_CONNS, AUTO_INSTANCE_COST, AUTO_BOOT, AUTO_UP_AFTER,
  AUTO_DOWN_UTIL, AUTO_DOWN_AFTER, AUTO_DOWN_RESET, ADD_SERVER_BOOT, ADD_SERVER_COST, RESTART_BOOT,
  PREWARM_COUNT, PREWARM_HOLD, CAMP_START_CASH, CAMP_RPS_START, CAMP_RPS_GROWTH, REGIONS_CHANCE_ALL,
  REGIONS_CHANCE_LATE, REGIONS_FROM_ROUND, QUEUE_GAUGE_MAX, POOLER_GAUGE_MAX, DIAG_MIN_SHARE,
} from './config.js';
import { srvLat, dbLat } from './rules/latency.js';
import { p95, addReason } from './rules/stats.js';
import { ROW_DEF, CATALOG } from './content/catalog.js';
import { defaultOpts, brickCost, layoutCost, emptyLayout, cloneLayout, hasType } from './rules/layout.js';
import { goalsMet, missionStars, missionUnlocked } from './rules/goals.js';
import { campRevenue, campOutcome, nextRound, campRecord } from './rules/campaign.js';

// ============ Moteur de simulation v2 ============
const REGION_NAMES = { eu: 'Paris', us: 'New York', asia: 'Tokyo' };
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
const CARDS = {
  addServer: { name: 'Serveur en renfort', desc: 'Un serveur moyen démarre en 5 s (+40 €).' },
  restart: { name: 'Relancer', desc: 'Les serveurs tombés redémarrent en 4 s.' },
  prewarm: { name: 'Préchauffer', desc: 'L’autoscaling lance 3 instances tout de suite (prêtes en 6 s).' },
  degrade: { name: 'Mode dégradé', desc: 'Coupe les recommandations jusqu’à la fin.' },
  waf: { name: 'Basculer le WAF', desc: 'Passe le pare-feu de souple à strict, ou l’inverse.' },
  promote: { name: 'Promouvoir la réplique', desc: 'La première réplique devient la primaire. Les écritures pas encore répliquées sont perdues.' },
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
const CLASSES = ['static', 'read', 'write', 'upload', 'pay', 'reco'];

function makeSim(level, layout, settings) {
  settings = { retries: 0, timeout: 'long', shed: false, ...(settings || {}) };
  const regions = level.regions || { eu: 1 };
  const bricks = [];
  for (const r of ROW_DEF) layout[r.key].forEach((b, i) => {
    if (!b) return;
    bricks.push({ type: b.type, row: r.key, i, id: r.key + i, opts: { ...defaultOpts(b.type), ...(b.opts || {}) }, region: b.region || 'eu', alive: true, locked: b.locked });
  });
  const one = t => bricks.find(b => b.type === t) || null;
  const lb = one('lb'), cdn = one('cdn'), waf = one('waf'), cache = one('cache'), queue = one('queue'), pooler = one('pooler'),
    breaker = one('breaker'), objstore = one('objstore'), auto = one('autoscale');
  const dbBrick = one('db');
  const replicas = bricks.filter(b => b.type === 'replica');
  const workers = bricks.filter(b => b.type === 'worker');
  const fixed = bricks.filter(b => b.type === 'server').map(b => ({
    id: b.id, brick: b, cap: SIZES[b.opts.size].cap, conns: SIZES[b.opts.size].conns, region: b.region, alive: true, readyAt: 0, kind: 'fixed',
  }));
  const temps = []; // serveurs ajoutés par carte
  const group = auto ? { brick: auto, inst: [], hi: 0, lo: 0, hold: -1, instSec: 0 } : null;
  if (group) for (let k = 0; k < auto.opts.min; k++) group.inst.push({ readyAt: 0, alive: true, region: auto.region });
  const primary = dbBrick ? { brick: dbBrick, cap: dbBrick.opts.legacy ? LEGACY_CAP : PRIMARY_CAP, maxConn: dbBrick.opts.legacy ? LEGACY_MAX_CONN : PRIMARY_MAX_CONN, region: dbBrick.region, alive: true } : null;
  const S = {
    level, layout, settings, bricks, lb, cdn, waf, cache, queue, pooler, breaker, objstore, group, replicas, workers, fixed, temps,
    primary, wafMode: waf ? waf.opts.mode : null,
    t: 0, step: 0, steps: Math.round(level.duration / DT), done: false,
    fired: {}, crashT: null, crashK: 0, failoverAt: null, coldStart: cache ? -99 : null,
    brk: { open: false, bad: 0, good: 0 },
    backlog: { write: 0, upload: 0, pay: 0 },
    fPrev: { main: 0, reco: 0 }, recoOff: false, extraCost: 0, prevGroupRho: 0, lastLag: LAG_MIN, lastWriteRate: 0,
    cards: { ...(level.cards || {}) }, log: [],
    acc: { ok: 0, fail: 0, reasons: {}, samples: [], recoOk: 0, recoTot: 0, stale: 0, cachedOk: 0, total: 0 },
    ticks: [],
  };
  return S;
}

function evActive(level, type, t) { return (level.events || []).filter(e => e.type === type && t >= e.from && t < e.to); }

function receiversOf(S) {
  const t = S.t, out = [];
  if (!S.lb) {
    const f = S.fixed[0];
    if (f && f.alive && t >= f.readyAt) out.push(f);
    return out;
  }
  for (const f of S.fixed) if (f.alive && t >= f.readyAt) out.push(f);
  for (const f of S.temps) if (f.alive && t >= f.readyAt) out.push(f);
  if (S.group && S.group.brick.alive) S.group.inst.forEach((x, k) => { if (x.alive && t >= x.readyAt) out.push({ id: 'auto' + k, cap: AUTO_INSTANCE_CAP, conns: AUTO_INSTANCE_CONNS, region: x.region, alive: true, kind: 'auto', inst: x }); });
  return out;
}

function stepSim(S) {
  if (S.done) return null;
  const L = S.level, t = S.t, st = S.settings;
  // ---- événements ponctuels
  (L.events || []).forEach((e, k) => {
    if (S.fired[k] || e.t == null || t < e.t) return;
    S.fired[k] = true;
    if (e.type === 'crash') {
      const f = S.fixed[e.target || 0];
      if (f && f.alive) { S.crashK = receiversOf(S).length; f.alive = false; S.crashT = t; S.log.push({ t, msg: 'Serveur ' + 'ABCDE'[e.target || 0] + ' hors service' }); }
    } else if (e.type === 'cacheFlush') {
      if (S.cache) { S.coldStart = t; S.log.push({ t, msg: 'Redis redémarre : cache vide' }); }
    } else if (e.type === 'regionDown') {
      if (e.region === 'primary') e = { ...e, region: S.primary ? S.primary.region : 'eu' };
      S.log.push({ t, msg: 'Panne de la région ' + REGION_NAMES[e.region] });
      S.bricks.forEach(b => { if (b.region === e.region) b.alive = false; });
      S.fixed.forEach(f => { if (f.region === e.region) f.alive = false; });
      S.temps.forEach(f => { if (f.region === e.region) f.alive = false; });
      if (S.group && S.group.brick.region === e.region) S.group.inst.forEach(x => (x.alive = false));
      if (S.primary && S.primary.region === e.region) S.primary.alive = false;
      if (S.queue && !S.queue.alive) { const lost = S.backlog.write + S.backlog.pay; S.acc.ok -= lost; S.acc.fail += lost; addReason(S.acc.reasons, 'queueLost', lost); S.backlog.write = 0; S.backlog.pay = 0; }
      if (S.cache && !S.cache.alive) S.coldStart = null;
    } else if (e.type === 'legacyShutdown') {
      if (S.primary && S.primary.brick.opts.legacy) { S.primary.alive = false; S.log.push({ t, msg: 'L’ancienne base est éteinte' }); }
    }
  });
  // ---- failover automatique
  if (S.primary && !S.primary.alive) {
    if (S.failoverAt == null) S.failoverAt = t + FAILOVER_DELAY;
    if (t >= S.failoverAt) promote(S, true);
  }
  // ---- paramètres de l'instant
  const T = L.rps * L.profile(t);
  const api = { lat: (L.api && L.api.lat) || API_DEFAULT_LAT, err: (L.api && L.api.err) || 0 };
  evActive(L, 'apiSlow', t).forEach(e => { api.lat = e.lat != null ? e.lat : api.lat; api.err = e.err != null ? e.err : api.err; });
  let bots = 0; evActive(L, 'attack', t).forEach(e => { bots += T * e.mult; });
  const mix = typeof L.mix === 'function' ? L.mix(t) : L.mix;
  // disjoncteur
  const apiBad = api.lat > API_BAD_LAT || api.err > API_BAD_ERR;
  if (S.breaker && S.breaker.alive) {
    if (apiBad) { S.brk.bad += DT; S.brk.good = 0; if (S.brk.bad >= BREAKER_OPEN_AFTER) S.brk.open = true; }
    else { S.brk.good += DT; S.brk.bad = 0; if (S.brk.good >= BREAKER_CLOSE_AFTER) S.brk.open = false; }
  } else S.brk.open = false;
  const brkOpen = S.brk.open;
  const timeoutMs = st.timeout === 'court' ? TIMEOUT_SHORT : TIMEOUT_LONG;
  const wait = brkOpen ? 0 : Math.min(api.lat, timeoutMs);
  const payCost = 1 + wait / PAY_WAIT_DIVISOR;
  const COST = { static: STATIC_COST, read: 1, write: 1, upload: S.objstore ? SIGNED_UPLOAD_COST : UPLOAD_COST, pay: payCost, reco: 1 };
  // cache
  const cacheAlive = !!(S.cache && S.cache.alive);
  let hit = 0, stampede = 1, staleShare = 0;
  if (cacheAlive) {
    const tt = TTL[S.cache.opts.ttl];
    const warm = S.coldStart == null ? 0 : Math.min(1, (t - S.coldStart) / CACHE_WARMUP);
    hit = tt.hit * (S.coldStart != null && t - S.coldStart < CACHE_WARMUP ? warm : 1);
    if (S.coldStart != null && t - S.coldStart < CACHE_WARMUP && !S.cache.opts.antiRuee) stampede = STAMPEDE_LOAD;
    staleShare = tt.stale;
  }
  // ---- volumes utilisateurs (non amplifiés)
  const U = {}; CLASSES.forEach(c => (U[c] = T * (mix[c] || 0)));
  const recoOff = S.recoOff;
  const r = st.retries;
  const ampMain = [0, 1, 2].slice(0, r + 1).reduce((a, i) => a + Math.pow(S.fPrev.main, i), 0);
  const ampReco = [0, 1, 2].slice(0, r + 1).reduce((a, i) => a + Math.pow(S.fPrev.reco, i), 0);
  // WAF
  let blockedFrac = 0, botsPass = bots;
  const wafAlive = !!(S.waf && S.waf.alive);
  if (wafAlive) { if (S.wafMode === 'strict') { blockedFrac = WAF_STRICT_BLOCKED; botsPass = bots * WAF_STRICT_BOTS_PASS; } else botsPass = bots * WAF_SOFT_BOTS_PASS; }
  // attempts
  const att = {}; // volumes de tentatives par classe
  CLASSES.forEach(c => { const base = U[c] * (1 - blockedFrac); att[c] = base * (c === 'reco' ? ampReco : ampMain); });
  if (recoOff) att.reco = 0;
  const tk = { t, T, bots, botsPass, api, brkOpen, hit, servers: [], nodes: {}, vis: {}, fail: 0, ok: 0, events: [] };
  // tentatives : échecs et succès (par groupe)
  const A = { main: { vol: 0, fail: 0, reasons: {}, samples: [], stale: 0, cached: 0 }, reco: { vol: 0, fail: 0, reasons: {}, samples: [] } };
  const G = c => (c === 'reco' ? A.reco : A.main);
  CLASSES.forEach(c => { G(c).vol += att[c]; });
  const failA = (c, v, why) => { if (v <= 0) return; const g = G(c); g.fail += v; addReason(g.reasons, why, v); };
  const okA = (c, v, lat) => { if (v <= 0) return; G(c).samples.push([lat, v]); };
  // CDN
  const cdnAlive = !!(S.cdn && S.cdn.alive);
  let statIn = att.static;
  if (cdnAlive) { okA('static', statIn, BASE_LAT + 15); statIn = 0; }
  // ---- étage serveurs
  const recv = receiversOf(S);
  tk.receivers = recv.length;
  const userRegions = Object.keys(L.regions || { eu: 1 });
  const regShare = L.regions || { eu: 1 };
  const pools = {}; // region serveur -> {servers, flows: {userRegion: share}}
  for (const s of recv) (pools[s.region] ||= { servers: [], users: {} }).servers.push(s);
  const algo = S.lb ? S.lb.opts.algo : 'rr';
  const sticky = algo === 'sticky';
  // routage
  const route = {}; // userRegion -> pool region
  for (const u of userRegions) {
    let best = null;
    if (!S.lb) { if (recv[0]) best = recv[0].region; }
    else for (const g of Object.keys(pools)) if (best == null || DIST[u][g] < DIST[u][best]) best = g;
    route[u] = best;
    if (best) pools[best].users[u] = regShare[u];
  }
  // sessions
  const cacheIsStore = cacheAlive;
  let sessFrac = 0;
  if ((L.logged || 0) > 0 && !cacheIsStore && S.lb) {
    if (!sticky && recv.length > 1) sessFrac = (recv.length - 1) / recv.length;
    if (sticky && S.crashT != null && t - S.crashT < SESSION_LOSS_WINDOW && S.crashK > 0) sessFrac = 1 / S.crashK;
  }
  sessFrac *= L.logged || 0;
  // flux vers le data tier
  const D = { direct: [], jobs: { write: 0, upload: 0, pay: 0 }, dbReads: [], }; // dbReads: [ {c, vol, srv, u, fresh} ]
  const serverRows = [];
  const botsByPool = {};
  for (const u of userRegions) {
    const g = route[u];
    if (!g) {
      // personne pour répondre
      CLASSES.forEach(c => { const v = (c === 'static' ? statIn : att[c]) * regShare[u]; failA(c, v, S.fixed.length === 0 && !(S.group) ? 'noServer' : 'crash'); });
      continue;
    }
  }
  for (const g of Object.keys(pools)) {
    const P = pools[g];
    const share = Object.values(P.users).reduce((a, b) => a + b, 0);
    if (share <= 0 && !(botsPass > 0)) { P.servers.forEach(s => tk.servers.push({ id: s.id, rho: 0, receiving: false })); continue; }
    const botShare = Object.keys(pools).length ? 1 / Object.keys(pools).length : 1;
    const vol = {}; CLASSES.forEach(c => (vol[c] = (c === 'static' ? statIn : att[c]) * share));
    const botV = botsPass * botShare;
    let W = 0; CLASSES.forEach(c => (W += vol[c] * COST[c])); W += botV;
    const capOf = s => s.cap * (sticky ? STICKY_CAPACITY : 1);
    const capTot = P.servers.reduce((a, s) => a + capOf(s), 0);
    // délestage
    let shed = 0;
    if (st.shed && W / capTot > SHED_THRESHOLD && vol.reco > 0) {
      const need = W - SHED_THRESHOLD * capTot;
      shed = Math.min(vol.reco, need / COST.reco);
      vol.reco -= shed; W -= shed * COST.reco;
      G('reco').fail += 0; // délestées : comptées à part
      A.reco.shed = (A.reco.shed || 0) + shed;
      A.reco.vol -= shed;
    }
    // poids
    const weights = P.servers.map(s => (algo === 'least' ? capOf(s) / capTot : 1 / P.servers.length));
    P.servers.forEach((s, j) => {
      const w = W * weights[j];
      const rho = w / capOf(s);
      // avec des retries, les essais rejetés ont déjà consommé du temps serveur : la saturation s'emballe
      const served = rho > 1 ? (r > 0 ? Math.max(0, 2 / rho - 1) : 1 / rho) : 1;
      const lat = srvLat(rho) + (S.lb ? LB_LAT : 0);
      tk.servers.push({ id: s.id, rho, receiving: true, kind: s.kind });
      const why = !S.lb && S.fixed.length > 1 ? 'noLb' : 'serverSat';
      for (const u of Object.keys(P.users)) {
        const us = P.users[u] / share; // part de ce pool venant de u
        const ul = BASE_LAT + DIST[u][g];
        for (const c of CLASSES) {
          const v = vol[c] * weights[j] * us;
          if (v <= 0) continue;
          failA(c, v * (1 - served), why);
          let sv = v * served;
          if (c === 'static') { okA(c, sv, ul + lat); continue; }
          const sess = sv * sessFrac;
          failA(c, sess, 'session'); sv -= sess;
          serverRows.push({ c, v: sv, g, u, base: ul + lat });
        }
      }
      // bots servis -> lectures base
      const bv = botV * weights[j] * served;
      if (bv > 0) D.dbReads.push({ c: 'bot', v: bv, g, u: null, base: 0, bot: true });
    });
  }
  // ---- connexions
  let conns = recv.reduce((a, s) => a + s.conns, 0) + S.workers.filter(w => w.alive).length * WORKER_CONNS;
  if (S.pooler && S.pooler.alive) conns = Math.min(conns, POOLER_MAX_CONN);
  const prim = S.primary && S.primary.alive ? S.primary : null;
  const maxConn = prim ? prim.maxConn : 0;
  const connFail = prim && conns > maxConn ? 1 - maxConn / conns : 0;
  tk.conns = conns; tk.maxConn = maxConn;
  // ---- aiguillage applicatif
  const wAlive = S.workers.filter(w => w.alive).length;
  const queueAlive = !!(S.queue && S.queue.alive);
  const objAlive = !!(S.objstore && S.objstore.alive);
  const reps = S.replicas.filter(x => x.alive);
  const dbNodes = []; if (prim) dbNodes.push({ kind: 'p', region: prim.region, cap: prim.cap, id: prim.brick.id }); reps.forEach(x => dbNodes.push({ kind: 'r', region: x.region, cap: REPLICA_CAP, id: x.id }));
  const sensible = prim && prim.brick.opts.sensible;
  const directWrites = [];
  for (const row of serverRows) {
    const { c, v, g, base } = row;
    if (c === 'upload') {
      if (S.objstore) {
        if (!objAlive) { failA(c, v, 'objDown'); continue; }
        okA(c, v, base + 30 + DIST[g][S.objstore.region]); D.jobs.upload += v; continue;
      }
      okA(c, v, base * 2.5); continue;
    }
    if (c === 'pay') {
      if (brkOpen) {
        if (queueAlive && wAlive > 0) { okA(c, v, base + 5); D.jobs.pay += v; }
        else failA(c, v, 'apiDown');
        continue;
      }
      if (api.lat > timeoutMs) { failA(c, v, 'apiTimeout'); continue; }
      failA(c, v * api.err, 'apiDown');
      okA(c, v * (1 - api.err), base + api.lat);
      continue;
    }
    if (c === 'write') {
      if (queueAlive) { okA(c, v, base + 5 + DIST[g][S.queue.region]); D.jobs.write += v; continue; }
      if (!prim) { failA(c, v, S.primary ? 'dbDown' : 'noDb'); continue; }
      failA(c, v * connFail, 'conn');
      directWrites.push({ c, v: v * (1 - connFail), g, base });
      continue;
    }
    // read / reco
    const fresh = c === 'read' ? (L.fresh || 0) : 0;
    const vf = v * fresh, vn = v - vf;
    if (vf > 0) {
      if (!dbNodes.length) failA(c, vf, S.primary ? 'dbDown' : 'noDb');
      else { failA(c, vf * connFail, 'conn'); D.dbReads.push({ c, v: vf * (1 - connFail), g, base, fresh: true, toPrimary: !!sensible }); }
    }
    if (vn > 0) {
      let miss = vn;
      if (cacheAlive) {
        const h = vn * hit;
        okA(c, h, base + 2 + DIST[g][S.cache.region]);
        if (c === 'read') { A.main.stale += h * staleShare; A.main.cached += h; }
        miss = vn - h;
      }
      if (miss > 0) {
        if (!dbNodes.length) failA(c, miss, S.primary ? 'dbDown' : 'noDb');
        else { failA(c, miss * connFail, 'conn'); D.dbReads.push({ c, v: miss * (1 - connFail), g, base: base + (cacheAlive ? 2 : 0), load: stampede }); }
      }
    }
  }
  // ---- étage base
  const nodeLoad = dbNodes.map(() => 0);
  const placeRead = rd => {
    // retourne liste [nodeIndex, part]
    if (rd.toPrimary && prim) return [[0, 1]];
    return dbNodes.map((n, k) => [k, 1 / dbNodes.length]);
  };
  for (const rd of D.dbReads) for (const [k, p] of placeRead(rd)) nodeLoad[k] += rd.v * p * (rd.load || 1);
  let directW = directWrites.reduce((a, x) => a + x.v, 0);
  if (prim) nodeLoad[0] += directW;
  const nodeRho = dbNodes.map((n, k) => nodeLoad[k] / n.cap);
  const nodeServed = nodeRho.map(x => (x > 1 ? 1 / x : 1));
  const repRhoMax = Math.max(0, ...dbNodes.map((n, k) => (n.kind === 'r' ? nodeRho[k] : 0)));
  // retard de réplication
  const lag = LAG_MIN + LAG_SLOPE * Math.max(0, repRhoMax - LAG_REPLICA_THRESHOLD) + S.lastWriteRate / LAG_WRITE_DIVISOR;
  const pStale = Math.min(STALE_MAX, lag / STALE_LAG_DIVISOR);
  tk.lag = lag;
  for (const rd of D.dbReads) {
    for (const [k, p] of placeRead(rd)) {
      const v = rd.v * p, n = dbNodes[k];
      if (rd.bot) continue;
      failA(rd.c, v * (1 - nodeServed[k]), 'dbSat');
      let ok = v * nodeServed[k];
      if (rd.fresh && n.kind === 'r') { failA(rd.c, ok * pStale, 'stale'); ok *= 1 - pStale; }
      okA(rd.c, ok, rd.base + dbLat(nodeRho[k]) + DIST[rd.g][n.region]);
    }
  }
  if (prim) for (const w of directWrites) { failA(w.c, w.v * (1 - nodeServed[0]), 'dbSat'); okA(w.c, w.v * nodeServed[0], w.base + dbLat(nodeRho[0]) + DIST[w.g][prim.region]); }
  // ---- workers
  S.backlog.write += D.jobs.write * DT; S.backlog.upload += D.jobs.upload * DT; S.backlog.pay += D.jobs.pay * DT;
  let wcap = wAlive * WORKER_RATE * DT;
  let drained = { write: 0, upload: 0, pay: 0 };
  if (!brkOpen && !apiBad) { const d = Math.min(S.backlog.pay, wcap); S.backlog.pay -= d; wcap -= d; drained.pay = d; }
  if (prim) {
    const free = Math.max(0, prim.cap - nodeLoad[0]) * DT;
    const d = Math.min(S.backlog.write, wcap, free); S.backlog.write -= d; wcap -= d; drained.write = d;
    nodeLoad[0] += d / DT; nodeRho[0] = nodeLoad[0] / prim.cap;
  }
  { const d = Math.min(S.backlog.upload, wcap); S.backlog.upload -= d; wcap -= d; drained.upload = d; }
  S.lastWriteRate = directW + drained.write / DT;
  // ---- retries : passage tentatives -> utilisateurs
  const finish = (gk, users) => {
    const g = A[gk];
    const vol = Math.max(1e-9, g.vol);
    const f = Math.min(1, g.fail / vol);
    S.fPrev[gk] = f;
    const uf = Math.pow(f, r + 1);
    const okU = users * (1 - uf), failU = users * uf;
    const okAtt = g.samples.reduce((a, s) => a + s[1], 0);
    const k = okAtt > 0 ? okU / okAtt : 0;
    return { okU, failU, f, k };
  };
  const usersMain = CLASSES.filter(c => c !== 'reco').reduce((a, c) => a + U[c], 0);
  const blockedMain = usersMain * blockedFrac;
  const mainU = usersMain - blockedMain;
  const recoU = recoOff ? 0 : U.reco * (1 - blockedFrac) - (A.reco.shed || 0) / Math.max(1, ampReco);
  const fm = finish('main', mainU);
  const fr = finish('reco', Math.max(0, recoU));
  const acc = S.acc;
  acc.total += usersMain * DT;
  acc.ok += fm.okU * DT;
  acc.fail += (fm.failU + blockedMain) * DT;
  addReason(acc.reasons, 'blocked', blockedMain * DT);
  const ftot = Math.max(1e-9, A.main.fail);
  for (const [why, v] of Object.entries(A.main.reasons)) addReason(acc.reasons, why, (v / ftot) * fm.failU * DT);
  {
    // un succès peut venir du 1er, 2e ou 3e essai : chaque nouvel essai ajoute 300 ms
    const f = fm.f, den = 1 - Math.pow(f, r + 1) || 1;
    const parts = []; for (let i = 0; i <= r; i++) parts.push((Math.pow(f, i) * (1 - f)) / den);
    for (const [lat, w] of A.main.samples) if (w * fm.k > 0) parts.forEach((p, i) => { if (p > 1e-4) acc.samples.push([lat + i * RETRY_LAT, w * fm.k * DT * p]); });
  }
  acc.stale += A.main.stale * fm.k * DT; acc.cachedOk += A.main.cached * fm.k * DT;
  acc.recoTot += U.reco * DT; acc.recoOk += fr.okU * DT;
  // ---- autoscaling
  if (S.group && S.group.brick.alive) {
    const gr = S.group, o = gr.brick.opts;
    const mine = tk.servers.filter(x => x.kind === 'auto');
    const util = mine.length ? mine.reduce((a, x) => a + x.rho, 0) / mine.length : 1;
    const live = gr.inst.filter(x => x.alive);
    const work = mine.reduce((a, x) => a + x.rho * AUTO_INSTANCE_CAP, 0);
    const desired = Math.min(o.max, Math.max(o.min, Math.ceil(work / (AUTO_INSTANCE_CAP * o.seuil / 100))));
    const pending = live.some(x => t < x.readyAt);
    if (desired > live.length) { gr.hi += DT; gr.lo = 0; if (gr.hi >= AUTO_UP_AFTER && !pending) { for (let k = live.length; k < desired; k++) gr.inst.push({ readyAt: t + AUTO_BOOT, alive: true, region: gr.brick.region }); gr.hi = 0; } }
    else if (desired < live.length && util < AUTO_DOWN_UTIL) { gr.lo += DT; gr.hi = 0; if (gr.lo >= AUTO_DOWN_AFTER && live.length > o.min && t > gr.hold) { const x = [...gr.inst].reverse().find(x => x.alive); x.alive = false; gr.lo = AUTO_DOWN_RESET; } }
    else { gr.hi = 0; gr.lo = 0; }
    gr.instSec += gr.inst.filter(x => x.alive).length * DT;
    tk.autoCount = gr.inst.filter(x => x.alive).length; tk.autoReady = gr.inst.filter(x => x.alive && t >= x.readyAt).length;
  }
  // ---- état visuel
  const fMain = fm.f;
  tk.availNow = mainU > 0 ? (fm.okU / (mainU + blockedMain)) * 100 : 100;
  tk.vis = { fMain, sessFrac, connFail, hit, stampede, pStale, apiBad, blockedFrac, botsPass, bots };
  tk.backlog = { ...S.backlog };
  tk.nodeRho = {}; dbNodes.forEach((n, k) => (tk.nodeRho[n.id] = nodeRho[k]));
  tk.dbNodes = dbNodes.map((n, k) => ({ ...n, served: nodeServed[k] }));
  tk.primaryId = prim ? prim.brick.id : null;
  tk.drained = drained;
  S.ticks.push(tk);
  S.step++; S.t = S.step * DT;
  if (S.step >= S.steps) S.done = true;
  return tk;
}

function promote(S, auto) {
  const rep = S.replicas.find(x => x.alive);
  if (!rep) return false;
  if (S.primary && S.primary.alive && !auto) {
    // écritures non répliquées perdues
    const loss = S.lastWriteRate * (S.lastLag + PROMOTION_DURATION); // la bascule elle-même dure ~3 s
    S.acc.ok -= loss; S.acc.fail += loss; addReason(S.acc.reasons, 'promoLoss', loss);
    S.primary.alive = false;
  }
  rep.type = 'db'; rep.promoted = true;
  S.replicas = S.replicas.filter(x => x !== rep);
  const old = S.primary;
  S.primary = { brick: { id: rep.id, opts: { sensible: old ? old.brick.opts.sensible : false } }, cap: PRIMARY_CAP, maxConn: PRIMARY_MAX_CONN, region: rep.region, alive: true };
  S.failoverAt = null;
  S.log.push({ t: S.t, msg: (auto ? 'Bascule automatique : ' : '') + 'la réplique devient primaire' });
  S.promotedId = rep.id;
  return true;
}

function useCard(S, name) {
  if (!S.cards[name]) return { ok: false, msg: 'Plus de carte' };
  const t = S.t;
  let ok = false, msg = '';
  if (name === 'addServer') {
    S.temps.push({ id: 'tmp' + S.temps.length, cap: SIZES.m.cap, conns: SIZES.m.conns, region: (S.lb && S.lb.region) || 'eu', alive: true, readyAt: t + ADD_SERVER_BOOT, kind: 'temp' });
    S.extraCost += ADD_SERVER_COST; ok = true; msg = 'Serveur en route (5 s)';
    if (!S.lb) msg = 'Serveur lancé, mais sans load balancer il ne recevra rien';
  } else if (name === 'restart') {
    const dead = S.fixed.filter(f => !f.alive && !(S.level.events || []).some(e => e.type === 'regionDown' && e.region === f.region && S.t >= e.t));
    if (!dead.length) return { ok: false, msg: 'Aucun serveur à relancer' };
    dead.forEach(f => { f.alive = true; f.readyAt = t + RESTART_BOOT; }); ok = true; msg = 'Redémarrage (4 s)';
  } else if (name === 'prewarm') {
    if (!S.group) return { ok: false, msg: 'Pas d’autoscaling' };
    for (let k = 0; k < PREWARM_COUNT; k++) S.group.inst.push({ readyAt: t + AUTO_BOOT, alive: true, region: S.group.brick.region });
    S.group.hold = t + PREWARM_HOLD; ok = true; msg = '+3 instances (6 s)';
  } else if (name === 'degrade') {
    S.recoOff = true; ok = true; msg = 'Recommandations coupées';
  } else if (name === 'waf') {
    if (!S.waf) return { ok: false, msg: 'Pas de pare-feu' };
    S.wafMode = S.wafMode === 'strict' ? 'souple' : 'strict'; ok = true; msg = 'WAF ' + S.wafMode;
  } else if (name === 'promote') {
    if (!S.replicas.some(x => x.alive)) return { ok: false, msg: 'Aucune réplique à promouvoir' };
    S.lastLag = S.ticks.length ? S.ticks[S.ticks.length - 1].lag : LAG_MIN;
    ok = promote(S, false); msg = 'Réplique promue';
  }
  if (ok) { S.cards[name]--; S.log.push({ t, msg: CARDS[name].name }); }
  return { ok, msg };
}

function resultOf(S) {
  const acc = { ...S.acc, reasons: { ...S.acc.reasons } };
  const wAlive = S.workers.filter(w => w.alive).length;
  const left = S.backlog.write + S.backlog.upload + S.backlog.pay;
  const tol = wAlive * WORKER_RATE * BACKLOG_TOLERANCE;
  const lost = Math.max(0, left - tol);
  if (lost > 0) { acc.ok -= lost; acc.fail += lost; addReason(acc.reasons, 'backlog', lost); }
  let cost = layoutCost(S.layout) + S.extraCost;
  let autoAvg = 0;
  if (S.group) { autoAvg = S.group.instSec / S.level.duration; cost += Math.round(AUTO_INSTANCE_COST * autoAvg); }
  const total = acc.ok + acc.fail;
  return {
    avail: total > 0 ? Math.max(0, (acc.ok / total) * 100) : 100,
    p95: p95(acc.samples), cost, autoAvg,
    fresh: acc.cachedOk > 0 ? (1 - acc.stale / acc.cachedOk) * 100 : 100,
    recos: acc.recoTot > 0 ? (acc.recoOk / acc.recoTot) * 100 : 100,
    reasons: acc.reasons, total, ok: acc.ok, fail: acc.fail, log: S.log,
  };
}

function runAll(level, layout, settings, actions) {
  const S = makeSim(level, layout, settings);
  const acts = [...(actions || [])].sort((a, b) => a.t - b.t);
  while (!S.done) {
    while (acts.length && acts[0].t <= S.t) useCard(S, acts.shift().card);
    stepSim(S);
  }
  return resultOf(S);
}


// ============ Missions ============
const mixOf = o => ({ static: 0, read: 0, write: 0, upload: 0, pay: 0, reco: 0, ...o });
const wave = (a, b, p) => t => a + b * Math.sin(t / p);
const BR = {
  base: ['server', 'db'],
  lb: ['server', 'db', 'lb'],
  cache: ['server', 'db', 'lb', 'cache'],
  cdn: ['server', 'db', 'lb', 'cache', 'cdn', 'replica'],
  queue: ['server', 'db', 'lb', 'cache', 'cdn', 'replica', 'queue', 'worker'],
  all: ['server', 'db', 'lb', 'cache', 'cdn', 'replica', 'queue', 'worker', 'autoscale', 'breaker', 'waf', 'pooler', 'objstore'],
};
const LEVELS = [
  {
    id: 'm01', title: 'Premier client', bricks: BR.base,
    story: 'Ton appli sort de la salle de dev : 250 requêtes par seconde, que des pages dynamiques. Le strict nécessaire suffira.',
    rps: 250, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: wave(0.85, 0.15, 3),
    goals: { avail: 99, p95: 120, budget: 130 },
  },
  {
    id: 'm02', title: 'Le lancement', bricks: BR.lb,
    story: 'Un article sur Laravel France, et le trafic grimpe jusqu’à 700 req/s. Un serveur moyen encaisse 400 req/s.',
    rps: 700, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: t => Math.min(1, 0.4 + t / 12),
    goals: { avail: 99, p95: 150, budget: 200 },
  },
  {
    id: 'm03', title: 'Alice perd son panier', bricks: BR.cache, lbAlgos: ['rr', 'sticky'],
    story: '70 % des visiteurs sont connectés, et leurs sessions vivent dans la mémoire du serveur qui les a créées. Deux façons de s’en sortir : partager les sessions, ou garder chacun sur son serveur.',
    rps: 600, duration: 20, mix: mixOf({ read: 0.85, write: 0.15 }), logged: 0.7, profile: wave(0.9, 0.1, 2),
    goals: { avail: 99, p95: 150, budget: 230 },
  },
  {
    id: 'm04', title: 'Un serveur tombe', bricks: BR.cache, cards: { restart: 1 },
    story: '1 000 req/s en continu. À la 8e seconde, le serveur A s’éteint. Une carte Relancer est dispo, mais le redémarrage prend 4 s.',
    rps: 1000, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: wave(0.95, 0.05, 1),
    events: [{ type: 'crash', t: 8, target: 0 }],
    goals: { avail: 99, p95: 170, budget: 280 },
  },
  {
    id: 'm05', title: 'Gros ou petits ?', bricks: BR.cache, sizes: true,
    story: '1 800 req/s, dont 60 % de fichiers statiques que tes serveurs servent eux-mêmes (pas encore de CDN). Les gros serveurs coûtent moins cher à la requête, mais attention à la répartition si tu mélanges les tailles.',
    rps: 1800, duration: 20, mix: mixOf({ static: 0.6, read: 0.36, write: 0.04 }), profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 170, budget: 235 },
  },
  {
    id: 'm06', title: 'Les soldes', bricks: BR.cdn, sizes: true,
    story: '2 400 req/s, la moitié en images. Le catalogue se lit beaucoup, mais les prix changent pendant les soldes : au plus 3 % de pages périmées.',
    rps: 2400, duration: 20, mix: mixOf({ static: 0.5, read: 0.45, write: 0.05 }), profile: t => Math.min(1, 0.5 + t / 10),
    goals: { avail: 99, p95: 150, budget: 300, fresh: 97 },
  },
  {
    id: 'm07', title: 'La newsletter de 9 h', bricks: BR.cdn, sizes: true,
    story: '1 100 req/s de lecture. À la 8e seconde, Redis redémarre pendant l’envoi de la newsletter : le cache est vide pile au moment du pic.',
    rps: 1100, duration: 24, mix: mixOf({ read: 0.95, write: 0.05 }), profile: t => (t >= 8 && t < 16 ? 1 : 0.7),
    events: [{ type: 'cacheFlush', t: 8 }],
    goals: { avail: 99, p95: 160, budget: 280 },
  },
  {
    id: 'm08', title: 'Black Friday', bricks: BR.queue, sizes: true,
    story: '1 200 req/s. Entre la 5e et la 11e seconde, tout le monde valide son panier : 90 % d’écritures. Une file accuse réception, mais il faut des workers pour la vider avant la fin.',
    rps: 1200, duration: 24, mix: t => (t >= 5 && t < 11 ? mixOf({ read: 0.1, write: 0.9 }) : mixOf({ read: 0.85, write: 0.15 })), profile: () => 1,
    goals: { avail: 99, p95: 160, budget: 360 },
  },
  {
    id: 'm09', title: 'Mon panier est vide', bricks: ['server', 'db', 'lb', 'cdn', 'replica', 'queue', 'worker'], sizes: true,
    story: '1 600 req/s sur des pages personnelles, impossibles à mettre en cache (pas de Redis ici). 30 % des lectures suivent juste un ajout au panier, et les répliques ont toujours un peu de retard sur la primaire…',
    rps: 1600, duration: 20, mix: mixOf({ read: 0.85, write: 0.15 }), fresh: 0.3, profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 160, budget: 410 },
  },
  {
    id: 'm10', title: 'Le coup d’envoi', bricks: [...BR.queue, 'autoscale'], sizes: true, cards: { prewarm: 1 },
    story: 'Match ce soir. Avant-match calme à 500 req/s, puis coup d’envoi à la 20e seconde : ×6 en 2 s. Les serveurs fixes coûtent cher pour un pic de 8 s… et l’autoscaling met 6 s à démarrer une instance.',
    rps: 3000, duration: 40, mix: mixOf({ static: 0.4, read: 0.55, write: 0.05 }),
    profile: t => (t < 20 ? 1 / 6 : t < 22 ? 1 / 6 + (5 / 6) * (t - 20) / 2 : t < 30 ? 1 : Math.max(1 / 6, 1 - (t - 30) / 4)),
    goals: { avail: 99, p95: 170, budget: 335 },
  },
  {
    id: 'm11', title: 'Le prestataire rame', bricks: [...BR.queue, 'breaker'], sizes: true, settingsAllowed: ['timeout'],
    story: '1 000 req/s, dont 15 % de paiements. De la 6e à la 16e seconde, l’API de paiement met 4 s à répondre. Des serveurs qui attendent sont des serveurs qui ne servent plus personne.',
    rps: 1000, duration: 24, mix: mixOf({ read: 0.75, write: 0.1, pay: 0.15 }), profile: () => 1,
    events: [{ type: 'apiSlow', from: 6, to: 16, lat: 4000 }],
    goals: { avail: 98.5, p95: 200, budget: 350 },
  },
  {
    id: 'm12', title: 'Réessayer, c’est gratuit ?', bricks: [...BR.queue, 'breaker'], sizes: true, settingsAllowed: ['timeout', 'retries'],
    story: 'L’API de paiement échoue une fois sur 15, au hasard. Réessayer aide… jusqu’à la 10e seconde, où un serveur tombe et où tout sature. Chaque nouvel essai coûte du temps.',
    rps: 1100, duration: 24, mix: mixOf({ read: 0.65, write: 0.1, pay: 0.25 }), api: { lat: 100, err: 0.07 }, profile: () => 1,
    events: [{ type: 'crash', t: 10, target: 0 }],
    goals: { avail: 99, p95: 300, budget: 280 },
  },
  {
    id: 'm13', title: 'L’attaque', bricks: [...BR.queue, 'breaker', 'waf'], sizes: true, cards: { waf: 2 }, settingsAllowed: ['timeout'],
    story: '800 req/s légitimes. De la 8e à la 16e seconde, un botnet envoie 4 fois plus de requêtes. Le pare-feu strict bloque 3 % de vrais clients : à n’activer qu’au bon moment.',
    rps: 800, duration: 24, mix: mixOf({ read: 0.9, write: 0.1 }), profile: () => 1,
    events: [{ type: 'attack', from: 8, to: 16, mult: 4 }],
    goals: { avail: 97.5, p95: 160, budget: 265 },
  },
  {
    id: 'm14', title: 'Trop de monde à la porte', bricks: [...BR.queue, 'breaker', 'waf', 'pooler'], sizes: true,
    story: '3 300 req/s, presque tout en cache. Il faut beaucoup de serveurs… mais chacun ouvre ses connexions à la base, qui n’en accepte que 150.',
    rps: 3300, duration: 20, mix: mixOf({ static: 0.3, read: 0.65, write: 0.05 }), profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 160, budget: 430 },
  },
  {
    id: 'm15', title: 'Les recommandations', bricks: [...BR.queue, 'breaker', 'waf', 'pooler'], sizes: true, cards: { degrade: 1 }, settingsAllowed: ['shed'],
    story: '35 % du trafic sert à afficher « vous aimerez aussi ». De la 8e à la 16e seconde, le trafic monte de 60 %. Les recos peuvent sauter, le reste non. Garde au moins 70 % des recos servies.',
    rps: 1000, duration: 24, mix: mixOf({ read: 0.55, write: 0.1, reco: 0.35 }), profile: t => (t >= 8 && t < 16 ? 1.6 : 1),
    goals: { avail: 99, p95: 160, budget: 275, recos: 70 },
  },
  {
    id: 'm16', title: 'Le monde entier', bricks: [...BR.queue, 'breaker', 'pooler'], sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'],
    regions: { eu: 0.4, us: 0.35, asia: 0.25 },
    story: 'Tes clients sont à Paris, New York et Tokyo. Traverser l’Atlantique coûte 80 ms, le Pacifique 100, aller de Paris à Tokyo 120. Chaque brique se place dans une région.',
    rps: 1200, duration: 20, mix: mixOf({ static: 0.3, read: 0.65, write: 0.05 }), profile: () => 1,
    goals: { avail: 99, p95: 160, budget: 420 },
  },
  {
    id: 'm17', title: 'Panne de région', bricks: [...BR.queue, 'breaker', 'pooler'], sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'], cards: { promote: 1 },
    regions: { eu: 0.6, us: 0.4 },
    story: 'Paris et New York. À la 10e seconde, la région qui héberge ta base primaire tombe en entier : serveurs, base, cache, file. Une réplique ailleurs est promue au bout de 5 s… si elle existe.',
    rps: 900, duration: 24, mix: mixOf({ read: 0.85, write: 0.15 }), profile: () => 1,
    events: [{ type: 'regionDown', t: 10, region: 'primary' }],
    goals: { avail: 99, p95: 200, budget: 390 },
  },
  {
    id: 'm18', title: 'Dégraisser la facture', bricks: BR.all, sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'],
    story: 'Tu hérites de l’infra d’un prestataire : ça tient, mais ça coûte une fortune. Le DAF veut passer sous 230 €/mois sans perdre une requête.',
    rps: 1200, duration: 20, mix: mixOf({ static: 0.3, read: 0.6, write: 0.1 }), profile: wave(0.95, 0.05, 2),
    preset: {
      edge: [{ type: 'lb' }, { type: 'cdn' }, { type: 'waf' }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'm' } }, { type: 'worker' }, { type: 'worker' }],
      svc: [{ type: 'cache', opts: { ttl: 'court', antiRuee: true } }, { type: 'queue' }, { type: 'pooler' }, { type: 'breaker' }],
      data: [{ type: 'db' }, { type: 'replica' }, { type: 'replica' }, { type: 'objstore' }],
    },
    goals: { avail: 99, p95: 160, budget: 230 },
  },
  {
    id: 'm19', title: 'La migration à chaud', bricks: BR.all, sizes: true, cards: { promote: 1 }, settingsAllowed: ['timeout', 'retries', 'shed'],
    story: 'L’ancienne base (600 req/s, verrouillée) sera éteinte à la 22e seconde. Il faut une nouvelle machine prête à prendre le relais. Une bascule coûte environ 3 s d’écritures : vise le creux, entre la 12e et la 15e seconde.',
    rps: 900, duration: 26, mix: t => (t >= 12 && t < 15 ? mixOf({ read: 0.98, write: 0.02 }) : mixOf({ read: 0.75, write: 0.25 })),
    profile: t => (t >= 12 && t < 15 ? 0.5 : 1),
    events: [{ type: 'legacyShutdown', t: 22 }],
    preset: {
      edge: [{ type: 'lb' }, null, null], app: [{ type: 'server', opts: { size: 'm' } }, { type: 'server', opts: { size: 'm' } }, { type: 'server', opts: { size: 'm' } }, null, null],
      svc: [null, null, null, null], data: [{ type: 'db', opts: { legacy: true }, locked: true }, null, null, null],
    },
    goals: { avail: 99, p95: 200, budget: 300 },
  },
];


// ============ Génération procédurale (Croissance, Défi du jour) ============
function rng(seed) { let s = hashStr('s' + seed) || 1; const f = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; for (let i = 0; i < 8; i++) f(); return f; }
function hashStr(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const UNLOCKS = [
  ['server', 'db', 'lb'], ['cache'], ['cdn', 'replica'], ['queue', 'worker'], ['autoscale'], ['breaker', 'waf', 'pooler'], ['objstore'],
];
const EVENT_NAMES = {
  crash: 'un serveur tombe', cacheFlush: 'Redis redémarre', apiSlow: 'l’API de paiement rame', attack: 'un botnet attaque',
  spike: 'pic de trafic', writeRush: 'ruée sur les paniers', regionDown: 'la région de la base tombe',
};
// round: 1..n ; difficulté croissante
function genLevel(R, round, opts = {}) {
  const pick = a => a[Math.floor(R() * a.length)];
  const between = (a, b) => a + (b - a) * R();
  const bricks = []; UNLOCKS.slice(0, Math.min(UNLOCKS.length, Math.ceil(round / 1.5) + 1)).forEach(u => bricks.push(...u));
  if (opts.all) bricks.splice(0, bricks.length, ...UNLOCKS.flat());
  const has = t => bricks.includes(t);
  const rps = Math.round((opts.rps || CAMP_RPS_START * Math.pow(CAMP_RPS_GROWTH, round - 1)) / 50) * 50;
  const m = { static: has('cdn') ? between(0.15, 0.45) : 0, write: between(0.05, 0.15), pay: has('breaker') ? between(0.05, 0.15) : 0,
    reco: has('autoscale') && R() < 0.5 ? between(0.1, 0.25) : 0, upload: has('objstore') && R() < 0.5 ? between(0.02, 0.05) : 0 };
  m.read = Math.max(0.2, 1 - m.static - m.write - m.pay - m.reco - m.upload);
  const duration = 24;
  const evPool = ['spike'];
  if (round >= 2 || opts.all) evPool.push('crash');
  if (has('cache')) evPool.push('cacheFlush');
  if (has('queue')) evPool.push('writeRush');
  if (m.pay > 0) evPool.push('apiSlow');
  if (has('waf')) evPool.push('attack');
  const regions = (opts.all ? R() < REGIONS_CHANCE_ALL : round >= REGIONS_FROM_ROUND && R() < REGIONS_CHANCE_LATE) ? { eu: 0.6, us: 0.4 } : null;
  if (regions) evPool.push('regionDown');
  const nEv = round <= 1 ? 0 : round <= 4 ? 1 : opts.all ? 1 + (R() < 0.5 ? 1 : 0) : 2;
  const events = [], tags = [];
  let spike = null, rush = null;
  const used = new Set();
  for (let k = 0; k < nEv; k++) {
    const type = pick(evPool.filter(x => !used.has(x))); if (!type) break; used.add(type);
    const t = Math.round(between(6, 14));
    tags.push(EVENT_NAMES[type] + ' vers ' + t + ' s');
    if (type === 'crash') events.push({ type, t, target: 0 });
    if (type === 'cacheFlush') events.push({ type, t });
    if (type === 'apiSlow') events.push({ type, from: t, to: t + 7, lat: 3000 });
    if (type === 'attack') events.push({ type, from: t, to: t + 7, mult: 3 });
    if (type === 'regionDown') events.push({ type, t, region: 'primary' });
    if (type === 'spike') spike = { from: t, to: t + 6, k: 1.8 };
    if (type === 'writeRush') rush = { from: t, to: t + 5 };
  }
  const base = wave(0.92, 0.08, 2 + R() * 2);
  const profile = spike ? (t => (t >= spike.from && t < spike.to ? spike.k : 1) * base(t)) : base;
  const mixFix = mixOf(m);
  const mix = rush ? (t => (t >= rush.from && t < rush.to ? mixOf({ ...m, read: m.read * 0.3, write: m.write + m.read * 0.7 }) : mixFix)) : mixFix;
  const lvl = {
    id: opts.id || 'gen' + round, title: opts.title || 'Tour ' + round, bricks, sizes: has('autoscale') || opts.all,
    settingsAllowed: has('breaker') ? ['timeout', 'retries', 'shed'] : [],
    rps, duration, mix, profile, events, regions,
    logged: has('cache') ? 0.5 : 0, fresh: has('replica') ? 0.2 : 0,
    cards: round >= 3 || opts.all ? { [pick(['addServer', 'restart', ...(has('autoscale') ? ['prewarm'] : []), ...(m.reco ? ['degrade'] : []), ...(has('waf') ? ['waf'] : []), ...(has('replica') ? ['promote'] : [])])]: 1 } : {},
    goals: { avail: 99, p95: (opts.p95 || 200) + (regions ? 50 : 0), budget: null },
    story: rps.toLocaleString('fr-FR') + ' req/s' + (m.static ? ', ' + Math.round(m.static * 100) + ' % de statique' : '') + (m.pay ? ', ' + Math.round(m.pay * 100) + ' % de paiements' : '') +
      (m.reco ? ', ' + Math.round(m.reco * 100) + ' % de recos' : '') + (m.upload ? ', des uploads' : '') + (regions ? ', clients à Paris et New York' : '') + '. ' +
      (tags.length ? 'Au programme : ' + tags.join(', ') + '.' : 'Pas d’incident prévu.'),
  };
  return lvl;
}
function dailyLevel(dateStr) {
  const R = rng('tlc-' + dateStr);
  const lv = genLevel(R, 7, { all: true, rps: 800 + Math.round(R() * 16) * 100, id: 'daily-' + dateStr, title: 'Défi du ' + dateStr.split('-').reverse().slice(0, 2).join('/'), p95: 180 });
  return lv;
}

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
    if (met.win && (!d.best || res.cost < d.best)) { d.best = res.cost; best = '<p class="desc" style="font-size:12px;margin:8px 0">🏆 Nouveau record !</p>'; }
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
