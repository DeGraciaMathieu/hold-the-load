// Cherche les infras trois étoiles les moins chères d'une mission, en rejouant chaque candidate avec le moteur du jeu.
// Usage : npm run solve -- <id mission> [--budget <€>] [--max <parties>] [--marge <€>] [--json]
//   --budget  plafond de coût des infras essayées (défaut : budget de la mission)
//   --max     nombre maximal de parties simulées (défaut : 150 000)
//   --marge   on s'arrête quand le coût dépasse la solution la moins chère de cette marge (défaut : 40 €)
//   --json    sortie brute, pour reporter une solution dans tests/solutions.js
// Les infras sont essayées de la moins chère à la plus chère ; pour chacune, les réglages et les moments de jeu des cartes.
// Les briques et réglages sans effet sur la mission sont écartés (pare-feu sans attaque, disjoncteur sans paiements…).
import { LEVELS } from '../src/content/levels.js';
import { CATALOG, GLOBAL } from '../src/content/catalog.js';
import { tr } from '../src/content/texts.js';
import { runAll } from '../src/rules/sim/result.js';
import { goalsMet } from '../src/rules/goals.js';
import { layoutCost } from '../src/rules/layout.js';
import { lbAlgosOf, regionsOf } from '../src/state/context.js';

const SLOTS = { edge: 3, app: 5, svc: 4, data: 4 };
const SIZE_NAMES = { s: 'petit', m: 'moyen', l: 'gros' };

// ---------- arguments
const args = process.argv.slice(2);
const flag = (name, def) => { const k = args.indexOf('--' + name); return k >= 0 ? +args[k + 1] : def; };
const lv = LEVELS.find(l => l.id === args[0]);
if (!lv) { console.error('Mission inconnue. Missions : ' + LEVELS.map(l => l.id).join(' ')); process.exit(1); }
const budget = flag('budget', lv.goals.budget ?? 600), maxSims = flag('max', 150000), margin = flag('marge', 40);

// ---------- ce que la mission rend utile
const mixes = typeof lv.mix === 'function' ? [0, 6, 13, 20].map(t => lv.mix(t)) : [lv.mix];
const uses = c => mixes.some(m => (m[c] || 0) > 0);
const events = (lv.events || []).map(e => e.type);
const useful = { waf: events.includes('attack'), breaker: uses('pay'), objstore: uses('upload'), cdn: uses('static'), bulkhead: uses('pay') || uses('reco') };
// Avec des régions, chaque brique se place dans une région : pour tenir en mémoire, on ne garde que ce qui compte pour elles
// (pas de pooler ; file et workers seulement quand une région tombe).
const regionDown = events.includes('regionDown');
if (lv.regions) Object.assign(useful, { pooler: false, queue: regionDown, worker: regionDown });
const has = t => lv.bricks.includes(t) && useful[t] !== false;
const regs = regionsOf(lv);
const sizes = lv.sizes ? ['s', 'm', 'l'] : ['m'];
const allowed = lv.settingsAllowed || [];

// ---------- combinatoire
const prod = arrs => arrs.reduce((acc, a) => acc.flatMap(x => a.map(y => [...x, y])), [[]]);
const opt = (xs, f) => [null, ...xs.map(f)];
function multisets(items, k, from = 0) { if (!k) return [[]]; const out = []; for (let i = from; i < items.length; i++) for (const r of multisets(items, k - 1, i)) out.push([items[i], ...r]); return out; }
const upTo = (items, max) => Array.from({ length: max + 1 }, (_, k) => multisets(items, k)).flat();
function permutations(a) { if (a.length < 2) return [a]; return [...new Set(a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p].join())))].map(s => s.split(',')); }

// Rangée Application : serveurs, workers, autoscaling et cloisonnements. Quand un serveur tombe (toujours le premier),
// l'ordre des tailles compte : toutes les permutations sont essayées.
function appChoices(serverTypes) {
  const out = [];
  const crash = events.includes('crash');
  const autos = has('autoscale') ? [null, ...[[1, 4, 70], [2, 4, 70], [1, 6, 70], [2, 6, 50], [1, 4, 50]].map(([min, max, seuil]) => ({ type: 'autoscale', opts: { min, max, seuil } }))] : [null];
  const walls = has('bulkhead') ? [[], ['pay'], ['reco'], ['pay', 'reco']].filter(w => w.every(c => uses(c))) : [[]];
  const maxWorkers = has('worker') ? (regs ? 2 : 3) : 0;
  for (const wall of walls) for (const auto of autos) for (let w = 0; w <= maxWorkers; w++) {
    const room = 5 - w - wall.length - (auto ? 1 : 0);
    for (const srv of upTo(serverTypes, Math.min(room, regs ? 4 : 5))) {
      const orders = crash && !regs ? permutations(srv.map(s => s.key)).map(keys => keys.map(k => serverTypes.find(s => s.key === k))) : [[...srv].reverse()];
      for (const o of orders) out.push([...o.map(s => s.brick), ...(auto ? [auto] : []), ...Array(w).fill({ type: 'worker' }), ...wall.map(cls => ({ type: 'bulkhead', opts: { cls } }))]);
    }
  }
  return out;
}

