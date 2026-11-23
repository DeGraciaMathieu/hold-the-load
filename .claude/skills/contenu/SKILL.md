---
name: contenu
description: Use when adding or changing a brick, a brick option, an app setting, a mission, an incident text, a card text or a failure reason in Tenir la charge — anything under src/content/.
auto_invoke: true
---

# Contenu de jeu

Les données sont dans `src/content/` : ce ne sont ni des constantes de réglage (`config.js`), ni des règles (`rules/`). Leurs textes sont la **documentation vivante** du jeu : une valeur citée dans un texte doit correspondre à `config.js`.

## Concepts → implémentation

| Concept | Où | Forme |
| --- | --- | --- |
| rangées du plateau | `ROW_DEF`, `catalog.js` | `{ key, label, slots }` : `edge` 3, `app` 5, `svc` 4, `data` 4 |
| brique | `CATALOG[type]`, `catalog.js` | `{ row, name, short, unique?, cost: opts => €, opts?, desc }` |
| brique commune à toutes les régions | `GLOBAL` | `['lb', 'cdn', 'waf']` |
| option réglable d'une brique | `OPT_DEFS[type]` | `[{ k, label, choices: [[valeur, libellé]], help?: { valeur: texte } }]` |
| réglage d'appli | `SET_DEFS` | `retries`, `timeout`, `shed`. Proposés seulement si `level.settingsAllowed` les liste |
| mission | `LEVELS`, `levels.js` | voir le tableau des champs plus bas |
| briques débloquées par palier | `BR`, `levels.js` | listes cumulatives `base`, `lb`, `cache`, `cdn`, `queue`, `all` |
| mélange et profil de trafic | `mixOf(o)`, `wave(a, b, p)` | `mix` : part par classe (objet ou `t => objet`) ; `profile` : `t => facteur` |
| noms de régions | `REGION_NAMES`, `REGION_SHORT`, `texts.js` | `eu` Paris, `us` New York, `asia` Tokyo |
| incidents (libellé généré) | `EVENT_NAMES` | utilisés par `genLevel` |
| cartes | `CARDS` | `{ name, desc }`, chacun `{ en, fr }` |
| causes d'échec | `REASONS` | une phrase `{ en, fr }` par clé passée à `addReason` |
| messages des règles | `MSGS` | `{ en, fr }` par clé, fonction de `p` si le message a des paramètres |
| textes de l'interface | `UI`, `ui.js` | `{ en, fr }` par clé, lus par `t(clé, p)` (`render/i18n.js`) |

### Champs d'une mission

| Champ | Rôle |
| --- | --- |
| `id`, `title`, `story` | identifiant (`m01`…), titre, texte d'intro (prose écrite à la main) |
| `bricks` | briques posables (un palier de `BR`) |
| `rps`, `duration`, `mix`, `profile` | trafic de pointe, durée (s), mélange, profil |
| `goals` | `{ avail, p95, budget, fresh?, recos? }`, lus par `goalsMet` |
| `events?` | incidents (voir skill `simulation`) |
| `cards?` | `{ nom: nombre }` |
| `logged?`, `fresh?` | part d'utilisateurs connectés (sessions), part de lectures sensibles à la fraîcheur |
| `regions?` | `{ eu: part, us: part, … }` : clients multi-régions |
| `lbAlgos?` | algorithmes de LB proposés (par défaut selon la présence du cache, `lbAlgosOf`) |
| `sizes?`, `settingsAllowed?` | tailles de serveur réglables, réglages d'appli proposés |
| `preset?` | plateau de départ ; une brique `locked` ne se retire pas, `opts.legacy` désigne l'ancienne base |

## Ajouter une brique

1. **Constantes** : capacité, coût et durées dans `src/config.js`.
2. **Catalogue** : une entrée dans `CATALOG` (`catalog.js`) avec `row`, `name`, `short`, `cost`, `opts` par défaut et `desc`. Ajouter `unique: true` si la brique ne se pose qu'une fois, et ajouter son type à `GLOBAL` si elle est commune aux régions.
3. **Options** : les ajouter dans `OPT_DEFS[type]`, avec un `help` par choix si l'effet n'est pas évident.
4. **Simulation** : la récupérer dans `makeSim` (`one('type')` ou `filter`), l'exposer dans `S`, puis lui donner un effet dans la bonne étape de `stepSim` (skill `simulation`).
5. **Déblocage** : l'ajouter au bon palier de `BR` (`levels.js`) et de `UNLOCKS` (`rules/procgen.js`). Attention : changer `UNLOCKS` change tous les tours générés et casse l'instantané.
6. **Rendu** : sa couleur `--brick-<type>` dans `:root` (`css/style.css`, lue automatiquement par `loadTheme`), son pictogramme dans `icon()` et son résumé d'options dans `optSummary()` (`render/board.js`), sa jauge dans `liveNode()`. C'est une modification visuelle : artefact d'abord.
7. **Tests** : effet sur le trafic dans `tests/sim-step.test.js`, coût dans `tests/layout.test.js`.

## Ajouter une mission

1. Ajouter un objet dans `LEVELS` (`levels.js`), à sa place dans la progression : l'ordre décide du déblocage (3 étoiles sur la précédente).
2. `id` unique (`mNN`). Il sert de clé dans `ST.stars`, `ST.layouts` et `ST.settings` : **ne jamais renommer un `id` existant**, sinon les sauvegardes des joueurs sont perdues.
3. Choisir `bricks` dans `BR`, puis régler `rps`, `duration`, `mix`, `profile`, `goals`, et éventuellement `events`, `cards`, `preset`.
4. Écrire `story` : chaque chiffre cité (req/s, secondes, capacités) doit correspondre aux champs de la mission et à `config.js`.
5. Vérifier que la mission est gagnable : un test dans `tests/sim-result.test.js` avec un plateau de référence qui tient `goalsMet(level, runAll(...)).win`.
6. Insérer une mission décale les cas de l'instantané (les missions y sont rejouées) : voir le skill `testing`.

## Textes

- **Deux langues** : chaque texte affiché est une paire `{ en, fr }` (une chaîne seule si elle est identique dans les deux langues, comme « CDN » ou « 5 s »). L'anglais est la langue par défaut. `tests/texts.test.js` échoue si une langue manque.
- Les textes de l'interface (panneaux, feuilles, bilan, plateau, `index.html`) sont dans `UI` (`content/ui.js`) ; ceux des règles (réponses des cartes, chronologie, titres et récits générés) dans `MSGS` (`content/texts.js`). Les règles rendent `{ k, p }`, jamais une phrase : `tr(x, lang)` (`texts.js`) traduit, et le rendu passe par `tr` et `t` de `render/i18n.js`.
- Français : tutoiement, apostrophe typographique `’` et espace avant `%` et `€` (« 30 % », « 40 € »). Anglais : même ton, apostrophe `’`, mêmes montants (« 40 € ») ; virgule des milliers (« 1,000 »), point décimal (« 0.8 s »).
- Une valeur chiffrée se corrige dans les deux langues à la fois.
- `desc` explique l'effet en termes de jeu, avec les chiffres utiles. `help` explique le compromis d'un choix.
- Un texte qui cite un nombre est à mettre à jour en même temps que la constante (le hook Stop de synchro de doc le vérifie).
