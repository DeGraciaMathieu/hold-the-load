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
import { tr, t } from './i18n.js';
import { COLORS, invalidate, setSelected } from './board.js';
import { renderTop, renderGoals, renderTools, renderBench, refresh } from './panels.js';

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
export function blockedByRun() { if (RUN) toast(t('busy')); return !!RUN; }

export const layerOpen = () => $('scrim').classList.contains('on');

// Feuille et modale fermées sont inertes : hors de l'ordre de tabulation et inactivables.
let returnFocus = null;
function openLayer(el, focusIdx) {
  if (!returnFocus) returnFocus = document.activeElement;
  el.inert = false; el.classList.add('on'); $('scrim').classList.add('on');
  const btns = el.querySelectorAll('button');
  (btns[focusIdx] || btns[0])?.focus({ preventScroll: true });
}
// slot : case du plateau concernée, marquée sur le plateau tant que la feuille est ouverte
export function openSheet(html, after, slot = null) {
  const sheet = $('sheet');
  setSelected(slot); document.body.classList.add('inspecting'); renderBench();
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
  document.body.classList.remove('inspecting'); setSelected(null); renderBench();
  returnFocus?.focus({ preventScroll: true }); returnFocus = null;
}

export function changed() { ST.lastRes && delete ST.lastRes[CUR.key]; save(); renderGoals(null); renderBench(); invalidate(); }

export const slotName = (row, i) => { const l = tr(ROW_DEF.find(x => x.key === row).label); return t('slot', { row: l.charAt(0) + l.slice(1).toLowerCase(), n: i + 1 }); };

// Pourquoi une brique ne peut pas être posée : message long pour la feuille, mention courte pour le catalogue.
const blocked = k => ({ msg: t(k), tag: t(k + 'Tag') });
const BULKHEAD_CLASSES = OPT_DEFS.bulkhead[0].choices.map(c => c[0]);
// Classes déjà cloisonnées, avec la case de chaque cloisonnement (sauf celui de la case `except`).
const walledClasses = (L, except) => L.app.map((b, i) => (b && b.type === 'bulkhead' && i !== except ? { cls: b.opts.cls, i } : null)).filter(Boolean);
export function brickBlock(L, t) {
  if (CATALOG[t].unique && hasType(L, t)) return blocked('placed');
  if (t === 'bulkhead' && walledClasses(L).length >= BULKHEAD_CLASSES.length) return blocked('bothWalled');
  if (t === 'replica' && !hasType(L, 'db')) return blocked('noPrimary');
  return null;
}
export const brickPrice = type => (type === 'server' ? t('priceFrom', { n: 25 }) : CATALOG[type].cost(defaultOpts(type))) + ' €';
export function placeBrick(t, row, i) {
  const lv = CUR.level, b = { type: t, opts: defaultOpts(t) };
  const regs = regionsOf(lv); if (regs) b.region = regs[0];
  if (t === 'lb' && !lbAlgosOf(lv).includes(b.opts.algo)) b.opts.algo = lbAlgosOf(lv)[0];
  if (t === 'bulkhead') { const taken = walledClasses(lay()).map(x => x.cls); b.opts.cls = BULKHEAD_CLASSES.find(c => !taken.includes(c)); }
  lay()[row][i] = b; changed(); closeAll();
  if (CATALOG[t].opts || (regs && !GLOBAL.includes(t))) editSheet(row, i);
}

export function addSheet(row, i) {
  const lv = CUR.level, L = lay();
  const types = Object.keys(CATALOG).filter(t => CATALOG[t].row === row && lv.bricks.includes(t));
  let html = `<h3><span><small>${t('placeBrick')}</small>${slotName(row, i)}</span><button class="x" aria-label="${t('close')}">✕</button></h3>`;
  for (const t of types) {
    if (t === 'db' && hasType(L, 'db')) continue;
    const block = brickBlock(L, t);
    html += `<button class="opt" data-t="${t}" ${block ? 'disabled' : ''}><span class="sw" style="background:${COLORS[t]}">${tr(CATALOG[t].short)}</span><span><b>${tr(CATALOG[t].name)}</b><p>${block ? block.msg : tr(CATALOG[t].desc)}</p></span><span class="price">${brickPrice(t)}</span></button>`;
  }
  if (!types.length) html += `<p class="desc">${t('nothingHere')}</p>`;
  openSheet(html, el => {
    el.querySelector('h3 .x').onclick = closeAll;
    el.querySelectorAll('.opt').forEach(btn => btn.onclick = () => placeBrick(btn.dataset.t, row, i));
  }, { row, i });
}

