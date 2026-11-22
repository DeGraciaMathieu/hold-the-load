import {
  CAMP_RPS_START, CAMP_RPS_GROWTH, REGIONS_CHANCE_ALL, REGIONS_CHANCE_LATE, REGIONS_FROM_ROUND,
  GEN_DURATION, GEN_EVENT_FROM, GEN_EVENT_TO, GEN_INCIDENT_LENGTH, GEN_API_SLOW_LAT, GEN_ATTACK_MULT,
  GEN_SPIKE_LENGTH, GEN_SPIKE_K, GEN_RUSH_LENGTH, GEN_RUSH_READS_KEPT, GEN_RUSH_READS_TO_WRITE,
} from '../config.js';
import { EVENT_NAMES } from '../content/texts.js';
import { mixOf, wave } from '../content/levels.js';

// Générateur pseudo-aléatoire à graine (xorshift sur un hash FNV-1a) : même graine, même niveau.
export function rng(seed) { let s = hashStr('s' + seed) || 1; const f = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; for (let i = 0; i < 8; i++) f(); return f; }
function hashStr(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const UNLOCKS = [
  ['server', 'db', 'lb'], ['cache'], ['cdn', 'replica'], ['queue', 'worker'], ['autoscale'], ['breaker', 'waf', 'pooler', 'bulkhead'], ['objstore'],
];

// round: 1..n ; difficulté croissante
export function genLevel(R, round, opts = {}) {
  const pick = a => a[Math.floor(R() * a.length)];
  const between = (a, b) => a + (b - a) * R();
  const bricks = []; UNLOCKS.slice(0, Math.min(UNLOCKS.length, Math.ceil(round / 1.5) + 1)).forEach(u => bricks.push(...u));
  if (opts.all) bricks.splice(0, bricks.length, ...UNLOCKS.flat());
  const has = t => bricks.includes(t);
  const rps = Math.round((opts.rps || CAMP_RPS_START * Math.pow(CAMP_RPS_GROWTH, round - 1)) / 50) * 50;
  const m = { static: has('cdn') ? between(0.15, 0.45) : 0, write: between(0.05, 0.15), pay: has('breaker') ? between(0.05, 0.15) : 0,
    reco: has('autoscale') && R() < 0.5 ? between(0.1, 0.25) : 0, upload: has('objstore') && R() < 0.5 ? between(0.02, 0.05) : 0 };
  m.read = Math.max(0.2, 1 - m.static - m.write - m.pay - m.reco - m.upload);
  const duration = GEN_DURATION;
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
    const t = Math.round(between(GEN_EVENT_FROM, GEN_EVENT_TO));
    tags.push(EVENT_NAMES[type] + ' vers ' + t + ' s');
    if (type === 'crash') events.push({ type, t, target: 0 });
    if (type === 'cacheFlush') events.push({ type, t });
    if (type === 'apiSlow') events.push({ type, from: t, to: t + GEN_INCIDENT_LENGTH, lat: GEN_API_SLOW_LAT });
    if (type === 'attack') events.push({ type, from: t, to: t + GEN_INCIDENT_LENGTH, mult: GEN_ATTACK_MULT });
    if (type === 'regionDown') events.push({ type, t, region: 'primary' });
    if (type === 'spike') spike = { from: t, to: t + GEN_SPIKE_LENGTH, k: GEN_SPIKE_K };
    if (type === 'writeRush') rush = { from: t, to: t + GEN_RUSH_LENGTH };
  }
  const base = wave(0.92, 0.08, 2 + R() * 2);
  const profile = spike ? (t => (t >= spike.from && t < spike.to ? spike.k : 1) * base(t)) : base;
  const mixFix = mixOf(m);
  const mix = rush ? (t => (t >= rush.from && t < rush.to ? mixOf({ ...m, read: m.read * GEN_RUSH_READS_KEPT, write: m.write + m.read * GEN_RUSH_READS_TO_WRITE }) : mixFix)) : mixFix;
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

export function dailyLevel(dateStr) {
  const R = rng('tlc-' + dateStr);
  const lv = genLevel(R, 7, { all: true, rps: 800 + Math.round(R() * 16) * 100, id: 'daily-' + dateStr, title: 'Défi du ' + dateStr.split('-').reverse().slice(0, 2).join('/'), p95: 180 });
  return lv;
}
