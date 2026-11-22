import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../src/rules/sim/result.js';
import { LEVELS } from '../src/content/levels.js';
import { goalsMet } from '../src/rules/goals.js';

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

const couloir = LEVELS.find(lv => lv.id === 'm15b');
const couloirBoard = app => ({ edge: [{ type: 'lb', opts: { algo: 'least' } }, null, null], app: [...app, ...Array(5 - app.length).fill(null)],
  svc: [{ type: 'cache' }, null, null, null], data: [{ type: 'db' }, null, null, null] });

test('« Chacun son couloir » se gagne avec un cloisonnement Paiements, pour 300 €', () => {
  const res = runAll(couloir, couloirBoard([{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 's' } }, { type: 'bulkhead' }]));
  assert.equal(res.cost, 300);
  assert.ok(goalsMet(couloir, res).win);
  assert.deepEqual(Object.keys(res.reasons).filter(k => res.reasons[k] > 0), ['bulkheadSat']);
});

test('« Chacun son couloir » : la même capacité sans cloisonnement laisse tomber tout le site', () => {
  const res = runAll(couloir, couloirBoard([{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 's' } }, { type: 'server' }]));
  assert.ok(res.avail < couloir.goals.avail, `dispo ${res.avail}`);
  assert.ok(res.reasons.serverSat > 0);
});