function choices() {
  const inRegion = (b, r) => (regs && !GLOBAL.includes(b.type) ? { ...b, region: r } : b);
  const placeAll = b => (regs && !GLOBAL.includes(b.type) ? regs.map(r => inRegion(b, r)) : [b]);
  const serverTypes = sizes.flatMap(size => (regs || [null]).map(r => ({ key: size + (r || ''), brick: inRegion({ type: 'server', opts: { size } }, r) })));
  const edge = prod([
    has('lb') ? opt(regs ? ['least', 'rr'] : lbAlgosOf(lv), algo => ({ type: 'lb', opts: { algo } })) : [null],
    has('cdn') ? [null, { type: 'cdn' }] : [null],
    has('waf') ? opt(['souple', 'strict'], mode => ({ type: 'waf', opts: { mode } })) : [null],
  ]).map(x => x.filter(Boolean));
  // avec des régions, le cache n'est essayé qu'en durée longue : la combinatoire des régions prend le relais
  const caches = has('cache') ? (regs ? [{ ttl: 'long', antiRuee: false }] : prod([['court', 'moyen', 'long'], [false, true]]).map(([ttl, antiRuee]) => ({ ttl, antiRuee }))) : [];
  const svc = prod([
    [null, ...caches.flatMap(o => placeAll({ type: 'cache', opts: o }))],
    has('queue') ? [null, ...placeAll({ type: 'queue' })] : [null],
    has('pooler') ? [null, ...placeAll({ type: 'pooler' })] : [null],
    has('breaker') ? [null, ...placeAll({ type: 'breaker' })] : [null],
  ]).map(x => x.filter(Boolean));
  const legacy = lv.preset && lv.preset.data[0] && lv.preset.data[0].locked ? lv.preset.data[0] : null;
  const data = [];
  // les lectures sensibles ne servent que si la mission compte les lectures d'après écriture (fraîcheur)
  const heads = legacy ? [[legacy]] : (has('replica') && lv.fresh ? [false, true] : [false]).flatMap(sensible => placeAll({ type: 'db', opts: { sensible } }).map(b => [b]));
  for (const head of heads) for (const reps of upTo(regs || [null], has('replica') ? 3 : 0)) for (const os of has('objstore') ? [false, true] : [false]) {
    if (head[0].opts.sensible && !reps.length) continue;
    if (legacy && !reps.length) continue; // la nouvelle machine est une réplique de l'ancienne base
    const row = [...head, ...reps.map(r => inRegion({ type: 'replica' }, r)), ...(os ? [{ type: 'objstore' }] : [])];
    if (row.length <= SLOTS.data) data.push(row);
  }
  return { edge, app: appChoices(serverTypes), svc, data };
}

const settingsChoices = prod([
  allowed.includes('retries') && (uses('pay') || lv.api) ? [0, 1, 2] : [0],
  allowed.includes('timeout') && uses('pay') ? ['long', 'court'] : ['long'],
  allowed.includes('shed') && uses('reco') ? [false, true] : [false],
]).map(([retries, timeout, shed]) => ({ retries, timeout, shed }));

const cards = lv.cards || {};
const actionChoices = [[]];
const crashAt = (lv.events || []).find(e => e.type === 'crash');
if (cards.restart && crashAt) actionChoices.push([{ t: crashAt.t + 0.25, card: 'restart' }]);
if (cards.prewarm) for (const t of [12, 14, 16, 18]) actionChoices.push([{ t, card: 'prewarm' }]); // quelques secondes avant un pic, le temps de démarrer
if (cards.waf) for (const e of lv.events.filter(x => x.type === 'attack')) actionChoices.push([{ t: e.from, card: 'waf' }, { t: e.to, card: 'waf' }]);
if (cards.degrade) actionChoices.push([{ t: 8, card: 'degrade' }]);
// Promouvoir : juste après la panne de région, ou pendant le creux qui précède l'extinction de l'ancienne base
const down = (lv.events || []).find(e => e.type === 'regionDown'), shutdown = (lv.events || []).find(e => e.type === 'legacyShutdown');
if (cards.promote && down) actionChoices.push([{ t: down.t + 0.25, card: 'promote' }]);
if (cards.promote && shutdown) for (let t = shutdown.t - 12; t <= shutdown.t - 6; t += 0.5) actionChoices.push([{ t, card: 'promote' }]);

