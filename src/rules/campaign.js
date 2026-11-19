import { CAMP_BASE_REVENUE, CAMP_REVENUE_PER_RPS, CAMP_AVAIL_FLOOR, CAMP_AVAIL_SPAN, CAMP_SLOW_PENALTY } from '../config.js';

// Revenu d'un tour : nul sous CAMP_AVAIL_FLOOR % de dispo, plein à +CAMP_AVAIL_SPAN points, amputé si la p95 dépasse l'objectif.
export function campRevenue(lv, avail, p95) {
  const full = CAMP_BASE_REVENUE + lv.rps * CAMP_REVENUE_PER_RPS;
  const k = Math.max(0, Math.min(1, (avail - CAMP_AVAIL_FLOOR) / CAMP_AVAIL_SPAN));
  return Math.round(full * k * (p95 > lv.goals.p95 ? CAMP_SLOW_PENALTY : 1));
}

// Bilan d'un tour joué avec `cash` en caisse. brokeBy : 'avail' (clients partis), 'cash' (trésorerie à sec) ou null.
export function campOutcome(lv, res, cash) {
  const rev = campRevenue(lv, res.avail, res.p95);
  const net = rev - res.cost;
  const after = cash + net;
  const brokeBy = res.avail < CAMP_AVAIL_FLOOR ? 'avail' : after < 0 ? 'cash' : null;
  return { rev, net, cash: after, brokeBy };
}

// Partie après un tour réussi.
export function nextRound(camp, { cash, net, avail }) {
  return { ...camp, cash, history: [...camp.history, { round: camp.round, net, avail }], round: camp.round + 1 };
}

// Record : nombre de tours passés dans la partie.
export function campRecord(best, camp) { return Math.max(best || 0, camp.round - 1); }
