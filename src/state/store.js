// Sauvegarde du joueur dans le navigateur.
const KEY = 'tenir-la-charge-v2';
export const ST = { mode: 'missions', level: 0, layouts: {}, settings: {}, stars: {}, camp: null, campBest: 0, daily: {} };
try { Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
