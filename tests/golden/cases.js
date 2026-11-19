// Jeu de cas figé pour l'instantané de référence (golden master).
// Les mêmes cas sont rejoués sur le prototype d'origine (make-golden.js) et sur le code
// refactoré (golden.test.js) : toute différence est un changement de comportement.
import { createHash } from 'node:crypto';

const SLOTS = { edge: 3, app: 5, svc: 4, data: 4 };
const DT = 0.25;

function fill(spec) {
  const L = {};
  for (const [row, n] of Object.entries(SLOTS)) {
    L[row] = Array(n).fill(null);
    (spec[row] || []).forEach((b, i) => { L[row][i] = b; });
  }
  return L;
}

const LAYOUTS = {
  empty: () => fill({}),
  minimal: () => fill({ app: [{ type: 'server' }], data: [{ type: 'db' }] }),
  noLb: () => fill({ app: [{ type: 'server' }, { type: 'server', opts: { size: 's' } }], data: [{ type: 'db' }] }),
  mid: algo => fill({
    edge: [{ type: 'lb', opts: { algo } }],
    app: [{ type: 'server' }, { type: 'server' }, { type: 'server', opts: { size: 'l' } }, { type: 'worker' }],
    svc: [{ type: 'cache' }, { type: 'queue' }],
    data: [{ type: 'db' }, { type: 'replica' }],
  }),
  full: () => fill({
    edge: [{ type: 'lb', opts: { algo: 'least' } }, { type: 'cdn' }, { type: 'waf' }],
    app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }, { type: 'server', opts: { size: 's' } }, { type: 'autoscale', opts: { min: 2, max: 8, seuil: 50 } }, { type: 'worker' }],
    svc: [{ type: 'cache', opts: { ttl: 'long', antiRuee: true } }, { type: 'queue' }, { type: 'pooler' }, { type: 'breaker' }],
    data: [{ type: 'db', opts: { sensible: true } }, { type: 'replica' }, { type: 'replica' }, { type: 'objstore' }],
  }),
  fullStrict: () => fill({
    edge: [{ type: 'lb', opts: { algo: 'sticky' } }, { type: 'cdn' }, { type: 'waf', opts: { mode: 'strict' } }],
    app: [{ type: 'server' }, { type: 'server' }, { type: 'autoscale' }, { type: 'worker' }, { type: 'worker' }],
    svc: [{ type: 'cache', opts: { ttl: 'court' } }, { type: 'queue' }, { type: 'breaker' }],
    data: [{ type: 'db' }, { type: 'replica' }],
  }),
  regions: () => fill({
    edge: [{ type: 'lb', opts: { algo: 'least' } }, { type: 'cdn' }],
    app: [{ type: 'server', region: 'eu' }, { type: 'server', region: 'us' }, { type: 'server', region: 'asia' }, { type: 'autoscale', region: 'us' }, { type: 'worker', region: 'us' }],
    svc: [{ type: 'cache', region: 'eu' }, { type: 'queue', region: 'eu' }, { type: 'pooler' }, { type: 'breaker' }],
    data: [{ type: 'db', region: 'eu' }, { type: 'replica', region: 'us' }, { type: 'replica', region: 'asia' }, { type: 'objstore', region: 'us' }],
  }),
};

const SETTINGS = {
  default: undefined,
  harsh: { retries: 2, timeout: 'court', shed: true },
  retry1: { retries: 1 },
};

const ALL_CARDS = { addServer: 1, restart: 1, prewarm: 1, degrade: 1, waf: 2, promote: 1 };
const CARD_ACTIONS = [
  { t: 3, card: 'waf' }, { t: 6, card: 'addServer' }, { t: 9, card: 'restart' },
  { t: 10, card: 'prewarm' }, { t: 11, card: 'degrade' }, { t: 12.5, card: 'promote' }, { t: 14, card: 'waf' },
];

