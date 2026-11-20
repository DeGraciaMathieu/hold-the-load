import { DT, SPEED_FAST, SKIP_GUARD_MS } from '../config.js';
import { ROW_DEF } from '../content/catalog.js';
import { makeSim } from '../rules/sim/make.js';
import { stepSim } from '../rules/sim/step.js';
import { resultOf } from '../rules/sim/result.js';
import { ST, save } from '../state/store.js';
import { CUR, RUN, setRun, lay, sets } from '../state/context.js';
import { $ } from '../render/dom.js';
import { G, K, layout } from '../render/geometry.js';
import { drawIfNeeded, invalidate, setHover } from '../render/board.js';
import { particles, clearParticles, spawn, spawnJob, stepParticles } from '../render/particles.js';
import { renderGoals, refresh, renderCards, liveGoals } from '../render/panels.js';
import { toast, addSheet, editSheet, showResult, blockedByRun, layerOpen, closeAll } from '../render/dialogs.js';
import { C } from '../render/theme.js';

// ---------- intentions du joueur ----------
function slotAt(x, y) {
  x /= K; y /= K; // pixels CSS → coordonnées du plateau
  for (const r of ROW_DEF) {
    const i = G.rows[r.key].slots.findIndex(s => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    if (i >= 0) return { row: r.key, i };
  }
  return null;
}
export function clickBoard(x, y) {
  if (blockedByRun()) return;
  const slot = slotAt(x, y);
  if (slot) (lay()[slot.row][slot.i] ? editSheet : addSheet)(slot.row, slot.i);
}
export function hoverBoard(x, y) {
  const slot = RUN || x == null ? null : slotAt(x, y);
  $('board').style.cursor = slot ? 'pointer' : '';
  setHover(slot);
}
export function switchMode(m) { if (blockedByRun()) return; ST.mode = m; save(); refresh(); }
export function toggleRun() {
  if (!RUN) { startRun(); return; }
  if (performance.now() - RUN.startedAt >= SKIP_GUARD_MS) RUN.skip = true;
}
export function launchKey() { if (!RUN && !layerOpen()) startRun(); }
export function skipKey() { if (RUN) toggleRun(); }
export function toggleSpeed() { if (!RUN) return; RUN.speed = RUN.speed === SPEED_FAST ? 1 : SPEED_FAST; $('speed').textContent = '×' + RUN.speed; }

export function relayout() { if (layout()) { clearParticles(); invalidate(); } }

// ---------- run ----------
function startRun() {
  closeAll(); // l'inspecteur reste ouvert sur desktop : on le ferme avant de lancer
  const S = makeSim(CUR.level, lay(), sets());
  setRun({ S, tk: null, startedAt: performance.now(), speed: SPEED_FAST, acc: 0, logN: 0, spawnAcc: 0, jobAcc: 0 });
  stepSim(S); RUN.tk = S.ticks[S.ticks.length - 1];
  clearParticles();
  document.body.classList.add('running');
  $('run').textContent = 'Passer ⏭'; $('run').classList.remove('go'); $('speed').style.display = ''; $('speed').textContent = '×' + SPEED_FAST;
  $('hint').textContent = 'Points noirs : requêtes. ✕ rouge : perdue. Violet : bots.';
  renderCards();
  requestAnimationFrame(revealBoard);
}
// Sur téléphone, amène le bas du plateau juste au-dessus du footer fixe.
function revealBoard() {
  const foot = document.querySelector('footer');
  if (getComputedStyle(foot).position !== 'fixed') return;
  const bottom = $('board').getBoundingClientRect().bottom + window.scrollY;
  window.scrollTo({ top: Math.max(0, bottom - (window.innerHeight - foot.offsetHeight)), behavior: 'smooth' });
}
function endRun() {
  const S = RUN.S;
  while (!S.done) stepSim(S);
  const res = resultOf(S);
  setRun(null); clearParticles(); invalidate();
  document.body.classList.remove('running');
  $('cards').classList.remove('on'); $('speed').style.display = 'none';
  $('run').textContent = 'Lancer ▶'; $('run').classList.add('go');
  $('hint').textContent = 'Touche une case pour poser une brique, une brique pour la régler.';
  (ST.lastRes ||= {})[CUR.key] = { avail: res.avail, p95: res.p95, cost: res.cost, fresh: res.fresh, recos: res.recos, ok: res.ok };
  renderGoals(res);
  showResult(res);
}

// ---------- boucle ----------
let lastT = performance.now();
export function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (RUN) {
    const S = RUN.S;
    if (RUN.skip) { endRun(); }
    else {
      RUN.acc += dt * RUN.speed;
      while (RUN.acc >= DT && !S.done) { RUN.acc -= DT; stepSim(S); RUN.tk = S.ticks[S.ticks.length - 1]; }
      while (RUN.logN < S.log.length) toast(S.log[RUN.logN++].msg);
      const tk = RUN.tk;
      RUN.spawnAcc += Math.min(70, 10 + (tk.T + tk.bots) / 30) * dt;
      while (RUN.spawnAcc >= 1) { RUN.spawnAcc--; const p = spawn(); if (p) particles.push({ ...p, seg: 0, prog: 0, x: p.pts[0].x, y: p.pts[0].y, alpha: 1, color: p.bot ? C.bot : C.ink }); }
      const jobs = tk.drained.write + tk.drained.upload + tk.drained.pay;
      if (jobs > 0) { RUN.jobAcc += Math.min(12, jobs / DT / 40) * dt; while (RUN.jobAcc >= 1) { RUN.jobAcc--; spawnJob(); } }
      liveGoals();
      if (S.done) endRun();
    }
  }
  stepParticles(dt);
  drawIfNeeded();
  requestAnimationFrame(frame);
}
