import { CAMP_START_CASH } from '../config.js';
import { LEVELS } from '../content/levels.js';
import { emptyLayout, cloneLayout } from '../rules/layout.js';
import { rng, genLevel, dailyLevel } from '../rules/procgen.js';
import { ST } from './store.js';

// Sources d'aléa et d'horloge, fournies par main.js.
export const sources = { randomSeed: null, today: null };

// ---------- contexte courant ----------
export let CUR = null; // { kind, level, key }
export function campLevel() { return genLevel(rng(ST.camp.seed + ':' + ST.camp.round), ST.camp.round); }
export function buildCtx() {
  if (ST.mode === 'camp') {
    if (!ST.camp) newCamp(sources.randomSeed());
    const lv = campLevel();
    CUR = { kind: 'camp', level: lv, key: 'camp' };
  } else if (ST.mode === 'daily') {
    const d = sources.today();
    CUR = { kind: 'daily', level: dailyLevel(d), key: 'daily-' + d, date: d };
  } else {
    ST.level = Math.min(ST.level, LEVELS.length - 1);
    const lv = LEVELS[ST.level];
    CUR = { kind: 'mission', level: lv, key: lv.id };
  }
  if (!ST.layouts[CUR.key]) ST.layouts[CUR.key] = CUR.level.preset ? cloneLayout(CUR.level.preset) : emptyLayout();
  if (!ST.settings[CUR.key]) ST.settings[CUR.key] = { retries: 0, timeout: 'long', shed: false };
}
export function newCamp(seed) { ST.camp = { seed, round: 1, cash: CAMP_START_CASH, history: [], over: false }; ST.layouts.camp = emptyLayout(); ST.settings.camp = { retries: 0, timeout: 'long', shed: false }; }
export const lay = () => ST.layouts[CUR.key];
export const sets = () => ST.settings[CUR.key];
export const regionsOf = lv => (lv.regions ? Object.keys(lv.regions) : null);
export const lbAlgosOf = lv => lv.lbAlgos || (lv.bricks.includes('cache') ? ['rr', 'sticky', 'least'] : ['rr']);
export const mixNow = t => (typeof CUR.level.mix === 'function' ? CUR.level.mix(t) : CUR.level.mix);
export const hasPay = () => { const m = typeof CUR.level.mix === 'function' ? CUR.level.mix(0) : CUR.level.mix; return (m.pay || 0) > 0; };

// ---------- simulation en cours ----------
export let RUN = null; // { S, tk, speed, acc, lastLog }
export const setRun = r => { RUN = r; };
