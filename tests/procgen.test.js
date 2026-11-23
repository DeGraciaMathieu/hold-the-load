import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng, genLevel, dailyLevel } from '../src/rules/procgen.js';

const strip = lv => JSON.parse(JSON.stringify(lv)); // les fonctions profile/mix disparaissent

test('une même graine redonne exactement le même tour de Croissance', () => {
  assert.deepEqual(strip(genLevel(rng('42:5'), 5)), strip(genLevel(rng('42:5'), 5)));
  assert.notDeepEqual(strip(genLevel(rng('42:5'), 5)), strip(genLevel(rng('43:5'), 5)));
});

test('le premier tour est calme : 300 req/s, les briques de base, aucun incident', () => {
  const lv = genLevel(rng('1:1'), 1);
  assert.equal(lv.rps, 300);
  assert.deepEqual(lv.bricks, ['server', 'db', 'lb', 'cache']);
  assert.deepEqual(lv.events, []);
});

test('le trafic grossit de 32 % par tour, arrondi à 50 req/s', () => {
  assert.equal(genLevel(rng('1:2'), 2).rps, 400);
  assert.equal(genLevel(rng('1:5'), 5).rps, 900);
});

test('le défi du jour est le même pour tout le monde à une date donnée, avec toutes les briques', () => {
  const a = dailyLevel('2026-11-19'), b = dailyLevel('2026-11-19');
  assert.deepEqual(strip(a), strip(b));
  assert.deepEqual(a.title, { k: 'dailyTitle', p: { d: '2026-11-19' } });
  assert.equal(a.bricks.length, 14);
  assert.equal(a.goals.budget, null);
});

test('le cloisonnement arrive en Croissance avec le disjoncteur', () => {
  for (let round = 1; round <= 12; round++) {
    const { bricks } = genLevel(rng('1:' + round), round);
    assert.equal(bricks.includes('bulkhead'), bricks.includes('breaker'), `tour ${round}`);
  }
});
