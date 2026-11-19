import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutCost, brickCost, emptyLayout, hasType } from '../src/rules/layout.js';

test('le coût mensuel est la somme des briques posées, options comprises', () => {
  const layout = {
    edge: [{ type: 'lb' }, null, null],
    app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }, null, null, null],
    svc: [{ type: 'cache', opts: { ttl: 'moyen', antiRuee: true } }, null, null, null],
    data: [{ type: 'db' }, null, null, null],
  };
  // LB 20 + gros 85 + moyen 40 + Redis 35 + anti-ruée 10 + base 90
  assert.equal(layoutCost(layout), 280);
});

test('une brique sans options réglées prend les options par défaut', () => {
  assert.equal(brickCost({ type: 'server' }), 40);
  assert.equal(brickCost({ type: 'db', opts: { legacy: true } }), 120);
});

test('un plateau vide ne coûte rien et ne contient aucune brique', () => {
  const L = emptyLayout();
  assert.equal(layoutCost(L), 0);
  assert.equal(hasType(L, 'server'), false);
  assert.deepEqual(Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length])), { edge: 3, app: 5, svc: 4, data: 4 });
});
