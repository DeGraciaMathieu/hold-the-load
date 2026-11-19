import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDailyRecord } from '../src/rules/daily.js';

test('le premier défi tenu établit le record', () => {
  assert.equal(isDailyRecord({ win: true }, { cost: 400 }, undefined), true);
});

test('le record ne tombe que si le défi est tenu moins cher', () => {
  assert.equal(isDailyRecord({ win: true }, { cost: 350 }, 400), true);
  assert.equal(isDailyRecord({ win: true }, { cost: 400 }, 400), false);
  assert.equal(isDailyRecord({ win: false }, { cost: 100 }, 400), false, 'un défi raté ne compte pas, même très bon marché');
});
