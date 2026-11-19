# Tenir la charge

> **Ouvrir `index.html` en double-cliquant ne marche plus.** Le jeu est découpé en modules
> ES natifs, que le navigateur refuse de charger depuis `file://`. Lance un serveur local :
>
> ```sh
> npm run dev
> ```
>
> puis ouvre l'adresse affichée (par défaut http://localhost:3000).

Jeu d'architecture web : pose des serveurs, caches, files et bases sur un plateau, puis
regarde ton infrastructure encaisser le trafic, les pannes et les attaques. Trois modes :
19 missions, Croissance (tours générés, trésorerie à tenir) et Défi du jour.

## Prérequis

Node 22 ou plus. Aucune dépendance à installer.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | sert le dossier avec `npx serve .` |
| `npm test` | lance les tests (`node --test`) |
| `npm run test:watch` | relance les tests à chaque modification |
| `node tests/golden/make-golden.js` | régénère l'instantané de référence depuis le prototype d'origine (commit `f6479f6`) |

`tests/golden.test.js` vérifie que le moteur rend exactement les mêmes résultats que le
prototype d'origine sur 1 506 simulations. Un échec veut dire qu'une règle du jeu a changé.

## Organisation

```
index.html          squelette de la page
css/style.css       styles
src/
  config.js         constantes de réglage
  content/          catalogue des briques, missions, textes
  rules/            règles pures (latence, coûts, objectifs, Croissance, génération)
    sim/            simulation : création, pas, cartes, bilan
  state/            sauvegarde et contexte courant
  render/           canvas, particules, panneaux, feuilles et modales
  input/            écouteurs du DOM
  loop/             déroulé d'un run et boucle d'animation
  main.js           câblage
tests/              un fichier de tests par règle, plus l'instantané de référence
docs/decisions.md   choix du découpage, exceptions, questions ouvertes
```
