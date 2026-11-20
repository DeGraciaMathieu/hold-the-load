import { CATALOG } from '../content/catalog.js';
import { REGION_SHORT } from '../content/texts.js';

// Couleurs, tailles de texte et rayon du plateau, lus dans les variables CSS de :root : le DOM et le canvas partagent une seule source.
export const C = {}, BRICK = {}, REGION = {}, CT = {};
const COLOR_VARS = { ink: 'ink', card: 'card', surface: 'surface', text2: 'text-2', muted: 'muted', ok: 'ok', warn: 'warn', bad: 'bad', badBg: 'bad-bg',
  inkSoft: 'ink-soft', inkFaint: 'ink-faint', bot: 'bot', job: 'job', dead: 'dead', temp: 'temp', alarm: 'alarm' };

export function loadTheme() {
  const cs = getComputedStyle(document.documentElement), v = name => cs.getPropertyValue('--' + name).trim();
  for (const [k, name] of Object.entries(COLOR_VARS)) C[k] = v(name);
  for (const t of Object.keys(CATALOG)) BRICK[t] = v('brick-' + t);
  for (const r of Object.keys(REGION_SHORT)) REGION[r] = v('region-' + r);
  CT.s = +v('c-1'); CT.m = +v('c-2'); CT.l = +v('c-3'); CT.r = parseFloat(v('r-2'));
}
