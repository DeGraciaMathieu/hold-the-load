---
name: testing
description: Use when writing, running or reviewing tests in Tenir la charge, when a rule changes, or when tests/golden.test.js fails.
auto_invoke: true
---

# Tests

## Commande

```sh
npm test            # node --test : tous les fichiers tests/*.test.js
npm run test:watch  # relance à chaque modification
```

Aucune dépendance. Chaque fichier importe `test` de `node:test` et `assert` de `node:assert/strict`, puis les modules de `src/` par chemin relatif (`../src/rules/…`). Seuls `config`, `content` et `rules` sont testés : ces modules n'utilisent pas de DOM et tournent tels quels sous Node.

## Philosophie

- **Tests macro, centrés sur le comportement du jeu**, pas sur l'implémentation. Un test dit ce que le joueur observerait : « le pare-feu strict bloque 3 % des vrais clients et laisse passer 2 % des bots », pas « `wafMode` vaut `strict` ».
- Le nom du test est une phrase en français qui énonce la règle.
- On construit des niveaux et des plateaux minimaux à la main (`{ duration: 20, cards }`, un `layout` littéral) plutôt que de dépendre des 19 missions, sauf pour vérifier une mission précise.
- Pour la simulation, on préfère `runAll(level, layout, settings, actions)` puis `resultOf`, ou `makeSim` + `stepSim`, et on lit les résultats (`avail`, `p95`, `cost`, `reasons`) ou le dernier `tick`.
- Pas de mock : les règles sont pures, ou modifient un `S` qu'on crée soi-même.
- Une valeur attendue peut s'écrire avec sa formule (`100 * (0.3 + 3)`) quand c'est plus parlant qu'un nombre brut.

## Fichier de test → périmètre

| Fichier | Couvre |
| --- | --- |
| `tests/latency.test.js` | `srvLat`, `dbLat` : repos, mi-charge, plafond à saturation |
| `tests/stats.test.js` | `p95` pondéré, `addReason` |
| `tests/layout.test.js` | `brickCost`, `layoutCost`, options par défaut, `emptyLayout` |
| `tests/goals.test.js` | `goalsMet`, `missionStars`, `missionUnlocked` |
| `tests/campaign.test.js` | `campRevenue`, `campOutcome` (faillite par dispo ou trésorerie), `nextRound`, `campRecord` |
| `tests/daily.test.js` | `isDailyRecord` |
| `tests/procgen.test.js` | `rng` déterministe, `genLevel` (tour 1, croissance du trafic), `dailyLevel` |
| `tests/sim-make.test.js` | `makeSim` (ancienne et nouvelle base), `receiversOf` (LB, autoscaling), `evActive` |
| `tests/sim-cards.test.js` | `useCard` (consommation, renfort, relance, promotion), `promote` |
| `tests/sim-step.test.js` | `stepSim` : sticky, retries en saturation, ruée sur le cache, WAF strict, fin de partie |
| `tests/sim-result.test.js` | `resultOf`, `runAll` : mission 1 tenue, absence de serveur, coût du renfort |
| `tests/golden.test.js` | **tout le moteur** comparé à l'instantané `tests/golden/golden.json` |

## Instantané de référence (`tests/golden/`)

- `cases.js` décrit environ 1 500 cas : missions, tours de Croissance (`CAMP_SEEDS` × `CAMP_ROUNDS`), défis (`DAILY_DATES`), grille de revenus, combinaisons de plateaux, réglages et cartes. `snapshot(engine)` les rejoue.
- `golden.json` a été produit par `make-golden.js`, qui extrait le moteur du prototype `index.html` au commit `f6479f6` et l'exécute dans `node:vm`.
- `golden.test.js` rejoue les mêmes cas sur le moteur actuel et compare champ par champ.
- **S'il échoue**, une règle du jeu a changé. Si ce n'était pas voulu, c'est une régression : corriger le code. Si c'était voulu, suivre « Mettre à jour l'instantané » plus bas.
- Pour ajouter un cas à l'instantané, il faut modifier `cases.js`. Comme le cas doit aussi tourner sur le prototype, il ne peut utiliser que ce qui existait au commit `f6479f6`.

## Où mettre un nouveau test

| Changement | Fichier |
| --- | --- |
| règle d'un module `src/rules/x.js` | `tests/x.test.js` |
| règle de `src/rules/sim/x.js` | `tests/sim-x.test.js` |
| nouveau module de règles | un nouveau `tests/<module>.test.js`, même gabarit d'imports |
| nouvelle brique ou nouvel incident | `tests/sim-step.test.js`, plus `tests/sim-result.test.js` pour l'effet sur le bilan |
| nouvelle mission | `tests/sim-result.test.js` : un plateau de référence tient ses objectifs (`goalsMet`) |
| rendu, DOM, boucle | pas de test automatisé aujourd'hui : vérifier dans le navigateur (`npm run dev`) |

## Mettre à jour l'instantané (décision du 2026-11-22, `docs/decisions.md`)

`make-golden.js` ne sait charger que le prototype mono-fichier : il ne capture pas une règle nouvelle. Décision : lui ajouter une option `--current` qui fait le `snapshot` depuis les modules de `src/`, avec les mêmes `cases.js`. `golden.test.js` listera alors tous les cas qui diffèrent.

**Pas encore implémenté.** Tant que ce n'est pas fait, un changement de règle voulu commence par cette option, en accord avec l'utilisateur.

Déroulé, une fois l'option en place :

1. La règle change et `golden.test.js` échoue.
2. Vérifier que seuls les cas attendus bougent.
3. Régénérer avec `node tests/golden/make-golden.js --current`, dans le même commit que la règle.
4. Le dire dans le message de commit.
