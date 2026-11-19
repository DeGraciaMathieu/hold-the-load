import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srvLat, dbLat } from '../src/rules/latency.js';

test('un serveur au repos répond en 30 ms, saturé en 120 ms', () => {
  assert.equal(srvLat(0), 30);
  assert.equal(srvLat(1), 120);
});

test('au-delà de la saturation la latence ne grimpe plus : ce sont les requêtes qui échouent', () => {
  assert.equal(srvLat(3), srvLat(1));
  assert.equal(dbLat(2), 60);
});

test('à mi-charge la latence reste proche du repos', () => {
  assert.ok(srvLat(0.5) < 45);
});
