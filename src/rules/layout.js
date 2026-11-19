import { ROW_DEF, CATALOG } from '../content/catalog.js';

// Un layout : { rangée: [brique | null, …] }, une brique : { type, opts?, region?, locked? }.
export function defaultOpts(type) { return JSON.parse(JSON.stringify(CATALOG[type].opts || {})); }
export function brickCost(b) { return CATALOG[b.type].cost({ ...defaultOpts(b.type), ...(b.opts || {}) }); }
export function layoutCost(layout) {
  let c = 0;
  for (const r of ROW_DEF) for (const b of layout[r.key]) if (b) c += brickCost(b);
  return c;
}
export function emptyLayout() { const L = {}; for (const r of ROW_DEF) L[r.key] = Array(r.slots).fill(null); return L; }
export function cloneLayout(L) { return JSON.parse(JSON.stringify(L)); }
export function hasType(layout, t) { return ROW_DEF.some(r => layout[r.key].some(b => b && b.type === t)); }
