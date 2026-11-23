import { tr as trIn } from '../content/texts.js';
import { UI } from '../content/ui.js';
import { ST } from '../state/store.js';

// Traduction dans la langue du joueur (ST.lang) : textes de contenu et messages des règles, puis textes de l'interface.
export const tr = x => trIn(x, ST.lang);
export function t(k, p) { const v = UI[k][ST.lang]; return typeof v === 'function' ? v(p || {}) : v; }
