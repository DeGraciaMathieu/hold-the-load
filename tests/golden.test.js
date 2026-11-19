import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot } from './golden/cases.js';
import { LEVELS } from '../src/content/levels.js';
import { rng, genLevel, dailyLevel } from '../src/rules/procgen.js';
import { campRevenue } from '../src/rules/campaign.js';
import { makeSim } from '../src/rules/sim/make.js';
import { stepSim } from '../src/rules/sim/step.js';
import { useCard } from '../src/rules/sim/cards.js';
import { resultOf, runAll } from '../src/rules/sim/result.js';

const golden = JSON.parse(readFileSync(new URL('./golden/golden.json', import.meta.url), 'utf8'));

const engine = { LEVELS, rng, genLevel, dailyLevel, campRevenue, makeSim, stepSim, useCard, resultOf, runAll };

test('le jeu se comporte exactement comme le prototype d’origine', () => {
  const current = JSON.parse(JSON.stringify(snapshot(engine)));
  assert.deepEqual(current.levels, golden.levels, 'missions');
  assert.deepEqual(current.camp, golden.camp, 'niveaux de Croissance');
  assert.deepEqual(current.daily, golden.daily, 'défis du jour');
  assert.deepEqual(current.revenue, golden.revenue, 'revenu de Croissance');
  assert.equal(current.runAll, golden.runAll, 'runAll');
  for (const name of Object.keys(golden.sims)) assert.deepEqual(current.sims[name], golden.sims[name], name);
});
