import { ROW_DEF } from '../content/catalog.js';
import { lay, RUN } from '../state/context.js';
import { $ } from './dom.js';

// ---------- canvas ----------
const board = $('board');
export const ctx = board.getContext('2d');
export let W = 360, H = 460, G = {};
export const FONT = (w, s) => `${w} ${s}px "JetBrains Mono", ui-monospace, monospace`;
let dpr0 = 0;
// Ne recalcule (et ne réalloue le canvas) que si la largeur ou la densité d'écran a changé ; renvoie true dans ce cas.
export function layout() {
  const w = board.clientWidth || 360, dpr = window.devicePixelRatio || 1;
  if (G.rows && w === W && dpr === dpr0) return false;
  W = w; dpr0 = dpr;
  const pad = 6, gap = 6;
  const sw = Math.min(78, (W - pad * 2 - gap * 4) / 5), sh = 58;
  G = { sw, sh, rows: {}, internet: { x: W / 2 - 20, y: 24 }, api: { x: W - 46, y: 24 } };
  let y = 58;
  for (const r of ROW_DEF) {
    const total = r.slots * sw + (r.slots - 1) * gap, x0 = (W - total) / 2;
    G.rows[r.key] = { labelY: y, slots: [...Array(r.slots)].map((_, i) => ({ x: x0 + i * (sw + gap), y: y + 12, w: sw, h: sh })) };
    y += 12 + sh + 22;
  }
  H = y - 6;
  board.style.height = H + 'px'; board.width = W * dpr; board.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
