import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../src/rules/sim/result.js';
import { LEVELS } from '../src/content/levels.js';

const premierClient = LEVELS.find(lv => lv.id === 'm01');
const layout = app => ({ edge: [null, null, null], app: [...app, ...Array(5 - app.length).fill(null)], svc: [null, null, null, null], data: [{ type: 'db' }, null, null, null] });

test('« Premier client » tient avec un serveur moyen et une base, pour 130 €', () => {
  const res = runAll(premierClient, layout([{ type: 'server' }]));
  assert.equal(res.avail, 100);
  assert.equal(res.cost, 130);
  assert.ok(res.p95 <= premierClient.goals.p95);
});

test('sans serveur, aucune requête n’aboutit et la cause est nommée', () => {
  const res = runAll(premierClient, layout([]));
  assert.equal(res.avail, 0);
  assert.deepEqual(Object.keys(res.reasons), ['noServer']);
});

test('le serveur en renfort se paie en plus de l’infra posée', () => {
  const level = { ...premierClient, cards: { addServer: 1 } };
  const res = runAll(level, layout([{ type: 'server' }]), undefined, [{ t: 5, card: 'addServer' }]);
  assert.equal(res.cost, 170);
});
