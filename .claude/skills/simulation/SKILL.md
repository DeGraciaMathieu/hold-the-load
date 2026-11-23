---
name: simulation
description: Use when touching how traffic flows through the bricks during a run — makeSim, stepSim, cards, failover, latency, p95, failure reasons, the final result — or any constant of src/config.js that the engine reads.
auto_invoke: true
---

# Simulation

Modèle de flux à pas fixe : à chaque pas de `DT` = 0,25 s, un débit de requêtes par classe traverse les rangées du plateau (bord → appli → services → données). Le moteur accumule réussites, échecs, latences et causes d'échec. Le score ne dépend que de ce moteur ; les particules du rendu ne sont qu'une illustration.

## Concepts → implémentation

| Concept | Où | Détail |
| --- | --- | --- |
| état d'une partie | `makeSim(level, layout, settings)`, `src/rules/sim/make.js` | objet `S` : briques à plat (`S.bricks`, `id` = rangée + index, ex. `data1`), raccourcis `S.lb`, `S.cache`…, serveurs `S.fixed` / `S.temps`, groupe d'autoscaling `S.group`, base `S.primary`, `S.replicas`, `S.workers`, files `S.backlog`, disjoncteur `S.brk`, cumul `S.acc`, `S.ticks`, `S.log` |
| réglages d'appli par défaut | `makeSim` et `buildCtx` | `{ retries: 0, timeout: 'long', shed: false }` |
| un pas | `stepSim(S)`, `src/rules/sim/step.js` | **modifie `S` sur place**, pousse un `tick` dans `S.ticks` puis avance `S.t`. `S.done` passe à vrai après `level.duration / DT` pas |
| incidents ponctuels (`t`) | début de `stepSim` | `crash`, `cacheFlush`, `regionDown`, `legacyShutdown`, déclenchés une fois (`S.fired`) |
| incidents à fenêtre (`from` / `to`) | `evActive(level, type, t)`, `make.js` | `apiSlow` (`lat`, `err`), `attack` (`mult`) |
| serveurs qui reçoivent | `receiversOf(S)`, `make.js` | sans LB, seul `S.fixed[0]` ; avec LB, tous les vivants et démarrés, plus les instances d'autoscaling |
| classes de requêtes | `CLASSES`, `content/catalog.js` | `static`, `read`, `write`, `upload`, `pay`, `reco`, traitées dans cet ordre |
| latence selon la charge | `srvLat`, `dbLat`, `rules/latency.js` | base × (1 + `LAT_SURGE` × ρ³), ρ plafonné à 1 |
| cartes en cours de partie | `useCard(S, name)`, `rules/sim/cards.js` | rend `{ ok, msg }` ; `msg` s'affiche en toast |
| bascule de la base | `promote(S, auto)`, `cards.js` | automatique après `FAILOVER_DELAY`, ou manuelle (perte `promoLoss`) |
| causes d'échec | `addReason(acc, k, v)`, `rules/stats.js` | clés de `REASONS` (`content/texts.js`) |
| latence p95 | `p95(samples)`, `stats.js` | échantillons `[latence, volume]` |
| bilan | `resultOf(S)`, `rules/sim/result.js` | `{ avail, p95, cost, autoAvg, fresh, recos, reasons, total, ok, fail, log }`. Ajoute les tâches restées en file (`backlog`) et le coût moyen de l'autoscaling |
| partie sans affichage | `runAll(level, layout, settings, actions)` | `actions` : `[{ t, card }]` |
| relevé d'un pas (`tick`) | fin de `stepSim` | lu par le rendu : `T`, `bots`, `servers`, `availNow`, `vis`, `backlog`, `nodeRho`, `dbNodes`, `primaryId`, `drained`, `lag` |
| constantes | `src/config.js` | sections Simulation, Latences, Coûts, LB, API, Cache, Pare-feu, Sessions, Délestage, Base, Réplication, Workers, Autoscaling, Cartes |

## Étapes de `stepSim` (marquées `// ----` dans le code)

