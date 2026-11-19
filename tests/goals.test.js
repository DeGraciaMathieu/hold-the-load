import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalsMet, missionStars, missionUnlocked } from '../src/rules/goals.js';

const level = { goals: { avail: 99, p95: 150, budget: 200, fresh: 97 } };

test('une mission est gagnée quand tous ses objectifs sont tenus', () => {
  const met = goalsMet(level, { avail: 99.5, p95: 140, cost: 200, fresh: 98, ok: 1000 });
  assert.equal(met.win, true);
  assert.equal(missionStars(met), 3);
});

test('dépasser le budget coûte une étoile mais garde la mission réussie à moitié', () => {
  const met = goalsMet(level, { avail: 99.5, p95: 140, cost: 260, fresh: 98, ok: 1000 });
  assert.equal(met.win, false);
  assert.equal(missionStars(met), 2);
});

test('sans aucune requête réussie, la latence ne compte pas comme tenue', () => {
  const met = goalsMet({ goals: { avail: 0, p95: 150, budget: null } }, { avail: 0, p95: 0, cost: 0, ok: 0 });
  assert.equal(met.p95, false);
  assert.equal(met.budget, true);
});

test('rater la fraîcheur, c’est zéro étoile même si tout le reste tient', () => {
  const met = goalsMet(level, { avail: 100, p95: 50, cost: 100, fresh: 90, ok: 1000 });
  assert.equal(missionStars(met), 0);
});

test('la mission suivante ne se débloque qu’avec 3 étoiles sur la précédente', () => {
  const levels = [{ id: 'm01' }, { id: 'm02' }, { id: 'm03' }];
  assert.equal(missionUnlocked(levels, { m01: 2 }, 1, 0), false);
  assert.equal(missionUnlocked(levels, { m01: 3 }, 1, 0), true);
  assert.equal(missionUnlocked(levels, {}, 2, 2), true, 'la mission courante reste jouable');
});
