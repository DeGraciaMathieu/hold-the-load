import { MAX_STARS } from '../config.js';
import { LEVELS } from '../content/levels.js';
import { CARDS } from '../content/texts.js';
import { ROW_DEF, CATALOG } from '../content/catalog.js';
import { layoutCost, emptyLayout, cloneLayout, hasType } from '../rules/layout.js';
import { goalsMet, missionUnlocked } from '../rules/goals.js';
import { campRevenue } from '../rules/campaign.js';
import { useCard } from '../rules/sim/cards.js';
import { ST, save } from '../state/store.js';
import { CUR, RUN, buildCtx, lay, sets } from '../state/context.js';
import { $, fmt, DESK } from './dom.js';
import { layout } from './geometry.js';
import { clearParticles } from './particles.js';
import { invalidate, setSelected, selectedSlot, setPick, picked } from './board.js';
import { toast, openSheet, closeAll, changed, settingsSheet, blockedByRun, brickBlock, brickPrice, placeBrick, slotName } from './dialogs.js';

// ---------- rendu de l'écran ----------
export function renderTop() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.m === ST.mode));
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
        if (!unlocked) { toast(`Obtiens ${'★'.repeat(MAX_STARS)} sur la mission ${i} pour débloquer celle-ci.`); return; }
        ST.level = i; save(); refresh();
      };
      box.appendChild(b);
      if (i === ST.level) setTimeout(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
    });
  } else if (ST.mode === 'camp') {
    const c = ST.camp;
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">Tour</div><div class="v">${c.round}</div><div class="t">record ${ST.campBest || 0}</div></div><div class="goal"><div class="k">Trésorerie</div><div class="v" style="color:${c.cash < 0 ? 'var(--bad)' : 'inherit'}">${fmt(c.cash)} €</div><div class="t">démarre à 300</div></div><div class="goal"><div class="k">Revenu max</div><div class="v">${fmt(campRevenue(CUR.level, 100, 0))} €</div><div class="t">si dispo ≥ 99 %</div></div></div>`;
  } else {
    const d = ST.daily[CUR.key];
    top.innerHTML = `<div class="camp"><div class="goal"><div class="k">Défi du jour</div><div class="v">${CUR.date.split('-').reverse().join('/')}</div><div class="t">même défi pour tout le monde</div></div><div class="goal"><div class="k">Ton record</div><div class="v">${d && d.best ? d.best + ' €' : '–'}</div><div class="t">le moins cher gagne</div></div></div>`;
  }
}