export function editSheet(row, i) {
  const lv = CUR.level, L = lay(), b = L[row][i];
  const regs = regionsOf(lv);
  const render = () => {
    const o = { ...defaultOpts(b.type), ...(b.opts || {}) };
    let html = `<h3><span><small>${slotName(row, i)}</small>${tr(CATALOG[b.type].name)} · ${brickCost(b)} €</span><button class="x" aria-label="${t('close')}">✕</button></h3><p class="desc">${tr(CATALOG[b.type].desc)}</p>`;
    for (const d of OPT_DEFS[b.type] || []) {
      if (d.k === 'legacy') continue;
      if (b.type === 'server' && d.k === 'size' && !lv.sizes) continue;
      let choices = d.choices;
      if (b.type === 'lb') choices = choices.filter(c => lbAlgosOf(lv).includes(c[0]));
      if (b.type === 'db' && d.k === 'sensible' && !(lv.bricks.includes('replica'))) continue;
      if (b.opts && b.opts.legacy) continue;
      // un cloisonnement ne peut pas prendre la classe d'un autre
      const other = b.type === 'bulkhead' ? walledClasses(L, i)[0] : null;
      const help = other ? t('walledBy', { cls: tr(choices.find(c => c[0] === other.cls)[1]), n: other.i + 1 }) : d.help ? tr(d.help[String(o[d.k])]) || '' : '';
      html += `<div class="grp"><div class="lab">${tr(d.label)}</div><div class="seg">${choices.map(c => `<button data-k="${d.k}" data-v='${JSON.stringify(c[0])}' class="${o[d.k] === c[0] ? 'on' : ''}"${other && other.cls === c[0] ? ' disabled' : ''}>${tr(c[1])}</button>`).join('')}</div><div class="help">${help}</div></div>`;
    }
    if (regs && !GLOBAL.includes(b.type)) html += `<div class="grp"><div class="lab">${t('region')}</div><div class="seg">${regs.map(g => `<button data-reg="${g}" class="${(b.region || regs[0]) === g ? 'on' : ''}">${REGION_NAMES[g]}</button>`).join('')}</div></div>`;
    if (!b.locked) html += `<button class="opt rm" id="rmB"><span class="sw" style="background:var(--surface)">✕</span><span><b>${t('remove')}</b><p>${t('freesSlot')}</p></span><span class="price">−${brickCost(b)} €</span></button>`;
    else html += `<p class="desc">${t('locked')}</p>`;
    openSheet(html, el => {
      el.querySelector('h3 .x').onclick = closeAll;
      el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { b.opts = { ...o, [x.dataset.k]: JSON.parse(x.dataset.v) }; changed(); render(); });
      el.querySelectorAll('[data-reg]').forEach(x => x.onclick = () => { b.region = x.dataset.reg; changed(); render(); });
      const rm = el.querySelector('#rmB');
      if (rm) rm.onclick = () => {
        L[row][i] = null;
        if (b.type === 'db' && L.data.some(x => x && x.type === 'replica')) { L.data = L.data.map(x => (x && x.type === 'replica' ? null : x)); toast(t('replicasGone')); }
        changed(); closeAll();
      };
    }, { row, i });
  };
  render();
}

