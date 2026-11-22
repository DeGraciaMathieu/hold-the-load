---
name: rendu
description: Use when touching what the player sees — the canvas board, brick drawing, geometry, particles, CSS and theme variables, top panel, goals, tools, sheets, result modal, toasts — in Tenir la charge.
auto_invoke: true
---

# Rendu et interface

**Règle du projet : toute modification visuelle** (mise en page, tailles, couleurs, typographie, rendu du plateau) **est d'abord proposée dans un artefact** (maquette ou capture avant/après, extraits de code). On ne code qu'après validation.

## Concepts → implémentation

| Concept | Où | Détail |
| --- | --- | --- |
| variables de design | `:root`, `css/style.css` | couleurs, `--brick-<type>`, `--region-<clé>`, texte `--t-1…5` (DOM) et `--c-1…3` (canvas), espacement `--s-0…6`, rayons `--r-*`, bordures `--b-*`, ombres `--sh*` |
| thème du canvas | `loadTheme()`, `render/theme.js` | remplit `C` (couleurs), `BRICK`, `REGION`, `CT` (tailles et rayon) depuis les variables CSS. Appelé une fois par `main.js` |
| géométrie | `layout()`, `G`, `K`, `W`, `H`, `render/geometry.js` | `G.rows[row].slots[i] = { x, y, w, h }` en coordonnées logiques ; `K` = échelle vers les pixels CSS. `center`, `placed`, `serverPos`, `tempSlots` |
| dessin du plateau | `draw()`, `render/board.js` | `drawIfNeeded()` ne redessine que si `invalidate()` a été appelé (ou pendant un run) |
| brique | `drawBrick`, `icon(type…)`, `optSummary(b)`, `liveNode(b, row, i)` | pictogramme par type, résumé des options, jauge en direct lue dans `RUN.tk` |
| survol et sélection | `setHover(slot)`, `setSelected(slot)` | la case se soulève de `LIFT` px |
| particules | `spawn`, `spawnJob`, `stepParticles`, `render/particles.js` | **cosmétique** : `Math.random` admis, n'influence jamais le score. Illustration approximative assumée. Seul écart à corriger, à la prochaine retouche : l'upload affiché réussi alors que le stockage objet est tombé |
| bandeau du haut | `renderTop()`, `render/panels.js` | missions, ou Croissance (tour, trésorerie, revenu max) |
| objectifs | `renderGoals(res)`, `liveGoals()` | couleurs selon `goalsMet` |
| outils | `renderTools()` | puces : réglages d'appli, cartes du niveau, « Repartir de zéro » (avec Annuler) |
| cartes en jeu | `renderCards()` | boutons qui appellent `useCard` |
| rafraîchir tout | `refresh()` | `buildCtx` puis tous les rendus |
| feuilles | `openSheet`, `addSheet`, `editSheet`, `settingsSheet`, `render/dialogs.js` | poser, régler, réglages d'appli ; `changed()` après toute modification du plateau |
| modale de résultat | `showResult(res)` | bilan, étoiles, Croissance, partage du défi |
| messages | `toast(msg, action?)` | `TOAST_MS`, `TOAST_ACTION_MS`, `TOAST_MAX` |
| garde pendant un run | `blockedByRun()` | refuse les gestes de construction pendant une simulation |
| format | `$`, `fmt`, `render/dom.js` | `fmt` = nombre arrondi au format `fr-FR` |

## Conventions

- **Aucune valeur visuelle en dur** : ni dans le CSS, ni dans les styles en ligne générés, ni sur le canvas. On utilise `var(--…)` côté DOM, et `C`, `BRICK`, `REGION`, `CT` côté canvas. On réutilise une marche d'échelle existante avant d'en créer une.
- Une nouvelle couleur qui doit servir au canvas : la variable dans `:root`, puis son nom dans `COLOR_VARS` (`theme.js`).
- Le rendu **lit** la simulation (`RUN.S`, `RUN.tk`) sans jamais la recalculer. S'il manque une donnée, on l'ajoute au `tick` dans `stepSim`.
- Après un changement d'état visible sur le plateau : `invalidate()`. Après un changement du plateau du joueur : `changed()`.
- Les écouteurs fixes passent par `input/handlers.js`. Les boutons générés en HTML portent leur `onclick` dans le module qui les génère (héritage du prototype).
- Accessibilité acquise, à préserver : cibles tactiles de 44 px, `inert` sur la feuille et la modale fermées, focus géré, Échap ferme, `aria-live` sur le toast.
- Mise en page : une colonne sur téléphone (footer fixe), deux colonnes sur écran large et en paysage ; le plateau s'agrandit jusqu'à 1,4×.

## Ajouter un élément d'interface

1. Faire l'artefact (maquette, avant/après, extraits) et attendre la validation.
2. Squelette fixe : `index.html`. Contenu dynamique : la fonction `render…` concernée dans `panels.js`, ou une feuille dans `dialogs.js`.
3. Styles dans `css/style.css`, uniquement avec les variables.
4. Geste fixe : écouteur dans `bindInput` (`input/handlers.js`), intention dans `loop/run.js`, branchement dans `main.js`.
5. Si l'élément affiche un texte avec des chiffres de jeu, le calculer depuis `config.js` plutôt que l'écrire en dur.
6. Vérifier dans le navigateur (`npm run dev`), à la largeur d'un téléphone et sur grand écran, puis lancer `npm test`.

## Ajouter le dessin d'une brique

Dans `render/board.js` : une branche dans `icon()`, un `case` dans `optSummary()` si elle a des options, et un `case` dans `liveNode()` si elle affiche une jauge pendant le run. Sa couleur se déclare dans `--brick-<type>` (`css/style.css`), lue automatiquement.
