import { ROW_DEF } from '../content/catalog.js';
import { lay, RUN } from '../state/context.js';
import { $ } from './dom.js';

// ---------- canvas ----------
const board = $('board');
export const ctx = board.getContext('2d');
export let W = 360, H = 460, G = {};
export const FONT = (w, s) => `${w} ${s}px "JetBrains Mono", ui-monospace, monospace`;
const COLS = Math.max(...ROW_DEF.map(r => r.slots)); // toutes les rangées partagent cette grille
const LABEL_GUTTER = 104; // px de libellés de rangée à gauche quand le plateau est large
const GUTTER_MIN_W = 560; // largeur de plateau à partir de laquelle les libellés passent dans la gouttière
const BASE_W = 620; // largeur logique de référence : gouttière + 5 cases de 96 px
const MAX_SCALE = 1.4; // agrandissement maximal du plateau sur grand écran
export let K = 1; // échelle d'affichage : coordonnées logiques × K = pixels CSS
let CW = 0, dpr0 = 0; // largeur CSS et densité d'écran au dernier calcul
// Ne recalcule (et ne réalloue le canvas) que si la largeur ou la densité d'écran a changé ; renvoie true dans ce cas.
// Au-delà de BASE_W, le plateau garde ses coordonnées logiques et le canvas les dessine à l'échelle K.
export function layout() {
  const cw = board.clientWidth || 360, dpr = window.devicePixelRatio || 1;
  if (G.rows && cw === CW && dpr === dpr0) return false;
  CW = cw; dpr0 = dpr;
  K = Math.min(MAX_SCALE, Math.max(1, cw / BASE_W));
  W = cw / K;
  const pad = 6, gap = 6;
  const gutter = W >= GUTTER_MIN_W ? LABEL_GUTTER : 0;
  const sw = Math.min(96, (W - pad * 2 - gutter - gap * (COLS - 1)) / COLS), sh = 58;
  const gridW = COLS * sw + (COLS - 1) * gap;
  const bx = (W - gutter - gridW) / 2, gx = bx + gutter; // bloc libellés + grille centré
  const rowTop = gutter ? 0 : 12; // en étroit, le libellé passe au-dessus des cases
  G = { sw, sh, gutter, rows: {}, grid: { x: gx, w: gridW }, internet: { x: gx + gridW / 2, y: 24 }, api: { x: gx + gridW - 30, y: 24 } };
  let y = 58;
  for (const r of ROW_DEF) {
    G.rows[r.key] = { labelX: bx, labelY: gutter ? y + sh / 2 : y, slots: [...Array(r.slots)].map((_, i) => ({ x: gx + i * (sw + gap), y: y + rowTop, w: sw, h: sh })) };
    y += rowTop + sh + 22;
  }
  H = y - 6;
  board.style.height = H * K + 'px'; board.width = cw * dpr; board.height = H * K * dpr;
  ctx.setTransform(dpr * K, 0, 0, dpr * K, 0, 0);
  return true;
}
export const center = (row, i) => { const s = G.rows[row].slots[i]; return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; };
export function placed(type) { const L = lay(), out = []; for (const r of ROW_DEF) L[r.key].forEach((b, i) => { if (b && b.type === type) out.push({ row: r.key, i, b }); }); return out; }
export function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export function tempSlots() {
  // positions des serveurs ajoutés par carte : cases vides de la rangée appli
  if (!RUN) return [];
  const L = lay(), free = []; L.app.forEach((b, i) => { if (!b) free.push(i); });
  return RUN.S.temps.map((s, k) => ({ s, i: free[k] })).filter(x => x.i != null);
}

export function serverPos(id) {
  if (id.startsWith('app')) return center('app', +id.slice(3));
  if (id.startsWith('auto')) { const a = placed('autoscale')[0]; return a ? center(a.row, a.i) : null; }
  if (id.startsWith('tmp')) { const t = tempSlots().find(x => x.s.id === id); return t ? center('app', t.i) : null; }
  return null;
}
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
