import {
  DT, BASE_LAT, DIST, TTL, LB_LAT, RETRY_LAT, CDN_LAT, CACHE_LAT, QUEUE_LAT, OBJSTORE_LAT, DIRECT_UPLOAD_LAT,
  STATIC_COST, UPLOAD_COST, SIGNED_UPLOAD_COST, PAY_WAIT_DIVISOR, STICKY_CAPACITY, API_DEFAULT_LAT,
  API_BAD_LAT, API_BAD_ERR, BREAKER_OPEN_AFTER, BREAKER_CLOSE_AFTER, TIMEOUT_SHORT, TIMEOUT_LONG,
  CACHE_WARMUP, STAMPEDE_LOAD, WAF_STRICT_BLOCKED, WAF_STRICT_BOTS_PASS, WAF_SOFT_BOTS_PASS, SESSION_LOSS_WINDOW,
  SHED_THRESHOLD, BULKHEAD_CAP, BULKHEAD_CONNS, REPLICA_CAP, POOLER_MAX_CONN, FAILOVER_DELAY, LAG_MIN, LAG_SLOPE,
  LAG_REPLICA_THRESHOLD, LAG_WRITE_DIVISOR, STALE_MAX, STALE_LAG_DIVISOR, WORKER_RATE, WORKER_CONNS,
  AUTO_INSTANCE_CAP, AUTO_BOOT, AUTO_UP_AFTER, AUTO_DOWN_UTIL, AUTO_DOWN_AFTER, AUTO_DOWN_RESET,
} from '../../config.js';
import { CLASSES } from '../../content/catalog.js';
import { REGION_NAMES } from '../../content/texts.js';
import { srvLat, dbLat } from '../latency.js';
import { addReason } from '../stats.js';
import { evActive, receiversOf } from './make.js';
import { promote } from './cards.js';

// Un pas de DT secondes du modèle de flux : modifie S sur place et renvoie le relevé du pas (tick).
// Chaque étape lit dans X ce que les précédentes ont calculé pendant ce pas, et y range ses propres résultats.
export function stepSim(S) {
  if (S.done) return null;
  const X = {};
  fireEvents(S);
  autoFailover(S);
  instantParams(S, X);
  userVolumes(S, X);
  stepServers(S, X);
  stepConnections(S, X);
  routeRequests(S, X);
  stepDatabase(S, X);
  stepWorkers(S, X);
  settleRetries(S, X);
  stepAutoscaling(S, X);
  return recordTick(S, X);
}

// ---- événements ponctuels
function fireEvents(S) {
  const L = S.level, t = S.t;
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
}

// ---- failover automatique
function autoFailover(S) {
  const t = S.t;
  if (S.primary && !S.primary.alive) {
    if (S.failoverAt == null) S.failoverAt = t + FAILOVER_DELAY;
    if (t >= S.failoverAt) promote(S, true);
  }
}

// ---- paramètres de l'instant
function instantParams(S, X) {
  const L = S.level, t = S.t, st = S.settings;
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
  Object.assign(X, { T, api, bots, mix, apiBad, brkOpen, timeoutMs, COST, cacheAlive, hit, stampede, staleShare });
}

// ---- volumes utilisateurs (non amplifiés)
function userVolumes(S, X) {
  const t = S.t, st = S.settings;
  const { T, api, bots, mix, brkOpen, hit } = X;
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
  if (cdnAlive) { okA('static', statIn, BASE_LAT + CDN_LAT); statIn = 0; }
  Object.assign(X, { U, recoOff, r, ampReco, blockedFrac, botsPass, att, tk, A, G, failA, okA, statIn });
}

