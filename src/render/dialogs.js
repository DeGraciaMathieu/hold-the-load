import { ROW_DEF, CATALOG, GLOBAL, OPT_DEFS, SET_DEFS } from '../content/catalog.js';
import { LEVELS } from '../content/levels.js';
import { REGION_NAMES, REASONS } from '../content/texts.js';
import { DIAG_MIN_SHARE, MAX_STARS, TOAST_MS, TOAST_ACTION_MS, TOAST_MAX } from '../config.js';
import { defaultOpts, brickCost, hasType } from '../rules/layout.js';
import { goalsMet, missionStars } from '../rules/goals.js';
import { campOutcome, nextRound, campRecord } from '../rules/campaign.js';
import { isDailyRecord } from '../rules/daily.js';
import { ST, save } from '../state/store.js';
import { CUR, RUN, sources, campLevel, newCamp, lay, sets, regionsOf, lbAlgosOf } from '../state/context.js';
import { $, fmt } from './dom.js';
import { COLORS, invalidate } from './board.js';
import { renderTop, renderGoals, renderTools, refresh } from './panels.js';

// ---------- panneaux ----------
// Messages empilés : les incidents rapprochés d'un run restent tous lisibles. Un message déjà affiché repart à zéro au lieu d'être doublé.
export function toast(msg, action) {
  const box = $('toast');
  [...box.children].find(el => el.dataset.msg === msg)?.remove();
  const el = document.createElement('div');
  el.dataset.msg = msg; el.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.run(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  while (box.children.length > TOAST_MAX) box.firstChild.remove();
  setTimeout(() => el.remove(), action ? TOAST_ACTION_MS : TOAST_MS);
}
// Commandes de construction indisponibles pendant un run : on le dit au lieu d'ignorer l'appui.
export function blockedByRun() { if (RUN) toast('Simulation en cours : attends la fin ou passe-la.'); return !!RUN; }

export const layerOpen = () => $('scrim').classList.contains('on');

// Feuille et modale fermées sont inertes : hors de l'ordre de tabulation et inactivables.
let returnFocus = null;
function openLayer(el, focusIdx) {
  if (!returnFocus) returnFocus = document.activeElement;
  el.inert = false; el.classList.add('on'); $('scrim').classList.add('on');
  const btns = el.querySelectorAll('button');
  (btns[focusIdx] || btns[0])?.focus({ preventScroll: true });
}
export function openSheet(html, after) {
  const sheet = $('sheet');
  // une feuille redessinée après un réglage garde le focus sur le même bouton
  const focusIdx = [...sheet.querySelectorAll('button')].indexOf(document.activeElement);
  sheet.innerHTML = html;
  if (after) after(sheet);
  openLayer(sheet, focusIdx);
}
// Fond et Échap : la modale de résultat ne se ferme que par ses boutons, pour qu'une faillite ne puisse pas être annulée.
export function dismiss() { if (!$('modal').classList.contains('on')) closeAll(); }
export function closeAll() {
  for (const el of [$('sheet'), $('modal')]) { el.classList.remove('on'); el.inert = true; }
  $('scrim').classList.remove('on');
  returnFocus?.focus({ preventScroll: true }); returnFocus = null;
}

export function changed() { ST.lastRes && delete ST.lastRes[CUR.key]; save(); renderGoals(null); invalidate(); }

export function addSheet(row, i) {
  const lv = CUR.level, L = lay(), r = ROW_DEF.find(x => x.key === row);
  const types = Object.keys(CATALOG).filter(t => CATALOG[t].row === row && lv.bricks.includes(t));
  let html = `<h3><span>Poser dans « ${r.label.toLowerCase()} »</span><button class="x" aria-label="Fermer">✕</button></h3>`;
  const reasons = {};
  for (const t of types) {
    if (CATALOG[t].unique && hasType(L, t)) reasons[t] = 'Déjà en place.';
    if (t === 'replica' && !hasType(L, 'db')) reasons[t] = 'Il faut d’abord une base primaire à copier.';
    if (t === 'db' && hasType(L, 'db')) continue;
    html += `<button class="opt" data-t="${t}" ${reasons[t] ? 'disabled' : ''}><span class="sw" style="background:${COLORS[t]}">${CATALOG[t].short}</span><span><b>${CATALOG[t].name}</b><p>${reasons[t] || CATALOG[t].desc}</p></span><span class="price">${t === 'server' ? 'dès 25' : CATALOG[t].cost(defaultOpts(t))} €</span></button>`;
  }
  if (!types.length) html += '<p class="desc">Rien à poser ici dans cette mission.</p>';
  openSheet(html, el => {
    el.querySelector('h3 .x').onclick = closeAll;
    el.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const t = btn.dataset.t; const b = { type: t, opts: defaultOpts(t) };
      const regs = regionsOf(lv); if (regs) b.region = regs[0];
      if (t === 'lb' && !lbAlgosOf(lv).includes(b.opts.algo)) b.opts.algo = lbAlgosOf(lv)[0];
      L[row][i] = b; changed(); closeAll();
      if (CATALOG[t].opts || (regs && !GLOBAL.includes(t))) editSheet(row, i);
    });
  });
}

