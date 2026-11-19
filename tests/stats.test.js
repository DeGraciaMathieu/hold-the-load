import { test } from 'node:test';
import assert from 'node:assert/strict';
import { p95, addReason } from '../src/rules/stats.js';

test('la latence p95 est celle sous laquelle passent 95 % des requêtes, pondérées par volume', () => {
  assert.equal(p95([[50, 90], [400, 10]]), 400);
  assert.equal(p95([[50, 96], [400, 4]]), 50);
});

test('sans aucune requête réussie, la latence p95 vaut 0', () => {
  assert.equal(p95([]), 0);
});

test('les causes d’échec s’additionnent et une cause nulle n’apparaît pas', () => {
  const reasons = { serverSat: 10 };
  addReason(reasons, 'serverSat', 5);
  addReason(reasons, 'dbSat', 0);
  assert.deepEqual(reasons, { serverSat: 15 });
});
