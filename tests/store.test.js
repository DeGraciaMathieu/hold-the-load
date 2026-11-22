import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSave } from '../src/state/store.js';

test('après l’insertion de la mission 16, un joueur retrouve la même mission', () => {
  const avant15 = { level: 14 }, apres = { level: 17 };
  migrateSave(avant15); migrateSave(apres);
  assert.equal(avant15.level, 14);
  assert.equal(apres.level, 18);
});

test('la migration de la sauvegarde ne s’applique qu’une fois', () => {
  const st = { level: 17 };
  migrateSave(st); migrateSave(st);
  assert.equal(st.level, 18);
});
