import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/content/levels.js';
import { runAll } from '../src/rules/sim/result.js';
import { goalsMet } from '../src/rules/goals.js';
import { SOLUTIONS } from './solutions.js';

// Une règle ou un réglage d'équilibrage qui rend une mission impossible casse ce test : l'instantané de référence,
// lui, ne dit pas si une mission reste gagnable.
const SLOTS = { edge: 3, app: 5, svc: 4, data: 4 };
const fill = board => Object.fromEntries(Object.entries(SLOTS).map(([row, n]) => [row, [...(board[row] || []), ...Array(n).fill(null)].slice(0, n)]));

test('chaque mission a une solution de référence', () => {
  assert.deepEqual(LEVELS.map(lv => lv.id).filter(id => !SOLUTIONS[id]), []);
});

for (const lv of LEVELS) {
  const ref = SOLUTIONS[lv.id];
  if (!ref) continue;
  test(`« ${lv.title.fr} » se gagne en trois étoiles pour ${ref.cost} €`, () => {
    const res = runAll(lv, fill(ref.board), ref.settings, ref.actions);
    const met = goalsMet(lv, res);
    assert.ok(met.win, `objectifs : ${JSON.stringify(met)}, dispo ${res.avail.toFixed(2)} %, p95 ${Math.round(res.p95)} ms`);
    assert.equal(res.cost, ref.cost);
  });
}
