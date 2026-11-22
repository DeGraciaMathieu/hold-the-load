---
name: progression
description: Use when touching the three game modes (Missions, Croissance, Défi du jour) — goals, stars, unlocking, revenue, bankruptcy, generated rounds, daily challenge, records — or the player save (ST) and current context (CUR).
auto_invoke: true
---

# Progression et modes

Trois modes, choisis par les onglets (`ST.mode`) : `missions` (19 missions à étoiles), `camp` (Croissance : tours générés, trésorerie à tenir) et `daily` (Défi du jour, niveau tiré de la date).

## Concepts → implémentation

| Concept | Où | Détail |
| --- | --- | --- |
| sauvegarde du joueur | `ST`, `save()`, `src/state/store.js` | `{ mode, level, layouts, settings, stars, camp, campBest, daily }`, plus `lastRes` ajouté par `endRun`. Clé `tenir-la-charge-v2`, fusion brute, sans version |
| contexte courant | `buildCtx()`, `CUR`, `src/state/context.js` | `CUR = { kind: 'mission' \| 'camp' \| 'daily', level, key, date? }`. Crée le plateau et les réglages de `key` s'ils manquent |
| plateau et réglages courants | `lay()`, `sets()` | `ST.layouts[CUR.key]`, `ST.settings[CUR.key]` |
| clé de sauvegarde | `CUR.key` | `lv.id` pour une mission, `'camp'`, `'daily-AAAA-MM-JJ'` |
| objectifs tenus | `goalsMet(level, res)`, `rules/goals.js` | `{ avail, p95, budget, fresh?, recos?, win }` |
| étoiles | `missionStars(met)` | 0 si dispo, fraîcheur ou recos ratées ; sinon 1, +1 latence, +1 budget |
| déblocage | `missionUnlocked(levels, stars, i, current)` | `MAX_STARS` sur la précédente, ou déjà atteinte, ou déjà réussie |
| revenu d'un tour | `campRevenue(lv, avail, p95)`, `rules/campaign.js` | `CAMP_BASE_REVENUE` + rps × `CAMP_REVENUE_PER_RPS`, nul sous `CAMP_AVAIL_FLOOR`, plein à +`CAMP_AVAIL_SPAN`, × `CAMP_SLOW_PENALTY` si trop lent |
| bilan d'un tour | `campOutcome(lv, res, cash)` | `{ rev, net, cash, brokeBy: 'avail' \| 'cash' \| null }` |
| tour suivant | `nextRound(camp, { cash, net, avail })` | rend une **nouvelle** partie (round + 1, historique) |
| record de Croissance | `campRecord(best, camp)` | tours passés |
| nouvelle partie | `newCamp(seed)`, `context.js` | graine de `sources.randomSeed()` (fournie par `main.js`), `CAMP_START_CASH` |
| niveau d'un tour | `campLevel()` → `genLevel(rng(seed + ':' + round), round)`, `rules/procgen.js` | trafic `CAMP_RPS_START` × `CAMP_RPS_GROWTH`^(round−1), arrondi à 50 ; briques débloquées par `UNLOCKS` ; incidents tirés dans `evPool` |
| défi du jour | `dailyLevel(dateStr)`, `procgen.js` | `rng('tlc-' + date)`, round 7, toutes les briques ; date de `sources.today()` |
| record du défi | `isDailyRecord(met, res, best)`, `rules/daily.js` | défi tenu et coût plus bas |
| aléa reproductible | `rng(seed)` | xorshift sur hash FNV-1a, **d'origine** : le changer change tous les niveaux générés |
| application à l'écran | `showResult(res)`, `render/dialogs.js` | écrit `ST.stars`, `ST.daily`, `ST.camp`, `ST.campBest`, puis `save()` |
| bandeau du mode | `renderTop()`, `render/panels.js` | sélecteur de missions, ou tour, trésorerie et revenu max |

## Où mettre du nouveau code

1. **Une règle de calcul** (score, revenu, condition de déblocage, record) : une fonction pure dans `rules/goals.js`, `campaign.js` ou `daily.js`, avec ses constantes dans `config.js` (section Missions ou Croissance) et un test dans le fichier de test homonyme.
2. **Sa mise en œuvre** : dans `showResult` (`render/dialogs.js`) ou `renderTop` (`render/panels.js`). On y appelle la règle, sans recalculer à la main (héritage : ces modules écrivent dans `ST`).
3. **Une nouvelle donnée sauvegardée** : un champ de premier niveau de `ST`, avec sa valeur par défaut dans `store.js`. Pour un renommage, une restructuration ou un champ imbriqué, voir « Version de la sauvegarde » plus bas.
4. **Une nouvelle source d'aléa ou de date** : dans `main.js`, injectée par `sources`, jamais `Math.random` ou `new Date()` dans `rules/` ou `state/`.
5. **Un changement de génération** (`genLevel`, `UNLOCKS`, `evPool`, l'ordre des tirages `R()`) : tous les tours et défis changent, et l'instantané casse (skill `testing`).

## Ajouter un mode

Non prévu par le code actuel : `ST.mode` est testé par `if` dans `buildCtx`, `renderTop` et `showResult`, et les onglets sont écrits en dur dans `index.html`. Faire d'abord un `prd` avec l'utilisateur.

## Version de la sauvegarde (décision du 2026-11-22, `docs/decisions.md`)

- **Pas de version tant qu'aucun changement de forme ne l'exige.** Ajouter un champ de premier niveau à `ST`, avec sa valeur par défaut dans `store.js`, n'en demande pas.
- **Elle devient obligatoire pour** renommer ou restructurer un champ, changer un `id` de mission, ou ajouter un champ imbriqué (par exemple dans `camp`) : `Object.assign` est superficiel et ne lui donnerait pas de valeur par défaut.
- À ce moment-là : ajouter un champ `version` dans `ST` et une fonction `migrate(raw)` testée, appelée au chargement dans `store.js`, en gardant la clé `tenir-la-charge-v2`.

## Laissé tel quel

- `camp.over` n'est jamais mis à `true`, et `camp.history` est enregistré sans jamais être affiché.