// ---- étage serveurs
function stepServers(S, X) {
  const L = S.level, t = S.t, st = S.settings;
  const { COST, cacheAlive, r, botsPass, att, tk, A, G, failA, okA, statIn } = X;
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
  // cloisonnements qui reçoivent : vivants et derrière un LB. Leur classe quitte les serveurs partagés.
  const bulkheads = S.lb ? S.bulkheads.filter(b => b.brick.alive) : [];
  const walled = new Set(bulkheads.map(b => b.cls));
  const sharedVol = c => (c === 'static' ? statIn : walled.has(c) ? 0 : att[c]);
  // flux vers le data tier
  const D = { direct: [], jobs: { write: 0, upload: 0, pay: 0 }, dbReads: [], }; // dbReads: [ {c, vol, srv, u, fresh} ]
  const serverRows = [];
  const botsByPool = {};
  for (const u of userRegions) {
    const g = route[u];
    if (!g) {
      // personne pour répondre
      CLASSES.forEach(c => { const v = sharedVol(c) * regShare[u]; failA(c, v, S.fixed.length === 0 && !(S.group) ? 'noServer' : 'crash'); });
      continue;
    }
  }
  for (const g of Object.keys(pools)) {
    const P = pools[g];
    const share = Object.values(P.users).reduce((a, b) => a + b, 0);
    if (share <= 0 && !(botsPass > 0)) { P.servers.forEach(s => tk.servers.push({ id: s.id, rho: 0, receiving: false })); continue; }
    const botShare = Object.keys(pools).length ? 1 / Object.keys(pools).length : 1;
    const vol = {}; CLASSES.forEach(c => (vol[c] = sharedVol(c) * share));
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
  for (const b of bulkheads) stepBulkhead(S, X, b, { userRegions, regShare, sessFrac, serverRows });
  Object.assign(X, { recv, sessFrac, D, serverRows, bulkheads });
}

// Un cloisonnement reçoit sa classe de toutes les régions. Saturé, il ne fait échouer qu'elle.
function stepBulkhead(S, X, b, { userRegions, regShare, sessFrac, serverRows }) {
  const st = S.settings;
  const { COST, r, att, tk, A, failA } = X;
  const c = b.cls;
  let v = att[c];
  let W = v * COST[c];
  // délestage, comme sur les serveurs partagés
  if (c === 'reco' && st.shed && W / BULKHEAD_CAP > SHED_THRESHOLD) {
    const shed = Math.min(v, (W - SHED_THRESHOLD * BULKHEAD_CAP) / COST.reco);
    v -= shed; W -= shed * COST.reco;
    A.reco.shed = (A.reco.shed || 0) + shed;
    A.reco.vol -= shed;
  }
  const rho = W / BULKHEAD_CAP;
  const served = rho > 1 ? (r > 0 ? Math.max(0, 2 / rho - 1) : 1 / rho) : 1;
  const lat = srvLat(rho) + LB_LAT;
  tk.servers.push({ id: b.id, rho, receiving: v > 0, kind: 'bulkhead' });
  for (const u of userRegions) {
    const vu = v * regShare[u];
    if (vu <= 0) continue;
    failA(c, vu * (1 - served), 'bulkheadSat');
    let sv = vu * served;
    const sess = sv * sessFrac;
    failA(c, sess, 'session'); sv -= sess;
    serverRows.push({ c, v: sv, g: b.region, u, base: BASE_LAT + DIST[u][b.region] + lat });
  }
}

// ---- connexions
function stepConnections(S, X) {
  const { recv, tk, bulkheads } = X;
  let conns = recv.reduce((a, s) => a + s.conns, 0) + S.workers.filter(w => w.alive).length * WORKER_CONNS;
  conns += bulkheads.length * BULKHEAD_CONNS;
  if (S.pooler && S.pooler.alive) conns = Math.min(conns, POOLER_MAX_CONN);
  const prim = S.primary && S.primary.alive ? S.primary : null;
  const maxConn = prim ? prim.maxConn : 0;
  const connFail = prim && conns > maxConn ? 1 - maxConn / conns : 0;
  tk.conns = conns; tk.maxConn = maxConn;
  Object.assign(X, { prim, connFail });
}

// ---- aiguillage applicatif
function routeRequests(S, X) {
  const L = S.level;
  const { api, brkOpen, timeoutMs, cacheAlive, hit, stampede, staleShare, A, failA, okA, D, serverRows, prim, connFail } = X;
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
        okA(c, v, base + OBJSTORE_LAT + DIST[g][S.objstore.region]); D.jobs.upload += v; continue;
      }
      okA(c, v, base * DIRECT_UPLOAD_LAT); continue;
    }
    if (c === 'pay') {
      if (brkOpen) {
        if (queueAlive && wAlive > 0) { okA(c, v, base + QUEUE_LAT); D.jobs.pay += v; }
        else failA(c, v, 'apiDown');
        continue;
      }
      if (api.lat > timeoutMs) { failA(c, v, 'apiTimeout'); continue; }
      failA(c, v * api.err, 'apiDown');
      okA(c, v * (1 - api.err), base + api.lat);
      continue;
    }
    if (c === 'write') {
      if (queueAlive) { okA(c, v, base + QUEUE_LAT + DIST[g][S.queue.region]); D.jobs.write += v; continue; }
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
        okA(c, h, base + CACHE_LAT + DIST[g][S.cache.region]);
        if (c === 'read') { A.main.stale += h * staleShare; A.main.cached += h; }
        miss = vn - h;
      }
      if (miss > 0) {
        if (!dbNodes.length) failA(c, miss, S.primary ? 'dbDown' : 'noDb');
        else { failA(c, miss * connFail, 'conn'); D.dbReads.push({ c, v: miss * (1 - connFail), g, base: base + (cacheAlive ? 2 : 0), load: stampede }); }
      }
    }
  }
  Object.assign(X, { wAlive, dbNodes, directWrites });
}

// ---- étage base
function stepDatabase(S, X) {
  const { tk, failA, okA, D, prim, dbNodes, directWrites } = X;
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
  Object.assign(X, { nodeLoad, directW, nodeRho, nodeServed, pStale });
}

// ---- workers
function stepWorkers(S, X) {
  const { apiBad, brkOpen, D, prim, wAlive, nodeLoad, directW, nodeRho } = X;
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
  X.drained = drained;
}

// ---- retries : passage tentatives -> utilisateurs
function settleRetries(S, X) {
  const { U, recoOff, r, ampReco, blockedFrac, A } = X;
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
  Object.assign(X, { fm, mainU, blockedMain });
}

// ---- autoscaling
function stepAutoscaling(S, X) {
  const t = S.t;
  const { tk } = X;
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
}

// ---- état visuel
function recordTick(S, X) {
  const { bots, apiBad, hit, stampede, blockedFrac, botsPass, tk, sessFrac, prim, connFail, dbNodes, nodeRho, nodeServed, pStale, drained, fm, mainU, blockedMain } = X;
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
