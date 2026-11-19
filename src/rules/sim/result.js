import { WORKER_RATE, BACKLOG_TOLERANCE, AUTO_INSTANCE_COST } from '../../config.js';
import { p95, addReason } from '../stats.js';
import { layoutCost } from '../layout.js';
import { makeSim } from './make.js';
import { useCard } from './cards.js';
import { stepSim } from './step.js';

// Bilan d'une partie : disponibilité, latence p95, coût, fraîcheur, recos, causes d'échec.
export function resultOf(S) {
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

// Partie complète sans affichage, cartes jouées aux instants donnés.
export function runAll(level, layout, settings, actions) {
  const S = makeSim(level, layout, settings);
  const acts = [...(actions || [])].sort((a, b) => a.t - b.t);
  while (!S.done) {
    while (acts.length && acts[0].t <= S.t) useCard(S, acts.shift().card);
    stepSim(S);
  }
  return resultOf(S);
}
