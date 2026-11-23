# Tenir la charge

Jeu d'architecture web dans le navigateur : on pose des briques (serveurs, caches, files, bases…) sur un plateau, puis une simulation à pas fixe fait passer le trafic, les pannes et les attaques à travers l'infrastructure.

## Stack

- JavaScript en modules ES natifs, **sans build ni dépendance**. HTML (`index.html`), CSS (`css/style.css`), canvas 2D.
- Node ≥ 22, uniquement pour les tests et le serveur de dev.
- Tests : `node:test` + `node:assert/strict`.
- Aucun linter ni formateur configuré.

| Commande | Effet |
| --- | --- |
| `npm run dev` | sert le dossier (`npx serve .`). Le jeu ne marche pas en `file://` |
| `npm test` | lance toute la suite (`node --test`) |
| `npm run test:watch` | relance les tests à chaque modification |
| `node tests/golden/make-golden.js` | régénère l'instantané de référence depuis le prototype (commit `f6479f6`) |

Les arbitrages du découpage, les exceptions et les questions ouvertes sont dans `docs/decisions.md`.

## Conventions de code

### Couches

Les imports ne descendent que dans cet ordre : `config` → `content` → `rules` → `state` → `render` → `input` / `loop` → `main`. Exceptions admises (héritage du prototype) : `render/` et `state/context.js` importent `rules/` ; `render/panels.js` et `render/dialogs.js` s'importent mutuellement.

### À ne jamais faire

- **Pas de DOM, pas de `Math.random`, pas d'horloge (`Date`, `performance.now`) dans `src/rules/`.** L'aléa passe par `rng(seed)` (`rules/procgen.js`). La graine et la date viennent de `main.js` via `sources` (`state/context.js`).
- **Pas de nombre de réglage en dur hors de `src/config.js`.** Une capacité, une durée, un coût, un seuil : c'est une constante nommée, en MAJUSCULES, commentée avec son unité.
- **Pas de couleur, taille de texte, espacement ni rayon en dur, ni dans le CSS ni sur le canvas.** Tout passe par les variables de `:root` (`css/style.css`), que le canvas lit via `loadTheme()` (`render/theme.js`).
- **Pas d'import de `state/`, `render/`, `input/` ou `loop/` depuis `rules/`, `content/` ou `config.js`.**
- **Pas de changement du résultat de la simulation sans le vouloir.** `tests/golden.test.js` doit rester vert. Un changement de règle voulu le casse forcément : on met l'instantané à jour selon la procédure du skill `testing`, dans le même commit, et on le dit.
- **Pas de nouvelle exception au contrat de pureté.** Seuls `stepSim`, `useCard`, `promote` (modifient `S`) et `addReason` (modifie son accumulateur) en ont une. Toute nouvelle règle rend une valeur neuve.
- **Pas de `Math.random` dans le rendu, sauf pour le cosmétique** (`render/particles.js`) : rien de ce qui touche au score.

### Données et état

- Un plateau (`layout`) : `{ edge, app, svc, data }`, chacun un tableau de cases `brique | null`. Une brique : `{ type, opts?, region?, locked? }`.
- La sauvegarde du joueur, c'est `ST` (`state/store.js`, clé `localStorage` `tenir-la-charge-v2`), écrite par `save()`. Elle n'a ni version ni migration. Un champ de premier niveau s'ajoute librement ; un renommage, une restructuration ou un champ imbriqué impose d'abord une version et un `migrate` (skill `progression`).
- Le contexte courant (`CUR`) et la simulation en cours (`RUN`) sont des liaisons ESM exportées. Seuls `buildCtx` et `setRun` les réassignent.
- L'état de simulation `S` est créé par `makeSim` et avancé sur place par `stepSim`, qui pousse un relevé (`tick`) par pas.

### Nommage et style

- Code compact dans l'esprit du prototype : identifiants courts en camelCase anglais (`stepSim`, `layoutCost`, `campOutcome`), clés de contenu courtes (`lb`, `db`, `objstore`).
- **Commentaires, tests et docs en français.** Les **textes du jeu existent en anglais (par défaut) et en français** : paires `{ en, fr }` dans `content/` (`UI` dans `ui.js` pour l'interface, `MSGS` dans `texts.js` pour les messages des règles), jamais de phrase en dur dans `rules/`, `render/`, `loop/` ou `index.html`. Apostrophe typographique (`’`) dans les deux langues.
- Un commentaire d'une ligne au-dessus d'une fonction exportée dit ce qu'elle calcule. Les sections se signalent par `// ---------- titre ----------`.
- Les noms de tests sont des phrases en français qui décrivent un comportement (« relancer sans serveur tombé ne consomme pas la carte »).

## Conventions visuelles

Toute modification visuelle (mise en page, tailles, couleurs, typographie, rendu du plateau) doit d'abord être proposée dans un artefact : maquette ou capture avant/après, et extraits de code. On ne code qu'après validation de l'artefact.

- Les échelles sont dans `:root` : couleurs, `--t-1…5` (DOM), `--c-1…3` (canvas), `--s-0…6`, `--r-1…3`, `--b-1…2`, ombres `--sh*`. On réutilise une marche existante avant d'en créer une.
- Chaque type de brique a sa couleur `--brick-<type>` et chaque région la sienne, `--region-<clé>`.

## Documentation vivante

Les textes écrits à la main recopient des valeurs de `config.js` : `desc` et `help` dans `content/catalog.js`, `CARDS` et `MSGS` (messages de `useCard`) dans `content/texts.js`, `story` dans `content/levels.js`, `UI` dans `content/ui.js` (« démarre à 300 », « si dispo ≥ 99 % », « −30 % pour la lenteur »), le `README.md`. Chacun existe en anglais et en français : quand une valeur change, on met à jour les deux langues dans le même changement. Un hook Stop le vérifie.

## Comportement

- Ne jamais déclarer une tâche terminée sans avoir lancé `npm test` et vérifié que tout passe. Un hook Stop bloque si la suite échoue.
- Si une approche échoue deux fois, revoir le plan avant de continuer.
- Implémenter seulement ce qui est demandé. Les comportements listés dans « Laissé volontairement tel quel » (`docs/decisions.md`) ne se corrigent pas au passage.
- Une règle nouvelle ou modifiée s'accompagne d'un test macro dans `tests/`.

## Skills disponibles

| Skill | Périmètre |
| --- | --- |
| `architecture` | carte des modules, ordre des imports, où va le nouveau code |
| `testing` | commande, philosophie, fichier de test → périmètre, instantané de référence |
| `simulation` | moteur de flux : `makeSim`, `stepSim`, cartes, bilan, latence, constantes |
| `contenu` | briques, options, missions, incidents, cartes, textes ; procédures d'ajout |
| `progression` | modes Missions, Croissance et Défi : objectifs, étoiles, revenu, génération, sauvegarde |
| `rendu` | plateau canvas, géométrie, thème CSS, panneaux, feuilles, particules |
| `feature` | workflow pour implémenter une fonctionnalité de bout en bout |
| `prd` | rédiger la spécification d'une fonctionnalité, sans l'implémenter |

Commandes : `/review`, `/check-conventions`, `/check-tests`.