function goalTiles(res) {
  const lv = CUR.level, g = lv.goals, cost = layoutCost(lay());
  const met = res ? goalsMet(lv, res) : null;
  const tiles = [];
  tiles.push({ k: 'Disponibilité', ks: 'Dispo.', v: res ? res.avail.toFixed(1) + ' %' : '?', t: '≥ ' + g.avail + ' %', s: met ? met.avail : null, id: 'avail' });
  tiles.push({ k: 'Latence p95', ks: 'Latence', v: res ? (res.ok ? Math.round(res.p95) + ' ms' : '–') : '?', t: '≤ ' + g.p95 + ' ms', s: met ? met.p95 : null, id: 'p95' });
  const usage = !res && hasType(lay(), 'autoscale') ? '+' : '';
  if (g.budget != null) { const c = res ? res.cost : cost; tiles.push({ k: 'Budget', v: c + ' €' + usage, t: '≤ ' + g.budget + ' €', s: c > g.budget ? false : res ? true : null, id: 'budget' }); }
  else tiles.push({ k: 'Coût', v: (res ? res.cost : cost) + ' €', t: CUR.kind === 'daily' ? 'à minimiser' : 'payé chaque tour', s: null, id: 'budget' });
  if (g.fresh != null) tiles.push({ k: 'Fraîcheur', v: res ? res.fresh.toFixed(1) + ' %' : '?', t: '≥ ' + g.fresh + ' %', s: met ? met.fresh : null, id: 'fresh' });
  if (g.recos != null) tiles.push({ k: 'Recos servies', ks: 'Recos', v: res ? Math.round(res.recos) + ' %' : '?', t: '≥ ' + g.recos + ' %', s: met ? met.recos : null, id: 'recos' });
  return tiles;
}
export function renderGoals(res) {
  $('goals').innerHTML = goalTiles(res).map(x => `<div class="goal ${x.s === true ? 'ok' : x.s === false ? 'ko' : ''}" id="g-${x.id}"><div class="k" title="${x.k}"><span class="kl">${x.k}</span><span class="ks">${x.ks || x.k}</span></div><div class="v">${x.v}</div><div class="t">${x.t}</div></div>`).join('');
  const cost = layoutCost(lay()), g = CUR.level.goals;
  $('costK').textContent = CUR.kind === 'camp' ? 'Coût par tour' : 'Coût mensuel';
  const auto = hasType(lay(), 'autoscale') ? ' + usage' : '';
  $('cost').textContent = cost + ' €' + auto + (g.budget != null ? ' / ' + g.budget + ' €' : '');
  $('costBox').classList.toggle('over', g.budget != null && cost > g.budget);
}
export function renderTools() {
  const lv = CUR.level, al = lv.settingsAllowed || [], s = sets();
  let html = '';
  if (al.length) {
    const bits = [];
    if (al.includes('retries')) bits.push('essais ' + s.retries);
    if (al.includes('timeout')) bits.push('timeout ' + (s.timeout === 'court' ? '0,8 s' : '5 s'));
    if (al.includes('shed')) bits.push('délestage ' + (s.shed ? 'oui' : 'non'));
    html += `<button class="chip" id="setBtn">⚙ ${bits.join(' · ')}</button>`;
  }
  const cards = Object.entries(lv.cards || {}).filter(([, n]) => n > 0);
  if (cards.length) html += `<button class="chip" id="cardsInfo">🃏 ${cards.map(([k, n]) => CARDS[k].name + (n > 1 ? ' ×' + n : '')).join(', ')}</button>`;
  if (CUR.kind !== 'camp') html += `<button class="chip" id="resetBtn">↺ Repartir de zéro</button>`;
  $('tools').innerHTML = html;
  if ($('setBtn')) $('setBtn').onclick = () => !blockedByRun() && settingsSheet();
  if ($('cardsInfo')) $('cardsInfo').onclick = () => openSheet(`<h3><span>Cartes d’action</span><button class="x" aria-label="Fermer">✕</button></h3><p class="desc">Elles apparaissent pendant le run, à jouer au bon moment.</p>` + cards.map(([k, n]) => `<div class="opt"><span class="sw" style="background:var(--note)">${n}</span><span><b>${CARDS[k].name}</b><p>${CARDS[k].desc}</p></span></div>`).join(''), el => (el.querySelector('h3 .x').onclick = closeAll));
  if ($('resetBtn')) $('resetBtn').onclick = () => {
    if (blockedByRun()) return;
    const key = CUR.key, before = cloneLayout(lay());
    ST.layouts[key] = lv.preset ? cloneLayout(lv.preset) : emptyLayout(); changed();
    toast('Infra réinitialisée.', { label: 'Annuler', run: () => {
      if (RUN || CUR.key !== key) return;
      ST.layouts[key] = before; changed();
    } });
  };
}
// Catalogue desktop : les briques de la mission par rangée. Une case vide choisie d'abord met sa rangée en avant.
export function renderBench() {
  const L = lay(), lv = CUR.level, pick = picked(), sel = selectedSlot();
  const focusRow = sel && !L[sel.row][sel.i] ? sel.row : null;
  let html = '<div class="k">Briques</div>';
  for (const r of ROW_DEF) {
    const types = Object.keys(CATALOG).filter(t => CATALOG[t].row === r.key && lv.bricks.includes(t));
    if (!types.length) continue;
    html += `<div class="bgrp${focusRow && focusRow !== r.key ? ' back' : ''}"><div class="lab">${r.label}</div>`;
    for (const t of types) {
      const block = brickBlock(L, t);
      html += `<button class="bitem${t === pick ? ' on' : ''}" data-t="${t}" ${block ? `disabled title="${block.msg}"` : ''}><span class="bsw" style="background:var(--brick-${t})"></span><span class="bname">${CATALOG[t].name}</span><span class="bprice">${block ? block.tag : brickPrice(t)}</span></button>`;
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
  if (!DESK.matches) { $('hint').textContent = 'Touche une case pour poser une brique, une brique pour la régler.'; return; }
  const pick = picked(), sel = selectedSlot();
  let msg = 'Choisis une brique à gauche, ou clique une case vide.';
  if (pick) msg = `${CATALOG[pick].name} · ${brickPrice(pick)} : clique une case allumée. Échap pour annuler.`;
  else if (sel && !lay()[sel.row][sel.i]) msg = `${slotName(sel.row, sel.i)} : choisis une brique à gauche.`;
  $('hint').textContent = msg;
}
export function focusSlot(slot) { closeAll(); setSelected(slot); renderBench(); }
export function clearPick() { setPick(null); renderBench(); }
export function refresh() {
  buildCtx(); renderTop(); setPick(null);
  $('title').textContent = CUR.level.title;
  $('crumb').textContent = CUR.kind === 'mission' ? (ST.level + 1) + ' / ' + LEVELS.length : CUR.kind === 'camp' ? 'Croissance' : 'Défi';
  $('story').textContent = CUR.level.story;
  renderGoals(ST.lastRes && ST.lastRes[CUR.key]); renderTools(); renderBench();
  clearParticles();
  layout(); invalidate();
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
  box.innerHTML = entries.map(([k, n]) => `<button class="cardbtn" data-c="${k}" ${n ? '' : 'disabled'}>${CARDS[k].name} ×${n}<small>${CARDS[k].desc}</small></button>`).join('');
  box.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { if (!RUN) return; const r = useCard(RUN.S, b.dataset.c); toast(r.msg); renderCards(); }));
}
export function liveGoals() {
  const S = RUN.S, a = S.acc;
  const avail = a.total ? Math.max(0, a.ok / a.total * 100) : 100;
  const el = $('g-avail'); if (el) el.querySelector('.v').textContent = avail.toFixed(1) + ' %';
}
