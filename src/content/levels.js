// Fabriques des niveaux : mélange de trafic par classe, profil de charge sinusoïdal.
export const mixOf = o => ({ static: 0, read: 0, write: 0, upload: 0, pay: 0, reco: 0, ...o });
export const wave = (a, b, p) => t => a + b * Math.sin(t / p);
