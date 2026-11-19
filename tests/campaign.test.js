import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campRevenue, campOutcome, nextRound, campRecord } from '../src/rules/campaign.js';

const tour = { rps: 1000, goals: { p95: 200 } }; // revenu plein : 120 + 1000 × 0,2 = 320 €

test('à 99 % de disponibilité et plus, le tour rapporte le revenu plein', () => {
  assert.equal(campRevenue(tour, 99, 150), 320);
  assert.equal(campRevenue(tour, 100, 150), 320);
});

test('le revenu fond entre 99 % et 95 %, et la lenteur en coûte 30 %', () => {
  assert.equal(campRevenue(tour, 97, 150), 160);
  assert.equal(campRevenue(tour, 95, 150), 0);
  assert.equal(campRevenue(tour, 100, 250), 224);
});

test('sous 95 % de disponibilité, c’est la faillite : les clients sont partis', () => {
  const out = campOutcome(tour, { avail: 94, p95: 150, cost: 100 }, 1000);
  assert.equal(out.brokeBy, 'avail');
});

test('une infra plus chère que ce qu’elle rapporte vide la trésorerie jusqu’à la faillite', () => {
  assert.deepEqual(campOutcome(tour, { avail: 100, p95: 150, cost: 500 }, 300), { rev: 320, net: -180, cash: 120, brokeBy: null });
  assert.equal(campOutcome(tour, { avail: 100, p95: 150, cost: 500 }, 100).brokeBy, 'cash');
});

test('passer un tour encaisse le net, l’inscrit à l’historique et fait monter le record', () => {
  const camp = { seed: 7, round: 3, cash: 300, history: [], over: false };
  const next = nextRound(camp, { cash: 420, net: 120, avail: 99.5 });
  assert.deepEqual(next, { seed: 7, round: 4, cash: 420, history: [{ round: 3, net: 120, avail: 99.5 }], over: false });
  assert.equal(camp.round, 3, 'la partie d’origine n’est pas modifiée');
  assert.equal(campRecord(2, next), 3);
});
