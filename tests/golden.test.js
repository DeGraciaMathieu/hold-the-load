import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { snapshot } from './golden/cases.js';
import { engine } from './golden/current-engine.js';

const golden = JSON.parse(readFileSync(new URL('./golden/golden.json', import.meta.url), 'utf8'));

// Tous les cas qui diffèrent sont listés, pour vérifier d'un coup qu'un changement de règle ne touche que ce qu'il doit.
test('le jeu se comporte exactement comme l’instantané de référence', () => {
  const current = JSON.parse(JSON.stringify(snapshot(engine)));
  const SECTIONS = { levels: 'missions', camp: 'niveaux de Croissance', daily: 'défis du jour', revenue: 'revenu de Croissance', runAll: 'runAll' };
  const differs = Object.entries(SECTIONS).filter(([k]) => !isDeepStrictEqual(current[k], golden[k])).map(([, label]) => label);
  const names = new Set([...Object.keys(golden.sims), ...Object.keys(current.sims)]);
  for (const name of names) if (!isDeepStrictEqual(current.sims[name], golden.sims[name])) differs.push(name);
  assert.deepEqual(differs, [], `${differs.length} cas diffèrent de l’instantané`);
});
