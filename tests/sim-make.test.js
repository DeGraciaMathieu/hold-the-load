import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, receiversOf, evActive } from '../src/rules/sim/make.js';

const level = { duration: 20, events: [{ type: 'apiSlow', from: 6, to: 16, lat: 4000 }] };
const layout = (edge, app, data = [{ type: 'db' }, null, null, null]) => ({ edge, app, svc: [null, null, null, null], data });

test('sans load balancer, un seul serveur reçoit le trafic', () => {
  const S = makeSim(level, layout([null, null, null], [{ type: 'server' }, { type: 'server' }, null, null, null]));
  assert.deepEqual(receiversOf(S).map(s => s.id), ['app0']);
});

test('avec un load balancer, tous les serveurs vivants reçoivent le trafic', () => {
  const S = makeSim(level, layout([{ type: 'lb' }, null, null], [{ type: 'server' }, { type: 'server', opts: { size: 'l' } }, null, null, null]));
  assert.deepEqual(receiversOf(S).map(s => [s.id, s.cap]), [['app0', 400], ['app1', 1000]]);
});

test('une instance d’autoscaling ne reçoit du trafic qu’une fois démarrée', () => {
  const S = makeSim(level, layout([{ type: 'lb' }, null, null], [{ type: 'autoscale', opts: { min: 2, max: 6, seuil: 70 } }, null, null, null, null]));
  assert.equal(receiversOf(S).length, 2);
  S.group.inst.push({ readyAt: 6, alive: true, region: 'eu' });
  assert.equal(receiversOf(S).length, 2);
  S.t = 6;
  assert.equal(receiversOf(S).length, 3);
});

test('l’ancienne base encaisse 600 req/s et 100 connexions, la nouvelle 1 000 et 150', () => {
  const legacy = makeSim(level, layout([null, null, null], [null, null, null, null, null], [{ type: 'db', opts: { legacy: true } }, null, null, null]));
  const fresh = makeSim(level, layout([null, null, null], [null, null, null, null, null]));
  assert.deepEqual([legacy.primary.cap, legacy.primary.maxConn], [600, 100]);
  assert.deepEqual([fresh.primary.cap, fresh.primary.maxConn], [1000, 150]);
});

test('un incident n’est actif que pendant sa fenêtre', () => {
  assert.equal(evActive(level, 'apiSlow', 5.75).length, 0);
  assert.equal(evActive(level, 'apiSlow', 6).length, 1);
  assert.equal(evActive(level, 'apiSlow', 16).length, 0);
});