export function editSheet(row, i) {
  const lv = CUR.level, L = lay(), b = L[row][i];
  const regs = regionsOf(lv);
  const render = () => {
    const o = { ...defaultOpts(b.type), ...(b.opts || {}) };
    let html = `<h3><span>${CATALOG[b.type].name} · ${brickCost(b)} €</span><button class="x" aria-label="Fermer">✕</button></h3><p class="desc">${CATALOG[b.type].desc}</p>`;
    for (const d of OPT_DEFS[b.type] || []) {
      if (d.k === 'legacy') continue;
      if (b.type === 'server' && d.k === 'size' && !lv.sizes) continue;
      let choices = d.choices;
      if (b.type === 'lb') choices = choices.filter(c => lbAlgosOf(lv).includes(c[0]));
      if (b.type === 'db' && d.k === 'sensible' && !(lv.bricks.includes('replica'))) continue;
      if (b.opts && b.opts.legacy) continue;
      html += `<div class="grp"><div class="lab">${d.label}</div><div class="seg">${choices.map(c => `<button data-k="${d.k}" data-v='${JSON.stringify(c[0])}' class="${o[d.k] === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div><div class="help">${d.help ? d.help[String(o[d.k])] || '' : ''}</div></div>`;
    }
    if (regs && !GLOBAL.includes(b.type)) html += `<div class="grp"><div class="lab">Région</div><div class="seg">${regs.map(g => `<button data-reg="${g}" class="${(b.region || regs[0]) === g ? 'on' : ''}">${REGION_NAMES[g]}</button>`).join('')}</div></div>`;
    if (!b.locked) html += `<button class="opt rm" id="rmB"><span class="sw" style="background:#fff">✕</span><span><b>Retirer</b><p>Libère la case.</p></span><span class="price">−${brickCost(b)} €</span></button>`;
    else html += `<p class="desc">🔒 Cette brique fait partie de l’héritage : impossible de la retirer.</p>`;
    openSheet(html, el => {
      el.querySelector('h3 .x').onclick = closeAll;
      el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { b.opts = { ...o, [x.dataset.k]: JSON.parse(x.dataset.v) }; changed(); render(); });
      el.querySelectorAll('[data-reg]').forEach(x => x.onclick = () => { b.region = x.dataset.reg; changed(); render(); });
      const rm = el.querySelector('#rmB');
      if (rm) rm.onclick = () => {
        L[row][i] = null;
        if (b.type === 'db' && L.data.some(x => x && x.type === 'replica')) { L.data = L.data.map(x => (x && x.type === 'replica' ? null : x)); toast('Sans base primaire, les répliques n’ont rien à copier : retirées aussi.'); }
        changed(); closeAll();
      };
    });
  };
  render();
}

export function settingsSheet() {
  const al = CUR.level.settingsAllowed || [];
  const render = () => {
    const s = sets();
    let html = `<h3><span>Réglages de l’appli</span><button class="x" aria-label="Fermer">✕</button></h3>`;
    for (const k of al) { const d = SET_DEFS[k]; html += `<div class="grp"><div class="lab">${d.label}</div><div class="seg">${d.choices.map(c => `<button data-k="${k}" data-v='${JSON.stringify(c[0])}' class="${s[k] === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div><div class="help">${d.help[String(s[k])]}</div></div>`; }
    openSheet(html, el => {
      el.querySelector('h3 .x').onclick = () => { closeAll(); renderTools(); };
      el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { s[x.dataset.k] = JSON.parse(x.dataset.v); changed(); render(); renderTools(); });
    });
  };
  render();
}

