# Décisions du refactor

Écrit par `/refactor-game` à partir du prototype mono-fichier `index.html` (commit `f6479f6`).
Consigne ce que le code ne dit pas : pourquoi ce découpage, pourquoi cet outillage, ce qui a
été volontairement laissé tel quel, ce qui reste à trancher.

Lu par `/scaffold-claude` pour ne pas avoir à tout redéduire.

## Archétype

Retenu : **simulation sur grille / propagation, à pas fixe** (archétype 3).
Pourquoi : le cœur du jeu est `stepSim`, un pas de simulation fixe (`DT` = 0,25 s) qui fait
s'écouler un débit de requêtes à travers les briques posées et produit un *tick* par pas.
La boucle d'affichage (`requestAnimationFrame`) est séparée du pas de simulation.

Ce qui ne colle pas :

- Ce n'est pas une grille à voisinage mais un **réseau de flux** sur des cases : chaque
  rangée (bord, appli, services, données) alimente la suivante selon les briques présentes.
  Pas de fonction de voisinage : `receiversOf` et le routage de `stepSim` en tiennent lieu.
- La **phase de construction** est événementielle (archétype 2, plateau au tour par tour) :
  poser, régler, retirer une brique, sans boucle.
- Une **méta-progression** s'ajoute : 19 missions à étoiles, mode Croissance (tours
  générés, trésorerie, faillite), Défi du jour (niveau tiré de la date).
- `stepSim` **modifie l'état `S` sur place** au lieu de rendre un nouvel état (voir
  *Exceptions au contrat de pureté*).

## Outillage

Branche : **zero-build**
Signal : aucun des déclencheurs Vite. Pas de paquet npm, pas de TypeScript, aucun asset à
empaqueter (la police vient de Google Fonts), environ 1 500 lignes de JavaScript, sous le
seuil de 2 000.
Node : 22
Lanceur de tests : `node:test` + `node:assert/strict`, aucune dépendance.
Serveur de dev : `npx serve .` (ESM natif, ne marche pas en `file://`).

## Découpage

Les flèches d'import ne descendent que dans cet ordre : `config` → `content` → `rules` →
`state` → `render` → `input` / `loop` → `main`.

| Module | Responsabilité | Vient de |
| --- | --- | --- |
| `index.html` | squelette DOM | `index.html` d'origine, `<style>` et `<script>` retirés |
| `css/style.css` | toute la feuille de style | bloc `<style>` d'origine |
| `src/config.js` | toutes les constantes nommées (DT, capacités, seuils, revenus…) | nombres en dur dans le moteur et l'interface |
| `src/content/catalog.js` | rangées, catalogue des briques, classes de requêtes, briques globales, options réglables (`OPT_DEFS`, `SET_DEFS`) | `ROW_DEF`, `CATALOG`, `OPT_DEFS`, `SET_DEFS`, `GLOBAL` |
| `src/content/levels.js` | les 19 missions et leurs fabriques (`mixOf`, `wave`) | `LEVELS` |
| `src/content/texts.js` | noms de régions, d'incidents, de cartes, causes d'échec | `REGION_NAMES`, `REGION_SHORT`, `EVENT_NAMES`, `CARDS`, `REASONS` |
| `src/rules/latency.js` | latence d'un serveur / d'une base selon la charge | moteur |
| `src/rules/stats.js` | p95 pondéré, cumul des causes d'échec | moteur |
| `src/rules/layout.js` | options par défaut, coût d'une brique et d'un plateau, plateau vide | moteur |
| `src/rules/goals.js` | objectifs tenus, étoiles, déblocage des missions | interface (`showResult`, `renderTop`) |
| `src/rules/campaign.js` | revenu, faillite, tour suivant, record de Croissance | interface (`showResult`) |
| `src/rules/daily.js` | record du défi du jour | interface (`showResult`) |
| `src/rules/procgen.js` | générateur pseudo-aléatoire, tours de Croissance, défi du jour | moteur |
| `src/rules/sim/make.js` | état initial d'une simulation à partir d'un plateau | moteur (`makeSim`) |
| `src/rules/sim/cards.js` | cartes d'action, promotion de réplique | moteur (`useCard`, `promote`) |
| `src/rules/sim/step.js` | un pas de simulation | moteur (`stepSim`), déplacé tel quel |
| `src/rules/sim/result.js` | bilan d'une partie, partie complète sans affichage | moteur (`resultOf`, `runAll`) |
| `src/state/store.js` | sauvegarde du joueur (`localStorage`, clé `tenir-la-charge-v2`) | `ST`, `save` |
| `src/state/context.js` | niveau courant (`CUR`), simulation en cours (`RUN`), nouvelle partie Croissance, accesseurs du plateau courant | `buildCtx`, `newCamp`, `lay`, `sets`… |
| `src/render/dom.js` | `$` et format des nombres | interface |
| `src/render/geometry.js` | canvas, placement des cases, positions | `layout`, `center`, `placed`, `serverPos` |
| `src/render/board.js` | dessin du plateau, des briques, des liens | `draw`, `drawBrick`, `liveNode`… |
| `src/render/particles.js` | requêtes animées (cosmétique) | `spawn`, `spawnJob`, `stepParticles` |
| `src/render/panels.js` | bandeau du haut, objectifs, outils, cartes en jeu, `refresh` | `renderTop`, `renderGoals`… |
| `src/render/dialogs.js` | toast, feuilles (poser, régler, réglages), modale de résultat | `addSheet`, `editSheet`, `showResult`… |
| `src/input/handlers.js` | écouteurs fixes du DOM, transformés en intentions | écouteurs de fin de script |
| `src/loop/run.js` | intentions du joueur, lancement et fin d'un run, boucle `frame` | `startRun`, `endRun`, `frame` |
| `src/main.js` | câblage : sources d'aléa et d'horloge, écouteurs, premier rendu, boucle | — |

