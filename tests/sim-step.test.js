import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim } from '../src/rules/sim/make.js';
import { stepSim } from '../src/rules/sim/step.js';
import { mixOf } from '../src/content/levels.js';

const level = (rps, extra = {}) => ({ rps, duration: 10, mix: mixOf({ read: 1 }), profile: () => 1, ...extra });
const board = ({ edge = [], app = [], svc = [], data = [{ type: 'db' }] }) => {
  const row = (items, n) => [...items, ...Array(n - items.length).fill(null)];
  return { edge: row(edge, 3), app: row(app, 5), svc: row(svc, 4), data: row(data, 4) };
};
const run = (S, steps) => { let tk; for (let i = 0; i < steps; i++) tk = stepSim(S); return tk; };

test('en sticky, un serveur perd 15 % de capacité', () => {
  const rr = stepSim(makeSim(level(340), board({ edge: [{ type: 'lb' }], app: [{ type: 'server' }] })));
  const sticky = stepSim(makeSim(level(340), board({ edge: [{ type: 'lb', opts: { algo: 'sticky' } }], app: [{ type: 'server' }] })));
  assert.equal(rr.servers[0].rho, 0.85);
  assert.equal(sticky.servers[0].rho, 1);
});

test('avec des retries, un serveur saturé s’effondre au lieu de servir ce qu’il peut', () => {
  const layout = board({ app: [{ type: 'server' }] });
  const sans = run(makeSim(level(800), layout), 8);
  const avec = run(makeSim(level(800), layout, { retries: 1 }), 8);
  assert.ok(sans.availNow > 45, `sans retry : ${sans.availNow}`);
  assert.ok(avec.availNow < sans.availNow / 2, `avec retry : ${avec.availNow}`);
});

test('un cache vidé sans anti-ruée multiplie par 2,2 la charge de la base', () => {
  const flush = level(500, { events: [{ type: 'cacheFlush', t: 0 }] });
  const sans = stepSim(makeSim(flush, board({ edge: [{ type: 'lb' }], app: [{ type: 'server', opts: { size: 'l' } }], svc: [{ type: 'cache' }] })));
  const avec = stepSim(makeSim(flush, board({ edge: [{ type: 'lb' }], app: [{ type: 'server', opts: { size: 'l' } }], svc: [{ type: 'cache', opts: { antiRuee: true } }] })));
  assert.equal(avec.nodeRho.data0, 0.5);
  assert.equal(sans.nodeRho.data0, 1.1);
});

test('le pare-feu strict bloque 3 % des vrais clients et laisse passer 2 % des bots', () => {
  const attack = level(400, { events: [{ type: 'attack', from: 0, to: 10, mult: 4 }] });
  const tk = stepSim(makeSim(attack, board({ edge: [{ type: 'lb' }, { type: 'waf', opts: { mode: 'strict' } }], app: [{ type: 'server', opts: { size: 'l' } }] })));
  assert.equal(tk.vis.blockedFrac, 0.03);
  assert.equal(tk.botsPass, 1600 * 0.02);
});

test('la simulation s’arrête au bout de la durée du niveau', () => {
  const S = makeSim(level(100), board({ app: [{ type: 'server' }] }));
  run(S, 40);
  assert.equal(S.done, true);
  assert.equal(stepSim(S), null);
});