// ---------- recherche, de la moins chère à la plus chère
const pad = (row, n) => [...row, ...Array(n - row.length).fill(null)];
const { edge, app, svc, data } = choices();
const cands = [];
for (const d of data) for (const s of svc) for (const e of edge) {
  const base = layoutCost({ edge: e, app: [], svc: s, data: d });
  if (base > budget) continue;
  for (const a of app) { const c = base + layoutCost({ edge: [], app: a, svc: [], data: [] }); if (c <= budget) cands.push([c, e, a, s, d]); }
}
cands.sort((x, y) => x[0] - y[0]);

const passes = [];
let sims = 0, cheapest = Infinity, stopped = false;
search: for (const [c, e, a, s, d] of cands) {
  if (c > cheapest + margin) break; // le coût de l'infra ne dépasse jamais le coût final (usage d'autoscaling compris)
  const L = { edge: pad(e, 3), app: pad(a, 5), svc: pad(s, 4), data: pad(d, 4) };
  // tous les réglages et moments de cartes : avec l'autoscaling, le moment d'une carte change le coût final
  let best = null;
  for (const st of settingsChoices) for (const acts of actionChoices) {
    if (++sims > maxSims) { stopped = true; break search; }
    const res = runAll(lv, L, st, acts);
    if (goalsMet(lv, res).win && (!best || res.cost < best.cost)) best = { cost: res.cost, board: { edge: e, app: a, svc: s, data: d }, settings: st, actions: acts, avail: res.avail, p95: res.p95 };
  }
  if (best) { cheapest = Math.min(cheapest, best.cost); passes.push(best); }
}
passes.sort((x, y) => x.cost - y.cost); // le coût final compte l'usage de l'autoscaling

if (args.includes('--json')) { console.log(JSON.stringify({ id: lv.id, budget, candidates: cands.length, sims, stopped, passes })); process.exit(0); }

// ---------- affichage : la moins chère, puis chaque autre combinaison de briques qui n'est pas une précédente plus une brique inutile
const REG = { eu: 'Paris', us: 'New York', asia: 'Tokyo' };
function label(b) {
  const o = b.opts || {};
  let s = tr(CATALOG[b.type].name, 'fr');
  if (b.type === 'server') s += ' ' + SIZE_NAMES[o.size];
  if (b.type === 'lb' && o.algo && o.algo !== 'rr') s += ' ' + { sticky: 'sticky', least: 'moins chargé' }[o.algo];
  if (b.type === 'waf' && o.mode === 'strict') s += ' strict';
  if (b.type === 'cache') s += ' ' + o.ttl + (o.antiRuee ? ' + anti-ruée' : '');
  if (b.type === 'autoscale') s += ` ${o.min}–${o.max} à ${o.seuil} %`;
  if (b.type === 'bulkhead') s += o.cls === 'pay' ? ' paiements' : ' recos';
  if (b.type === 'db' && o.legacy) s = 'Ancienne base';
  if (b.type === 'db' && o.sensible) s += ' (lectures sensibles)';
  if (b.region) s += ' @' + REG[b.region];
  return s;
}
const group = row => { const m = new Map(); for (const b of row) m.set(label(b), (m.get(label(b)) || 0) + 1); return [...m].map(([l, n]) => (n > 1 ? n + ' × ' : '') + l).join(', ') || '—'; };
const bag = p => Object.values(p.board).flat().map(b => b.type + ((b.opts && (b.opts.size || b.opts.cls || b.opts.algo)) || ''));
const contains = (big, small) => { const m = {}; big.forEach(x => (m[x] = (m[x] || 0) + 1)); return small.every(x => m[x]-- > 0); };
const picks = [];
for (const p of passes) if (!picks.some(q => contains(bag(p), bag(q)))) picks.push(p);

console.log(`${lv.id} · ${lv.title.fr} · budget ${lv.goals.budget ?? '—'} € · ${cands.length} infras sous ${budget} €, ${sims} parties${stopped ? ' (arrêt à --max : une solution moins chère reste possible)' : ''}`);
if (!picks.length) console.log('Aucune infra trois étoiles trouvée.');
for (const p of picks.slice(0, 6)) {
  const st = [p.settings.retries && p.settings.retries + ' nouvel(s) essai(s)', p.settings.timeout === 'court' && 'timeout 0,8 s', p.settings.shed && 'délestage'].filter(Boolean);
  console.log(`\n${p.cost} € · dispo ${p.avail.toFixed(2)} % · p95 ${Math.round(p.p95)} ms`);
  for (const row of Object.keys(SLOTS)) console.log(`  ${row.padEnd(5)} ${group(p.board[row])}`);
  if (st.length) console.log('  réglages ' + st.join(', '));
  if (p.actions.length) console.log('  cartes   ' + p.actions.map(a => `${a.card} à ${a.t} s`).join(', '));
}
