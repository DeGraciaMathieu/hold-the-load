import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot } from './golden/cases.js';
import { loadCurrentEngine } from './golden/current-engine.js';

const golden = JSON.parse(readFileSync(new URL('./golden/golden.json', import.meta.url), 'utf8'));

test('le jeu se comporte exactement comme le prototype d’origine', async () => {
  const current = JSON.parse(JSON.stringify(snapshot(await loadCurrentEngine())));
  assert.deepEqual(current.levels, golden.levels, 'missions');
  assert.deepEqual(current.camp, golden.camp, 'niveaux de Croissance');
  assert.deepEqual(current.daily, golden.daily, 'défis du jour');
  assert.deepEqual(current.revenue, golden.revenue, 'revenu de Croissance');
  assert.equal(current.runAll, golden.runAll, 'runAll');
  for (const name of Object.keys(golden.sims)) assert.deepEqual(current.sims[name], golden.sims[name], name);
});