export function settingsSheet() {
  const al = CUR.level.settingsAllowed || [];
  const render = () => {
    const s = sets();
    let html = `<h3><span>${t('appSettings')}</span><button class="x" aria-label="${t('close')}">✕</button></h3>`;
    for (const k of al) { const d = SET_DEFS[k]; html += `<div class="grp"><div class="lab">${tr(d.label)}</div><div class="seg">${d.choices.map(c => `<button data-k="${k}" data-v='${JSON.stringify(c[0])}' class="${s[k] === c[0] ? 'on' : ''}">${tr(c[1])}</button>`).join('')}</div><div class="help">${tr(d.help[String(s[k])])}</div></div>`; }
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
  if (reasons.length) h += `<div class="diag"><b>${t('gaveWay')}</b>` + reasons.map(([k, n]) => `<div>✕ ${tr(REASONS[k])} <span style="color:var(--muted)">(${(n / res.total * 100).toFixed(1)} %)</span></div>`).join('') + '</div>';
  if (res.log.length) h += `<div class="diag"><b>${t('timeline')}</b>` + res.log.slice(0, 8).map(l => `<div>${l.t.toFixed(0)} s · ${tr(l.msg)}</div>`).join('') + '</div>';
  return h;
}
function row(k, v, t, ok) { return `<div class="row"><span>${k}</span><span>${v} ${ok == null ? '' : `<span class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✕'}</span>`} <span style="color:var(--muted)">${t}</span></span></div>`; }
function showModal(html, bind) { $('modal').innerHTML = html; bind && bind($('modal')); openLayer($('modal')); }

export function showResult(res) {
  const lv = CUR.level, g = lv.goals, met = goalsMet(lv, res);
  const rows = row(t('avail'), res.avail.toFixed(2) + ' %', '≥ ' + g.avail, met.avail) + row(t('p95'), res.ok ? Math.round(res.p95) + ' ms' : '–', '≤ ' + g.p95, met.p95)
    + (g.budget != null ? row(t('cost'), res.cost + ' €', '≤ ' + g.budget, met.budget) : row(t('cost'), res.cost + ' €' + (res.autoAvg ? t('autoAvg', { n: res.autoAvg.toFixed(1) }) : ''), '', null))
    + (g.fresh != null ? row(t('fresh'), res.fresh.toFixed(1) + ' %', '≥ ' + g.fresh, met.fresh) : '')
    + (g.recos != null ? row(t('recos'), Math.round(res.recos) + ' %', '≥ ' + g.recos, met.recos) : '');
  if (CUR.kind === 'mission') {
    const stars = missionStars(met);
    if (stars > (ST.stars[lv.id] || 0)) ST.stars[lv.id] = stars;
    save(); renderTop();
    const next = ST.level < LEVELS.length - 1;
    showModal(`<h2>${t(met.win ? 'holds' : stars ? 'almost' : 'failed')}</h2><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(MAX_STARS - stars)}</div>${rows}${diagHtml(res)}
      <div class="actions"><button class="btn light" id="mClose">${t('editInfra')}</button>${met.win && next ? `<button class="btn go" id="mNext">${t('next')}</button>` : ''}</div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      const n = el.querySelector('#mNext'); if (n) n.onclick = () => { closeAll(); ST.level++; save(); refresh(); };
    });
  } else if (CUR.kind === 'daily') {
    const d = (ST.daily[CUR.key] ||= {});
    let best = '';
    if (isDailyRecord(met, res, d.best)) { d.best = res.cost; best = `<p class="desc" style="font-size:var(--t-2);margin:var(--s-2) 0">${t('newRecord')}</p>`; }
    save(); renderTop();
    const share = t('share', { title: tr(lv.title), win: met.win, cost: res.cost, avail: res.avail.toFixed(2), p95: Math.round(res.p95) });
    showModal(`<h2>${t(met.win ? 'dailyHeld' : 'failed')}</h2>${best}${rows}${diagHtml(res)}<div class="actions"><button class="btn light" id="mClose">${t('retry')}</button><button class="btn" id="mCopy">${t('copyScore')}</button></div>`, el => {
      el.querySelector('#mClose').onclick = closeAll;
      el.querySelector('#mCopy').onclick = () => { try { navigator.clipboard.writeText(share).then(() => toast(t('copied')), () => toast(share)); } catch (e) { toast(share); } };
    });
  } else {
    const c = ST.camp;
    const { rev, net, cash, brokeBy } = campOutcome(lv, res, c.cash);
    const lost = brokeBy != null;
    const why = brokeBy === 'avail' ? t('brokeAvail') : brokeBy === 'cash' ? t('brokeCash') : '';
    const colon = t('colon');
    const html = `<h2>${lost ? t('bankrupt') : t('roundCleared', { n: c.round })}</h2>${rows}
      <div class="diag"><b>${t('roundSummary')}</b><div>${t('revenue')}${colon}+${fmt(rev)} €${res.avail < 99 ? t('cutByOutages') : ''}${res.p95 > lv.goals.p95 ? t('slowPenalty') : ''}</div><div>${t('infra')}${colon}−${fmt(res.cost)} €</div><div><b style="display:inline;color:inherit;font-size:var(--t-1);letter-spacing:0;text-transform:none">${t('net')}${colon}${net >= 0 ? '+' : ''}${fmt(net)} € → ${t('toCash')} ${fmt(cash)} €</b></div>${lost ? `<div>✕ ${why}</div>` : ''}</div>${diagHtml(res)}
      <div class="actions">${lost ? `<button class="btn go" id="mNew">${t('newGame')}</button>` : `<button class="btn light" id="mRetry">${t('replayRound')}</button><button class="btn go" id="mNext">${t('nextRound')}</button>`}</div>`;
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
          if (fresh.length) toast(t('newBricks') + fresh.map(type => tr(CATALOG[type].name)).join(', '));
        };
      }
    });
  }
}