function diagHtml(res) {
  const reasons = Object.entries(res.reasons).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / res.total > DIAG_MIN_SHARE).slice(0, 3);
  let h = '';
  if (reasons.length) h += '<div class="diag"><b>Ce qui a lâché</b>' + reasons.map(([k, n]) => `<div>✕ ${REASONS[k]} <span style="color:#7a7266">(${(n / res.total * 100).toFixed(1)} %)</span></div>`).join('') + '</div>';
  if (res.log.length) h += '<div class="diag"><b>Chronologie</b>' + res.log.slice(0, 8).map(l => `<div>${l.t.toFixed(0)} s · ${l.msg}</div>`).join('') + '</div>';
  return h;
}
function row(k, v, t, ok) { return `<div class="row"><span>${k}</span><span>${v} ${ok == null ? '' : `<span class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✕'}</span>`} <span style="color:#7a7266">${t}</span></span></div>`; }
function showModal(html, bind) { $('modal').innerHTML = html; bind && bind($('modal')); openLayer($('modal')); }

export function showResult(res) {
  const lv = CUR.level, g = lv.goals, met = goalsMet(lv, res);
  const rows = row('Disponibilité', res.avail.toFixed(2) + ' %', '≥ ' + g.avail, met.avail) + row('Latence p95', res.ok ? Math.round(res.p95) + ' ms' : '–', '≤ ' + g.p95, met.p95)
    + (g.budget != null ? row('Coût', res.cost + ' €', '≤ ' + g.budget, met.budget) : row('Coût', res.cost + ' €' + (res.autoAvg ? ` (dont autoscaling ${res.autoAvg.toFixed(1)} inst. en moyenne)` : ''), '', null))
    + (g.fresh != null ? row('Fraîcheur', res.fresh.toFixed(1) + ' %', '≥ ' + g.fresh, met.fresh) : '')
    + (g.recos != null ? row('Recos servies', Math.round(res.recos) + ' %', '≥ ' + g.recos, met.recos) : '');
  if (CUR.kind === 'mission') {
    const stars = missionStars(met);
    if (stars > (ST.stars[lv.id] || 0)) ST.stars[lv.id] = stars;
    save(); renderTop();
    const next = ST.level < LEVELS.length - 1;
    showModal(`<h2>${met.win ? 'Ça tient !' : stars ? 'Presque…' : 'Ça n’a pas tenu'}</h2><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(MAX_STARS - stars)}</div>${rows}${diagHtml(res)}
      <div class="actions"><button class="btn light" id="mClose">Modifier l’infra</button>${met.win && next ? '<button class="btn go" id="mNext">Suivante →</button>' : ''}</div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      const n = el.querySelector('#mNext'); if (n) n.onclick = () => { closeAll(); ST.level++; save(); refresh(); };
    });
  } else if (CUR.kind === 'daily') {
    const d = (ST.daily[CUR.key] ||= {});
    let best = '';
    if (isDailyRecord(met, res, d.best)) { d.best = res.cost; best = '<p class="desc" style="font-size:12px;margin:8px 0">🏆 Nouveau record !</p>'; }
    save(); renderTop();
    const share = `Tenir la charge · ${lv.title} · ${met.win ? res.cost + ' €/mois ✓' : 'pas tenu'} (dispo ${res.avail.toFixed(2)} %, p95 ${Math.round(res.p95)} ms)`;
    showModal(`<h2>${met.win ? 'Défi tenu' : 'Ça n’a pas tenu'}</h2>${best}${rows}${diagHtml(res)}<div class="actions"><button class="btn light" id="mClose">Retenter</button><button class="btn" id="mCopy">Copier le score</button></div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      el.querySelector('#mCopy').onclick = () => { try { navigator.clipboard.writeText(share).then(() => toast('Score copié'), () => toast(share)); } catch (e) { toast(share); } };
    });
  } else {
    const c = ST.camp;
    const { rev, net, cash, brokeBy } = campOutcome(lv, res, c.cash);
    const lost = brokeBy != null;
    const why = brokeBy === 'avail' ? 'Trop de pannes : les clients sont partis.' : brokeBy === 'cash' ? 'Trésorerie à sec.' : '';
    const html = `<h2>${lost ? 'Faillite' : 'Tour ' + c.round + ' passé'}</h2>${rows}
      <div class="diag"><b>Bilan du tour</b><div>Revenu : +${fmt(rev)} €${res.avail < 99 ? ' (amputé par les pannes)' : ''}${res.p95 > lv.goals.p95 ? ' (−30 % pour la lenteur)' : ''}</div><div>Infra : −${fmt(res.cost)} €</div><div><b style="display:inline;color:inherit;font-size:11px;letter-spacing:0;text-transform:none">Net : ${net >= 0 ? '+' : ''}${fmt(net)} € → trésorerie ${fmt(cash)} €</b></div>${lost ? `<div>✕ ${why}</div>` : ''}</div>${diagHtml(res)}
      <div class="actions">${lost ? '<button class="btn go" id="mNew">Nouvelle partie</button>' : '<button class="btn light" id="mRetry">Rejouer le tour</button><button class="btn go" id="mNext">Tour suivant →</button>'}</div>`;
    showModal(html, el => {
      if (lost) {
        ST.campBest = campRecord(ST.campBest, c); save();
        el.querySelector('#mNew').onclick = () => { closeAll(); newCamp(sources.randomSeed()); if (ST.lastRes) delete ST.lastRes.camp; save(); refresh(); };
      } else {
        el.querySelector('#mRetry').onclick = closeAll;
        el.querySelector('#mNext').onclick = () => {
          const before = new Set(campLevel().bricks);
          ST.camp = nextRound(c, { cash, net, avail: res.avail }); if (ST.lastRes) delete ST.lastRes.camp;
          ST.campBest = campRecord(ST.campBest, ST.camp);
          closeAll(); save(); refresh();
          const fresh = CUR.level.bricks.filter(t => !before.has(t));
          if (fresh.length) toast('Nouvelles briques : ' + fresh.map(t => CATALOG[t].name).join(', '));
        };
      }
    });
  }
}
