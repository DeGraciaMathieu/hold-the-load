---
name: architecture
description: Use when deciding where new code goes, which module owns a responsibility, or whether an import between two modules is allowed in Tenir la charge.
auto_invoke: true
---

# Architecture

Jeu en ESM natif, sans build. Archétype : **simulation à pas fixe sur un réseau de flux** (`stepSim`, `DT` = 0,25 s), avec une phase de construction événementielle et une méta-progression en trois modes. Détails et arbitrages : `docs/decisions.md`.

## Ordre des couches

```
config → content → rules → state → render → input / loop → main
```

Un module n'importe que des couches situées à sa gauche. Exceptions existantes, à ne pas étendre :

- `render/` importe `rules/` (`goalsMet`, `useCard`, `campRevenue`, `campOutcome`…).
- `state/context.js` importe `rules/` (`genLevel`, `dailyLevel`, `emptyLayout`).
- `render/panels.js` ↔ `render/dialogs.js` s'importent mutuellement. Leurs boutons générés en HTML (`onclick`) écrivent dans `ST` et appellent des règles.
- `input/handlers.js` n'importe rien : `main.js` lui passe les intentions.

## Carte des modules

| Module | Rôle | Dépend de |
| --- | --- | --- |
| `src/config.js` | toutes les constantes de réglage (simulation, latences, coûts, Croissance, affichage lié aux règles) | — |
| `src/content/catalog.js` | `ROW_DEF`, `CATALOG`, `CLASSES`, `GLOBAL`, `OPT_DEFS`, `SET_DEFS` | `config` |
| `src/content/levels.js` | les 19 missions `LEVELS`, fabriques `mixOf`, `wave` | — |
| `src/content/texts.js` | `REGION_NAMES`, `REGION_SHORT`, `EVENT_NAMES`, `CARDS`, `REASONS` | — |
| `src/rules/latency.js` | `srvLat`, `dbLat` | `config` |
| `src/rules/stats.js` | `p95`, `addReason` | — |
| `src/rules/layout.js` | `defaultOpts`, `brickCost`, `layoutCost`, `emptyLayout`, `cloneLayout`, `hasType` | `content` |
| `src/rules/goals.js` | `goalsMet`, `missionStars`, `missionUnlocked` | `config` |
| `src/rules/campaign.js` | `campRevenue`, `campOutcome`, `nextRound`, `campRecord` | `config` |
| `src/rules/daily.js` | `isDailyRecord` | — |
| `src/rules/procgen.js` | `rng`, `genLevel`, `dailyLevel` | `config`, `content` |
| `src/rules/sim/make.js` | `makeSim`, `evActive`, `receiversOf` | `config`, `content`, `rules/layout` |
| `src/rules/sim/cards.js` | `useCard`, `promote` | `config`, `content`, `rules/stats` |
| `src/rules/sim/step.js` | `stepSim` | `config`, `content`, `rules/*`, `sim/make`, `sim/cards` |
| `src/rules/sim/result.js` | `resultOf`, `runAll` | `rules/*`, `sim/*` |
| `src/state/store.js` | `ST`, `save` (localStorage) | — |
| `src/state/context.js` | `sources`, `CUR`, `buildCtx`, `newCamp`, `campLevel`, `lay`, `sets`, `RUN`, `setRun`, accesseurs du niveau | `config`, `content`, `rules`, `store` |
| `src/render/dom.js` | `$`, `fmt` | — |
| `src/render/theme.js` | `loadTheme` remplit `C`, `BRICK`, `REGION`, `CT` depuis les variables CSS | `content` |
| `src/render/geometry.js` | canvas, `layout()`, `G`, `K`, `center`, `placed`, `serverPos`, `tempSlots` | `content`, `state` |
| `src/render/board.js` | `draw`, `drawIfNeeded`, `invalidate`, `setHover`, `setSelected` | `geometry`, `theme`, `state`, `rules` |
| `src/render/particles.js` | `spawn`, `spawnJob`, `stepParticles`, `clearParticles` (cosmétique) | `geometry`, `state` |
| `src/render/panels.js` | `renderTop`, `renderGoals`, `renderTools`, `renderCards`, `liveGoals`, `refresh`, `watchFooter` | `rules`, `state`, `dialogs` |
| `src/render/dialogs.js` | `toast`, feuilles `addSheet`, `editSheet`, `settingsSheet`, modale `showResult`, `closeAll`, `changed` | `rules`, `state`, `panels` |
| `src/input/handlers.js` | `bindInput(on)` : écouteurs fixes du DOM → intentions | — |
| `src/loop/run.js` | intentions (`clickBoard`, `switchMode`, `toggleRun`…), `startRun`, `endRun`, boucle `frame` | tout sauf `main` |
| `src/main.js` | câblage : `sources` (graine, date), `bindInput`, `loadTheme`, premier rendu, `requestAnimationFrame` | tout |
| `css/style.css` | toute la feuille de style ; variables de `:root` partagées avec le canvas | — |
| `index.html` | squelette DOM | — |

## Où va le nouveau code

| Type de changement | Où |
| --- | --- |
| nouveau nombre de réglage | `src/config.js`, constante nommée et commentée avec son unité |
| nouvelle brique, option, réglage d'appli | `src/content/catalog.js` (voir skill `contenu`) |
| nouvelle mission | `src/content/levels.js` |
| nouveau texte de jeu (incident, carte, cause d'échec) | `src/content/texts.js` |
| règle de calcul pure (coût, score, revenu…) | un module de `src/rules/`, existant ou nouveau, plus un test |
| comportement du trafic pendant la partie | `src/rules/sim/step.js` (voir skill `simulation`) |
| action en cours de partie | `src/rules/sim/cards.js` |
| progression, modes, sauvegarde | `src/rules/goals.js`, `campaign.js`, `daily.js`, `procgen.js`, `src/state/` (voir skill `progression`) |
| dessin du plateau | `src/render/board.js`, géométrie dans `geometry.js` |
| bandeau, objectifs, outils, cartes en jeu | `src/render/panels.js` |
| feuille, modale, toast | `src/render/dialogs.js` |
| nouvel écouteur fixe (touche, bouton statique) | `src/input/handlers.js`, plus l'intention dans `src/loop/run.js`, branchée dans `src/main.js` |
| déroulé d'un run, boucle d'animation | `src/loop/run.js` |
| nouvelle source d'aléa ou d'horloge qui porte une règle | `src/main.js`, injectée via `sources` (`state/context.js`) |
| couleur, taille, espacement | une variable de `:root` dans `css/style.css` (artefact d'abord, voir `CLAUDE.md`) |