Écarts par rapport au découpage type :

- **`src/content/`** n'existe pas dans le gabarit. Les données de jeu (catalogue, missions,
  textes) ne sont ni des constantes de réglage ni des règles ; les mettre dans `config.js`
  l'aurait rendu illisible. `rules/` peut importer `content/`.
- **`render/dialogs.js` et `render/panels.js`** lient leurs boutons au moment où ils
  génèrent le HTML (`onclick` dans le rendu), et certains de ces boutons écrivent dans
  l'état (`ST.stars`, `ST.camp`…) et appellent des règles. C'est l'héritage du prototype ;
  le séparer aurait été une réécriture. Ces deux modules s'importent mutuellement.
- **`render/` importe `rules/`** (`goalsMet` pour colorer les objectifs, `useCard`,
  `campOutcome`…) et **`state/context.js` importe `rules/`** (`genLevel`, `emptyLayout`).
- **`CUR` et `RUN`** restent des liaisons exportées (`export let`) plutôt qu'un objet
  `app = { cur, run }` prévu au plan : `CUR` n'est réassigné que par `buildCtx`, `RUN` que
  par `setRun`, et les modules lecteurs voient la valeur à jour (liaisons vivantes ESM).
  Même principe pour `W`, `H`, `G` (`geometry.js`) et `particles`, `bursts`
  (`particles.js`, vidés par `clearParticles`).
- **`input/handlers.js`** ne couvre que les écouteurs posés une fois (plateau, onglets,
  Lancer, vitesse, fond de modale, redimensionnement). Il n'importe rien : `main.js` lui
  passe les intentions.

## Règles extraites

| Règle | Module | Test | Notes |
| --- | --- | --- | --- |
| latence selon la charge | `rules/latency.js` | `tests/latency.test.js` | |
| p95 pondéré, causes d'échec | `rules/stats.js` | `tests/stats.test.js` | `addReason` modifie son accumulateur |
| coûts, plateau vide | `rules/layout.js` | `tests/layout.test.js` | |
| objectifs, étoiles, déblocage | `rules/goals.js` | `tests/goals.test.js` | sorti de l'interface |
| revenu, faillite, tour suivant | `rules/campaign.js` | `tests/campaign.test.js` | `nextRound` rend une nouvelle partie ; ordre des clés sauvegardées conservé |
| record du défi | `rules/daily.js` | `tests/daily.test.js` | |
| génération procédurale | `rules/procgen.js` | `tests/procgen.test.js` | |
| création de simulation | `rules/sim/make.js` | `tests/sim-make.test.js` | |
| cartes d'action | `rules/sim/cards.js` | `tests/sim-cards.test.js` | modifie `S` |
| pas de simulation | `rules/sim/step.js` | `tests/sim-step.test.js` | modifie `S`, non découpé |
| bilan de partie | `rules/sim/result.js` | `tests/sim-result.test.js` | |
| tout le moteur | — | `tests/golden.test.js` | instantané de référence, voir plus bas |

