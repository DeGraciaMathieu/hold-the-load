// Sauvegarde du joueur dans le navigateur.
const KEY = 'tenir-la-charge-v2';
const LEVELS_V = 2;

// Une mission insérée après la 15e (m15b) décale les suivantes : la mission en cours est un index, on le recale une fois.
// Étoiles et infras sont rangées par identifiant de mission et ne bougent pas.
export function migrateSave(st) {
  if (st.levelsV === LEVELS_V) return;
  if (st.level >= 15) st.level += 1;
  st.levelsV = LEVELS_V;
}

// lang : langue des textes affichés, l’anglais tant que le joueur n’a rien choisi.
export const ST = { lang: 'en', mode: 'missions', level: 0, layouts: {}, settings: {}, stars: {}, camp: null, campBest: 0, daily: {} };
try { Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
migrateSave(ST);
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
