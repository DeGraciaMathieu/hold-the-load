import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim } from '../src/rules/sim/make.js';
import { useCard } from '../src/rules/sim/cards.js';

const level = cards => ({ duration: 20, cards });
const layout = {
  edge: [{ type: 'lb' }, null, null],
  app: [{ type: 'server' }, null, null, null, null],
  svc: [null, null, null, null],
  data: [{ type: 'db' }, { type: 'replica' }, null, null],
};

test('une carte jouée est consommée ; sans carte en main, rien ne se passe', () => {
  const S = makeSim(level({ addServer: 1 }), layout);
  assert.equal(useCard(S, 'addServer').ok, true);
  assert.equal(S.cards.addServer, 0);
  assert.deepEqual(useCard(S, 'addServer'), { ok: false, msg: { k: 'noCard' } });
});

test('le serveur en renfort démarre en 5 s et coûte 40 € de plus', () => {
  const S = makeSim(level({ addServer: 1 }), layout);
  S.t = 3;
  useCard(S, 'addServer');
  assert.equal(S.temps[0].readyAt, 8);
  assert.equal(S.extraCost, 40);
});

test('relancer sans serveur tombé ne consomme pas la carte', () => {
  const S = makeSim(level({ restart: 1 }), layout);
  assert.deepEqual(useCard(S, 'restart'), { ok: false, msg: { k: 'noDead' } });
  assert.equal(S.cards.restart, 1);
});

test('promouvoir la réplique en pleine charge perd les écritures pas encore répliquées', () => {
  const S = makeSim(level({ promote: 1 }), layout);
  S.lastWriteRate = 100;
  useCard(S, 'promote');
  assert.equal(S.primary.brick.id, 'data1');
  assert.equal(S.replicas.length, 0);
  assert.equal(S.acc.reasons.promoLoss, 100 * (0.3 + 3));
});
