import { DT } from '../config.js';
import { ROW_DEF } from '../content/catalog.js';
import { makeSim } from '../rules/sim/make.js';
import { stepSim } from '../rules/sim/step.js';
import { resultOf } from '../rules/sim/result.js';
import { ST, save } from '../state/store.js';
import { CUR, RUN, setRun, lay, sets } from '../state/context.js';
import { $ } from '../render/dom.js';
import { G } from '../render/geometry.js';
import { draw } from '../render/board.js';
import { particles, clearParticles, spawn, spawnJob, stepParticles } from '../render/particles.js';
import { renderGoals, refresh, renderCards, liveGoals } from '../render/panels.js';
import { toast, addSheet, editSheet, showResult } from '../render/dialogs.js';

// ---------- intentions du joueur ----------
export function clickBoard(x, y) {
  if (RUN) return;
  for (const r of ROW_DEF) G.rows[r.key].slots.forEach((s, i) => {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) (lay()[r.key][i] ? editSheet : addSheet)(r.key, i);
  });
}
export function switchMode(m) { if (RUN) return; ST.mode = m; save(); refresh(); }
export function toggleRun() { if (RUN) { RUN.skip = true; return; } startRun(); }
export function toggleSpeed() { if (!RUN) return; RUN.speed = RUN.speed === 2 ? 1 : 2; $('speed').textContent = '×' + RUN.speed; }

// ---------- run ----------
function startRun() {
  const S = makeSim(CUR.level, lay(), sets());
  setRun({ S, tk: null, speed: 2, acc: 0, logN: 0, spawnAcc: 0, jobAcc: 0 });
  stepSim(S); RUN.tk = S.ticks[S.ticks.length - 1];
  clearParticles();
  $('run').textContent = 'Passer ⏭'; $('run').classList.remove('go'); $('speed').style.display = ''; $('speed').textContent = '×2';
  $('hint').textContent = 'Points noirs : requêtes. ✕ rouge : perdue. Violet : bots.';
  renderCards();
}
function endRun() {
  const S = RUN.S;
  while (!S.done) stepSim(S);
  const res = resultOf(S);
  setRun(null); clearParticles();
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
      while (RUN.spawnAcc >= 1) { RUN.spawnAcc--; const p = spawn(); if (p) particles.push({ ...p, seg: 0, prog: 0, x: p.pts[0].x, y: p.pts[0].y, alpha: 1, color: p.bot ? '#8e44ad' : '#1d1b18' }); }
      const jobs = tk.drained.write + tk.drained.upload + tk.drained.pay;
      if (jobs > 0) { RUN.jobAcc += Math.min(12, jobs / DT / 40) * dt; while (RUN.jobAcc >= 1) { RUN.jobAcc--; spawnJob(); } }
      liveGoals();
      if (S.done) endRun();
    }
  }
  stepParticles(dt);
  draw();
  requestAnimationFrame(frame);
}
