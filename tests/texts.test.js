import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, EVENT_NAMES, CARDS, REASONS, MSGS, tr } from '../src/content/texts.js';
import { UI } from '../src/content/ui.js';
import { ROW_DEF, CATALOG, OPT_DEFS, SET_DEFS } from '../src/content/catalog.js';
import { LEVELS } from '../src/content/levels.js';
import { rng, genLevel, dailyLevel } from '../src/rules/procgen.js';
import { makeSim } from '../src/rules/sim/make.js';
import { stepSim } from '../src/rules/sim/step.js';
import { useCard } from '../src/rules/sim/cards.js';
import { ST } from '../src/state/store.js';

// Un texte affichable : chaîne commune aux deux langues, ou paire { en, fr } complète et non vide.
const translated = (x, where) => {
  if (typeof x === 'string') return;
  for (const l of LANGS) assert.ok(x[l] && (typeof x[l] !== 'string' || x[l].trim()), `${where} : texte ${l} manquant`);
};
// Un message des règles se lit dans les deux langues, sans trou.
const readable = (m, where) => {
  for (const l of LANGS) {
    const s = tr(m, l);
    assert.equal(typeof s, 'string', `${where} (${l})`);
    assert.ok(s.trim() && !s.includes('undefined') && !s.includes('NaN'), `${where} (${l}) : « ${s} »`);
  }
};

test('le jeu démarre en anglais tant que le joueur n’a pas choisi sa langue', () => {
  assert.equal(ST.lang, 'en');
});

test('chaque texte de contenu existe en anglais et en français', () => {
  ROW_DEF.forEach(r => translated(r.label, 'rangée ' + r.key));
  for (const [k, b] of Object.entries(CATALOG)) { translated(b.name, k); translated(b.short, k); translated(b.desc, k); }
  for (const [k, defs] of Object.entries(OPT_DEFS)) for (const d of defs) {
    translated(d.label, k + '.' + d.k);
    d.choices.forEach(c => translated(c[1], k + '.' + d.k));
    Object.values(d.help || {}).forEach(h => translated(h, k + '.' + d.k));
  }
  for (const [k, d] of Object.entries(SET_DEFS)) { translated(d.label, k); d.choices.forEach(c => translated(c[1], k)); Object.values(d.help).forEach(h => translated(h, k)); }
  for (const lv of LEVELS) { translated(lv.title, lv.id); translated(lv.story, lv.id); }
  for (const [k, c] of Object.entries(CARDS)) { translated(c.name, k); translated(c.desc, k); }
  for (const [k, x] of Object.entries({ ...EVENT_NAMES, ...REASONS })) translated(x, k);
  for (const [k, x] of Object.entries(MSGS)) translated(x, k);
});

test('chaque texte de l’interface existe en anglais et en français', () => {
  for (const [k, x] of Object.entries(UI)) translated(x, k);
});

test('les titres et récits générés se lisent dans les deux langues, incidents compris', () => {
  for (const seed of [1, 42, 987654321]) for (let round = 1; round <= 12; round++) {
    const lv = genLevel(rng(seed + ':' + round), round);
    readable(lv.title, `tour ${round}`); readable(lv.story, `tour ${round}`);
  }
  const d = dailyLevel('2026-11-19');
  readable(d.story, 'défi');
  assert.equal(tr(d.title, 'en'), 'Challenge of Nov 19');
  assert.equal(tr(d.title, 'fr'), 'Défi du 19/11');
});

test('les réponses des cartes et la chronologie d’un run se lisent dans les deux langues', () => {
  const layout = {
    edge: [{ type: 'lb' }, { type: 'waf' }, null], app: [{ type: 'server' }, { type: 'server' }, { type: 'autoscale' }, null, null],
    svc: [{ type: 'cache' }, null, null, null], data: [{ type: 'db' }, { type: 'replica' }, null, null],
  };
  const events = [{ type: 'crash', t: 1, target: 0 }, { type: 'cacheFlush', t: 2 }];
  const S = makeSim({ rps: 300, duration: 6, mix: { read: 1 }, profile: () => 1, events, cards: { addServer: 1, restart: 1, prewarm: 1, degrade: 1, waf: 1, promote: 1 } }, layout);
  const answers = [];
  while (!S.done) {
    if (S.t >= 3 && !answers.length) for (const c of Object.keys(CARDS)) answers.push(useCard(S, c).msg, useCard(S, c).msg);
    stepSim(S);
  }
  answers.forEach((m, i) => readable(m, 'carte ' + i));
  S.log.forEach(e => readable(e.msg, 'chronologie à ' + e.t + ' s'));
  const empty = makeSim({ duration: 6, cards: { restart: 1, prewarm: 1, waf: 1, promote: 1 } }, { edge: [null, null, null], app: Array(5).fill(null), svc: Array(4).fill(null), data: Array(4).fill(null) });
  for (const c of ['restart', 'prewarm', 'waf', 'promote']) readable(useCard(empty, c).msg, 'carte refusée ' + c);
  readable({ k: 'regionDown', p: { r: 'us' } }, 'panne de région');
  readable({ k: 'legacyOff' }, 'ancienne base');
});