1. événements ponctuels
2. failover automatique
3. paramètres de l'instant (API, bots, mélange)
4. volumes utilisateurs (non amplifiés)
5. étage serveurs (capacité, sticky, sessions, saturation, délestage)
6. connexions (pooler, plafond de la base)
7. aiguillage applicatif (CDN, cache, file, stockage objet, paiements et disjoncteur)
8. étage base (primaire, répliques, retard, lectures périmées)
9. workers (vidage des files)
10. retries (passage tentatives → utilisateurs)
11. autoscaling
12. état visuel (`tk.vis`…) et avancement du temps

`stepSim` appelle une fonction par étape, dans l'ordre ci-dessus (`fireEvents`, `autoFailover`, `instantParams`, `userVolumes`, `stepServers`, `stepConnections`, `routeRequests`, `stepDatabase`, `stepWorkers`, `settleRetries`, `stepAutoscaling`, `recordTick`). Chacune modifie `S` et se passe les résultats du pas dans l'objet `X` : une étape lit dans `X` ce que les précédentes y ont rangé, et y ajoute ses propres résultats avec `Object.assign(X, { … })`. Une nouvelle règle va dans l'étape concernée, ou dans une nouvelle étape appelée au bon endroit de `stepSim`. Le code mort listé dans `docs/decisions.md` (`D.direct`, `botsByPool`, `tk.nodes`…) ne se nettoie pas au passage.

## Où mettre du nouveau code

1. **Un nombre** : une constante dans la bonne section de `src/config.js`, importée explicitement dans le module qui l'utilise.
2. **Un effet sur le trafic** : dans l'étape concernée de `stepSim`, pas dans un nouveau passage à la fin.
3. **Un nouvel état** : initialisé dans `makeSim`. Sinon il est absent au premier pas.
4. **Une nouvelle cause d'échec** : une clé dans `REASONS` (`texts.js`), alimentée par `addReason`.
5. **Une donnée que le rendu doit afficher** : un champ du `tick`, jamais une lecture de `S` recalculée dans `render/`.
6. **Un calcul réutilisable et isolable** (formule, seuil) : une fonction pure dans `src/rules/`, appelée depuis `stepSim`.

## Ajouter un incident

1. Choisir sa forme : ponctuel (`{ type, t, … }`) ou à fenêtre (`{ type, from, to, … }`).
2. Ponctuel : ajouter une branche `else if (e.type === '…')` dans `fireEvents` (`step.js`). Pousser un message dans `S.log`, il s'affiche en toast.
3. À fenêtre : le lire avec `evActive(L, '…', t)` dans `instantParams`.
4. Mettre ses durées et ses intensités dans `src/config.js` (préfixe `GEN_` s'il est généré).
5. Ajouter son libellé `{ en, fr }` dans `EVENT_NAMES` (`texts.js`), et son message de chronologie dans `MSGS`, s'il peut être tiré par `genLevel`, et l'ajouter à `evPool` dans `rules/procgen.js` avec sa condition.
6. L'utiliser dans une mission (`levels.js`), voir le skill `contenu`.
7. Tester dans `tests/sim-step.test.js` : un niveau minimal avec l'incident, et l'effet observable (`avail`, `reasons`).

## Ajouter une carte

1. Ajouter `name` et `desc` dans `CARDS` (`content/texts.js`).
2. Ajouter une branche dans `useCard` (`rules/sim/cards.js`). Rendre `{ ok: false, msg }` sans consommer la carte quand elle est inutilisable. `msg` est une clé `{ k, p? }` de `MSGS` (`content/texts.js`), écrite en anglais et en français.
3. Mettre ses constantes dans la section Cartes de `config.js`. Garder la `desc` et le `msg` cohérents avec ces valeurs.
4. La distribuer : `cards: { nom: n }` dans une mission, et/ou dans le tirage de `genLevel`.
5. Tester dans `tests/sim-cards.test.js`.

## Attention

- `useCard`, `promote` et `stepSim` modifient `S` : dans un test, créer un `S` neuf par cas.
- Toute modification ici casse vraisemblablement `tests/golden.test.js` : voir le skill `testing` avant de continuer.
