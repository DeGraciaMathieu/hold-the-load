import {
  DT, SIZES, PRIMARY_CAP, PRIMARY_MAX_CONN, LEGACY_CAP, LEGACY_MAX_CONN,
  LAG_MIN, AUTO_INSTANCE_CAP, AUTO_INSTANCE_CONNS,
} from '../../config.js';
import { ROW_DEF } from '../../content/catalog.js';
import { defaultOpts } from '../layout.js';

// État d'une partie en cours. Le simulateur le modifie sur place à chaque pas (voir docs/decisions.md).
export function makeSim(level, layout, settings) {
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

export function evActive(level, type, t) { return (level.events || []).filter(e => e.type === type && t >= e.from && t < e.to); }

export function receiversOf(S) {
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
