import { MAX_STARS } from '../config.js';
import { LEVELS } from '../content/levels.js';
import { CARDS } from '../content/texts.js';
import { ROW_DEF, CATALOG, SET_DEFS } from '../content/catalog.js';
import { layoutCost, emptyLayout, cloneLayout, hasType } from '../rules/layout.js';
import { goalsMet, missionUnlocked } from '../rules/goals.js';
import { campRevenue } from '../rules/campaign.js';
import { useCard } from '../rules/sim/cards.js';
import { ST, save } from '../state/store.js';
import { CUR, RUN, buildCtx, lay, sets } from '../state/context.js';
import { $, fmt, DESK } from './dom.js';
import { tr, t } from './i18n.js';
import { layout } from './geometry.js';
import { clearParticles } from './particles.js';
import { invalidate, setSelected, selectedSlot, setPick, picked } from './board.js';
import { toast, openSheet, closeAll, changed, settingsSheet, blockedByRun, brickBlock, brickPrice, placeBrick, slotName } from './dialogs.js';

// ---------- rendu de l'écran ----------
// Textes fixes de la page (index.html) et boutons de langue.
function renderStatic() {
  document.documentElement.lang = ST.lang;
  document.title = t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  document.querySelectorAll('#langs .tab').forEach(b => b.classList.toggle('on', b.dataset.l === ST.lang));
  $('run').textContent = t(RUN ? 'skip' : 'run');
  if (RUN) $('hint').textContent = t('runHint');
}
export function renderTop() {
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.m === ST.mode));
  const top = $('top');
  if (ST.mode === 'missions') {
    top.innerHTML = '<div class="levels" id="levels"></div>';
    const box = $('levels');
    LEVELS.forEach((lv, i) => {
      const st = ST.stars[lv.id] || 0;
      const unlocked = missionUnlocked(LEVELS, ST.stars, i, ST.level);
      const b = document.createElement('button');
      b.className = 'lvl' + (i === ST.level ? ' cur' : '') + (unlocked ? '' : ' locked');
      b.innerHTML = (i + 1) + '<small>' + '★'.repeat(st) + '☆'.repeat(MAX_STARS - st) + '</small>';
      b.onclick = () => {
        if (blockedByRun()) return;
        if (!unlocked) { toast(t('unlock', { stars: '★'.repeat(MAX_STARS), n: i })); return; }
        ST.level = i; save(); refresh();
      };
      box.appendChild(b);
      if (i === ST.level) setTimeout(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
    });
  } else if (ST.mode === 'camp') {
    const c = ST.camp;
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">${t('round')}</div><div class="v">${c.round}</div><div class="t">${t('record', { n: ST.campBest || 0 })}</div></div><div class="goal"><div class="k">${t('cash')}</div><div class="v" style="color:${c.cash < 0 ? 'var(--bad)' : 'inherit'}">${fmt(c.cash)} €</div><div class="t">${t('startsAt')}</div></div><div class="goal"><div class="k">${t('maxRev')}</div><div class="v">${fmt(campRevenue(CUR.level, 100, 0))} €</div><div class="t">${t('ifAvail')}</div></div></div>`;
  } else {
    const d = ST.daily[CUR.key];
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">${t('daily')}</div><div class="v">${t('date', { d: CUR.date })}</div><div class="t">${t('sameForAll')}</div></div><div class="goal"><div class="k">${t('yourBest')}</div><div class="v">${d && d.best ? d.best + ' €' : '–'}</div><div class="t">${t('cheapestWins')}</div></div></div>`;
  }
}