export function simCases(labelled) {
  const out = [];
  for (const [label, level] of labelled) {
    const layouts = [['empty', LAYOUTS.empty()], ['minimal', LAYOUTS.minimal()], ['noLb', LAYOUTS.noLb()],
      ['mid-rr', LAYOUTS.mid('rr')], ['mid-sticky', LAYOUTS.mid('sticky')], ['mid-least', LAYOUTS.mid('least')],
      ['full', LAYOUTS.full()], ['fullStrict', LAYOUTS.fullStrict()], ['regions', LAYOUTS.regions()]];
    if (level.preset) layouts.push(['preset', JSON.parse(JSON.stringify(level.preset))]);
    for (const [ln, layout] of layouts) {
      for (const [sn, settings] of Object.entries(SETTINGS)) {
        out.push({ name: `${label}/${ln}/${sn}`, level, layout, settings, actions: [] });
      }
    }
    for (const ln of ['mid-rr', 'full', 'regions']) {
      const layout = ln === 'mid-rr' ? LAYOUTS.mid('rr') : LAYOUTS[ln]();
      out.push({ name: `${label}/${ln}/cards`, level: { ...level, cards: ALL_CARDS }, layout, settings: undefined, actions: CARD_ACTIONS });
    }
  }
  return out;
}

export const CAMP_SEEDS = [1, 42, 987654321];
export const CAMP_ROUNDS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const DAILY_DATES = ['2026-01-01', '2026-06-15', '2026-11-19', '2027-02-28'];

// Les niveaux contiennent des fonctions (profile, mix) : on les échantillonne à chaque pas.
export function describeLevel(lv) {
  const samples = [];
  for (let t = 0; t < lv.duration; t += DT) {
    samples.push([lv.profile(t), typeof lv.mix === 'function' ? lv.mix(t) : lv.mix]);
  }
  const plain = Object.fromEntries(Object.entries(lv).filter(([, v]) => typeof v !== 'function'));
  return { ...plain, samples: hash(samples) };
}

const DIGEST_FIELDS = ['t', 'T', 'bots', 'botsPass', 'hit', 'receivers', 'servers', 'conns', 'maxConn', 'lag', 'availNow',
  'vis', 'backlog', 'nodeRho', 'dbNodes', 'primaryId', 'drained', 'autoCount', 'autoReady', 'brkOpen', 'api'];

// Rejoue un cas avec les fonctions du moteur fournies : résultat final + empreinte de chaque pas.
export function runCase(engine, c) {
  const { makeSim, stepSim, useCard, resultOf } = engine;
  const S = makeSim(c.level, JSON.parse(JSON.stringify(c.layout)), c.settings);
  const acts = [...c.actions];
  const cardResults = [];
  while (!S.done) {
    while (acts.length && acts[0].t <= S.t) { const a = acts.shift(); cardResults.push([a.card, useCard(S, a.card)]); }
    stepSim(S);
  }
  const ticks = S.ticks.map(tk => Object.fromEntries(DIGEST_FIELDS.map(k => [k, tk[k]])));
  return { result: resultOf(S), cards: cardResults, ticks: hash(ticks) };
}

export function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export const REVENUE_GRID = (() => {
  const g = [];
  for (const avail of [0, 90, 95, 96.5, 98, 99, 99.9, 100]) for (const p95 of [100, 200, 201]) g.push({ avail, p95 });
  return g;
})();

// Construit tout l'instantané à partir d'un moteur (d'origine ou refactoré).
export function snapshot(engine) {
  const { LEVELS, genLevel, rng, dailyLevel, campRevenue, runAll } = engine;
  const camp = [], labelled = LEVELS.map(lv => [lv.id, lv]);
  for (const seed of CAMP_SEEDS) for (const round of CAMP_ROUNDS) {
    const lv = genLevel(rng(seed + ':' + round), round);
    camp.push(lv); labelled.push([`camp-${seed}-${round}`, lv]);
  }
  const daily = DAILY_DATES.map(d => dailyLevel(d));
  DAILY_DATES.forEach((d, k) => labelled.push([`daily-${d}`, daily[k]]));
  const sims = {};
  for (const c of simCases(labelled)) sims[c.name] = runCase(engine, c);
  const runAllCheck = LEVELS.map(lv => runAll(lv, LAYOUTS.full(), SETTINGS.harsh, CARD_ACTIONS));
  return {
    levels: LEVELS.map(describeLevel),
    camp: camp.map(describeLevel),
    daily: daily.map(describeLevel),
    revenue: LEVELS.map(lv => REVENUE_GRID.map(({ avail, p95 }) => campRevenue(lv, avail, p95))),
    runAll: hash(runAllCheck),
    sims,
  };
}
