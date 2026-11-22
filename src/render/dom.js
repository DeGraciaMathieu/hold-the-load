export const $ = id => document.getElementById(id);
export const fmt = n => Math.round(n).toLocaleString('fr-FR');
// Desktop : catalogue de briques à gauche, plateau sans agrandissement. Même requête que le bloc .bench de style.css.
export const DESK = matchMedia('(min-width: 900px) and (min-height: 521px)');