function goalTiles(res) {
  const lv = CUR.level, g = lv.goals, cost = layoutCost(lay());
  const met = res ? goalsMet(lv, res) : null;
  const tiles = [];
  tiles.push({ k: t('avail'), ks: t('availShort'), v: res ? res.avail.toFixed(1) + ' %' : '?', t: '≥ ' + g.avail + ' %', s: met ? met.avail : null, id: 'avail' });
  tiles.push({ k: t('p95'), ks: t('p95Short'), v: res ? (res.ok ? Math.round(res.p95) + ' ms' : '–') : '?', t: '≤ ' + g.p95 + ' ms', s: met ? met.p95 : null, id: 'p95' });
  const usage = !res && hasType(lay(), 'autoscale') ? '+' : '';
  if (g.budget != null) { const c = res ? res.cost : cost; tiles.push({ k: t('budget'), v: c + ' €' + usage, t: '≤ ' + g.budget + ' €', s: c > g.budget ? false : res ? true : null, id: 'budget' }); }
  else tiles.push({ k: t('cost'), v: (res ? res.cost : cost) + ' €', t: t(CUR.kind === 'daily' ? 'toMinimize' : 'paidEachRound'), s: null, id: 'budget' });
  if (g.fresh != null) tiles.push({ k: t('fresh'), v: res ? res.fresh.toFixed(1) + ' %' : '?', t: '≥ ' + g.fresh + ' %', s: met ? met.fresh : null, id: 'fresh' });
  if (g.recos != null) tiles.push({ k: t('recos'), ks: t('recosShort'), v: res ? Math.round(res.recos) + ' %' : '?', t: '≥ ' + g.recos + ' %', s: met ? met.recos : null, id: 'recos' });
  return tiles;
}
export function renderGoals(res) {
  $('goals').innerHTML = goalTiles(res).map(x => `<div class="goal ${x.s === true ? 'ok' : x.s === false ? 'ko' : ''}" id="g-${x.id}"><div class="k" title="${x.k}"><span class="kl">${x.k}</span><span class="ks">${x.ks || x.k}</span></div><div class="v">${x.v}</div><div class="t">${x.t}</div></div>`).join('');
  const cost = layoutCost(lay()), g = CUR.level.goals;
  $('costK').textContent = t(CUR.kind === 'camp' ? 'costRound' : 'costMonthly');
  const auto = hasType(lay(), 'autoscale') ? ' + usage' : '';
  $('cost').textContent = cost + ' €' + auto + (g.budget != null ? ' / ' + g.budget + ' €' : '');
  $('costBox').classList.toggle('over', g.budget != null && cost > g.budget);
}
export function renderTools() {
  const lv = CUR.level, al = lv.settingsAllowed || [], s = sets();
  let html = '';
  if (al.length) {
    const bits = [];
    if (al.includes('retries')) bits.push(t('retries') + ' ' + s.retries);
    if (al.includes('timeout')) bits.push(t('timeout') + ' ' + tr(SET_DEFS.timeout.choices.find(c => c[0] === s.timeout)[1]));
    if (al.includes('shed')) bits.push(t('shed') + ' ' + t(s.shed ? 'yes' : 'no'));
    html += `<button class="chip" id="setBtn">⚙ ${bits.join(' · ')}</button>`;
  }
  const cards = Object.entries(lv.cards || {}).filter(([, n]) => n > 0);
  if (cards.length) html += `<button class="chip" id="cardsInfo">🃏 ${cards.map(([k, n]) => tr(CARDS[k].name) + (n > 1 ? ' ×' + n : '')).join(', ')}</button>`;
  if (CUR.kind !== 'camp') html += `<button class="chip" id="resetBtn">↺ ${t('reset')}</button>`;
  $('tools').innerHTML = html;
  if ($('setBtn')) $('setBtn').onclick = () => !blockedByRun() && settingsSheet();
  if ($('cardsInfo')) $('cardsInfo').onclick = () => openSheet(`<h3><span>${t('cardsTitle')}</span><button class="x" aria-label="${t('close')}">✕</button></h3><p class="desc">${t('cardsDesc')}</p>` + cards.map(([k, n]) => `<div class="opt"><span class="sw" style="background:var(--note)">${n}</span><span><b>${tr(CARDS[k].name)}</b><p>${tr(CARDS[k].desc)}</p></span></div>`).join(''), el => (el.querySelector('h3 .x').onclick = closeAll));
  if ($('resetBtn')) $('resetBtn').onclick = () => {
    if (blockedByRun()) return;
    const key = CUR.key, before = cloneLayout(lay());
    ST.layouts[key] = lv.preset ? cloneLayout(lv.preset) : emptyLayout(); changed();
    toast(t('resetDone'), { label: t('undo'), run: () => {
      if (RUN || CUR.key !== key) return;
      ST.layouts[key] = before; changed();
    } });
  };
}
// Catalogue desktop : les briques de la mission par rangée. Une case vide choisie d'abord met sa rangée en avant.
export function renderBench() {
  const L = lay(), lv = CUR.level, pick = picked(), sel = selectedSlot();
  const focusRow = sel && !L[sel.row][sel.i] ? sel.row : null;
  let html = `<div class="k">${t('bricks')}</div>`;
  for (const r of ROW_DEF) {
    const types = Object.keys(CATALOG).filter(t => CATALOG[t].row === r.key && lv.bricks.includes(t));
    if (!types.length) continue;
    html += `<div class="bgrp${focusRow && focusRow !== r.key ? ' back' : ''}"><div class="lab">${tr(r.label)}</div>`;
    for (const t of types) {
      const block = brickBlock(L, t);
      html += `<button class="bitem${t === pick ? ' on' : ''}" data-t="${t}" ${block ? `disabled title="${block.msg}"` : ''}><span class="bsw" style="background:var(--brick-${t})"></span><span class="bname">${tr(CATALOG[t].name)}</span><span class="bprice">${block ? block.tag : brickPrice(t)}</span></button>`;
    }
    html += '</div>';
  }
  $('bench').innerHTML = html;
  $('bench').querySelectorAll('[data-t]').forEach(b => (b.onclick = () => {
    if (blockedByRun()) return;
    const t = b.dataset.t, slot = selectedSlot();
    if (slot && !lay()[slot.row][slot.i] && CATALOG[t].row === slot.row) { placeBrick(t, slot.row, slot.i); return; }
    closeAll(); setPick(picked() === t ? null : t); renderBench();
  }));
  renderHint();
}
function renderHint() {
  if (RUN) return;
  if (!DESK.matches) { $('hint').textContent = t('hintTouch'); return; }
  const pick = picked(), sel = selectedSlot();
  let msg = t('hintDesk');
  if (pick) msg = t('hintPick', { name: tr(CATALOG[pick].name), price: brickPrice(pick) });
  else if (sel && !lay()[sel.row][sel.i]) msg = t('hintSlot', { slot: slotName(sel.row, sel.i) });
  $('hint').textContent = msg;
}
export function focusSlot(slot) { closeAll(); setSelected(slot); renderBench(); }
export function clearPick() { setPick(null); renderBench(); }
export function refresh() {
  buildCtx(); setPick(null);
  renderTexts();
  clearParticles();
  layout(); invalidate();
}
// Tout ce qui affiche du texte : appelé seul quand le joueur change de langue, même pendant un run.
export function renderTexts() {
  renderStatic(); renderTop();
  $('title').textContent = tr(CUR.level.title);
  $('crumb').textContent = CUR.kind === 'mission' ? (ST.level + 1) + ' / ' + LEVELS.length : t(CUR.kind === 'camp' ? 'crumbCamp' : 'crumbDaily');
  $('story').textContent = tr(CUR.level.story);
  renderGoals(ST.lastRes && ST.lastRes[CUR.key]); renderTools(); renderBench(); renderCards();
}
// Le footer fixe grandit avec les cartes d'action : le bas de page suit sa hauteur réelle pour ne rien masquer du plateau.
export function watchFooter() {
  const foot = document.querySelector('footer');
  const fit = () => { document.body.style.paddingBottom = getComputedStyle(foot).position === 'fixed' ? foot.offsetHeight + 8 + 'px' : ''; };
  new ResizeObserver(fit).observe(foot);
  window.addEventListener('resize', fit);
}
export function renderCards() {
  const S = RUN && RUN.S, box = $('cards');
  const entries = S ? Object.entries(S.cards).filter(([k]) => (CUR.level.cards || {})[k]) : [];
  box.classList.toggle('on', entries.length > 0);
  box.innerHTML = entries.map(([k, n]) => `<button class="cardbtn" data-c="${k}" ${n ? '' : 'disabled'}>${tr(CARDS[k].name)} ×${n}<small>${tr(CARDS[k].desc)}</small></button>`).join('');
  box.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { if (!RUN) return; const r = useCard(RUN.S, b.dataset.c); toast(tr(r.msg)); renderCards(); }));
}
export function liveGoals() {
  const S = RUN.S, a = S.acc;
  const avail = a.total ? Math.max(0, a.ok / a.total * 100) : 100;
  const el = $('g-avail'); if (el) el.querySelector('.v').textContent = avail.toFixed(1) + ' %';
}