**Instantané de référence** (`tests/golden/`) : 1 506 simulations figées depuis le
prototype d'origine (missions, tours de Croissance, défis du jour, revenus, combinaisons
de plateaux, de réglages et de cartes). `make-golden.js` extrait le moteur du commit
`f6479f6` avec `node:vm` et régénère `golden.json` ; `golden.test.js` compare le moteur
actuel champ par champ. À ne régénérer que pour un changement de règle voulu.

### Exceptions au contrat de pureté

- `stepSim`, `useCard` et `promote` (`rules/sim/`) **modifient l'état `S`** reçu en
  argument. `stepSim` fait 350 lignes interdépendantes ; le réécrire en fonction pure aurait
  changé le code au-delà d'un déplacement. Validé avec l'utilisateur.
- `addReason` (`rules/stats.js`) ajoute dans l'accumulateur qu'on lui passe.

Toutes les autres règles sont pures : pas de DOM, pas de `Math.random`, pas d'horloge.

## Aléa et horloge

| Endroit | Classement | Traitement |
| --- | --- | --- |
| graine d'une partie Croissance (`newCamp`) | porte une règle | `Math.random` déplacé dans `main.js` (`randomSeed`), injecté via `sources` |
| date du défi du jour (`buildCtx`) | porte une règle | `new Date()` déplacé dans `main.js` (`todayStr`), injecté via `sources` |
| tirages des tours et du défi (`procgen.js`) | porte une règle | générateur xorshift **d'origine** (`rng(seed)`), conservé tel quel plutôt que remplacé par le `createRng` du gabarit, sinon tous les niveaux auraient changé |
| 18 appels `Math.random` dans `spawn`, `spawnJob`, `jit` (`render/particles.js`) | cosmétique | laissés dans le rendu : ils échantillonnent les probabilités du tick pour animer des points, sans effet sur le score |
| `performance.now()` du clignotement d'alarme (`drawBrick`) | cosmétique | laissé dans le rendu |
| `performance.now()` / `requestAnimationFrame` (`loop/run.js`) | horloge de la boucle | la boucle mesure le temps et appelle `stepSim` par pas fixes de `DT` |

Graine : tirée au hasard à chaque nouvelle partie Croissance ; date du jour pour le défi.

## Laissé volontairement tel quel

Comportements qui semblent faux mais conservés, car le refactor ne doit pas changer le jeu.

- **Les particules ne racontent pas tout à fait la simulation** (`render/particles.js`) :
  un upload s'affiche réussi même si le stockage objet est tombé ; le serveur visé est
  tiré uniformément sans tenir compte de « moins chargé » ni des régions ; l'échec de
  connexion (`connFail`) est tiré deux fois ; ni la ruée sur la base ni le délestage
  partiel ne sont montrés. Purement visuel, le score vient de `stepSim`.
- **Code mort dans `stepSim`** : `D.direct` jamais rempli, `botsByPool` jamais lu, champ
  `u` des lectures base, `tk.nodes`, `tk.events`, `tk.fail`, `tk.ok` jamais mis à jour, et
  dans `tk.vis` les champs `fMain`, `stampede`, `apiBad`, `botsPass`, `bots`, `hit` jamais
  lus par le rendu. La fonction locale `G` y masque le nom `G` de la géométrie (sans
  conflit, modules distincts).
- **Code mort dans le rendu** : paramètre `col` de `done()` et champ `blockColor` dans
  `spawn` ; `camp.over` jamais passé à `true` ; `camp.history` enregistré mais jamais affiché.
- **Jauge du pooler sans base** : divise par `POOLER_GAUGE_MAX` (150, la valeur en dur
  d'origine) quand `tk.maxConn` vaut 0.
- **Texte « démarre à 300 »** dans le bandeau Croissance (`render/panels.js`) écrit en dur,
  en double de `CAMP_START_CASH`.
- **Sauvegarde sans version ni migration** : `ST` est fusionné tel quel avec ce que contient
  `localStorage`.
- **`user-scalable=no`** dans le viewport (accessibilité), conservé.

## Questions ouvertes

Décisions que le code ne tranche pas et qui n'ont pas été prises.

- **Découper `stepSim` en étapes** (entrée et bots, serveurs, cache et base, files et
  workers, autoscaling, état visuel) et lui faire rendre un nouvel état : utile avant
  d'ajouter des briques ou des incidents, mais hors du périmètre d'un refactor à
  comportement constant. L'instantané de référence permet de le faire sans risque.
- Faut-il aligner les particules sur la simulation (voir plus haut), ou est-ce assumé comme
  une illustration approximative ?
- Faut-il versionner la sauvegarde avant de changer la forme de `ST` ?
