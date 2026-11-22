# PRD : Cloisonnement

## But

Le joueur peut réserver un serveur à une classe de requêtes, les paiements ou les recommandations. Quand cette classe rame ou explose, le reste du site continue de répondre.

Aujourd'hui, une API de paiement lente occupe tous les serveurs (mission 11 : 67,9 % de dispo sans disjoncteur) et un pic de recos sature tout le monde (mission 15 : 94,4 % sans délestage). Le disjoncteur coupe les paiements, le délestage sacrifie les recos. Le cloisonnement est la troisième réponse : on paie un serveur souvent à moitié vide pour que la panne reste dans son couloir.

## État technique

- **Catalogue** : `CATALOG` et `OPT_DEFS` dans `src/content/catalog.js`. La rangée Application a 5 cases (`ROW_DEF`). `unique: true` limite une brique à un exemplaire par type.
- **Briques en jeu** : `makeSim` (`src/rules/sim/make.js`) range les briques dans `S.bricks` et des raccourcis (`S.lb`, `S.breaker`…). `receiversOf(S)` liste les serveurs qui reçoivent : sans LB, seul `S.fixed[0]`.
- **Étage serveurs** (`stepSim`, `src/rules/sim/step.js`, bloc « étage serveurs ») : par région, le volume pondéré `W` additionne toutes les classes avec leur poids `COST`. Un paiement pèse `1 + attente / PAY_WAIT_DIVISOR`, donc une API lente alourdit toutes les requêtes du pool. Le délestage retire des recos au-delà de `SHED_THRESHOLD`.
- **Après les serveurs** : les paiements partent vers l'API ou la file (`D.jobs.pay`), les recos et lectures vers la base. Le disjoncteur (`S.brk`) met l'attente à 0 et fait échouer les paiements vite.
- **Connexions** : chaque serveur ajoute ses `conns` au total comparé à `PRIMARY_MAX_CONN` (ou au pooler).
- **Causes d'échec** : `REASONS` dans `src/content/texts.js`, alimentées par `addReason`.
- **Missions** : `LEVELS` dans `src/content/levels.js`, clé de sauvegarde `lv.id`. La mission en cours est un **index** (`ST.level`, `src/state/store.js`).
- **Génération** : `UNLOCKS` dans `src/rules/procgen.js` débloque les briques par paliers en Croissance. `opts.all` les donne toutes au Défi du jour.
- **Rendu** : `icon()` et `liveNode()` dans `src/render/board.js`, couleur `--brick-<type>` dans `css/style.css`. Le catalogue desktop et la feuille mobile se construisent depuis `CATALOG` et `lv.bricks`.
- **Instantané** : `tests/golden.test.js` compare tout le moteur à `golden.json`, produit depuis le prototype. L'option `make-golden.js --current` décidée dans `docs/decisions.md` n'existe pas encore.

## Comportement

### La brique

| Propriété | Valeur |
| --- | --- |
| Type, nom, abréviation | `bulkhead`, Cloisonnement, `CLOIS` |
| Rangée | Application (elle prend une case aux serveurs) |
| Coût | 45 €/mois |
| Capacité | 400 req/s (comme un serveur moyen) |
| Connexions à la base | 30 |
| Option | Classe réservée : Paiements (par défaut) ou Recos |
| Nombre | 2 au plus, une par classe. La classe déjà prise est grisée dans les réglages de la seconde. |
| Région | Oui, comme un serveur |

### En jeu

1. Toutes les requêtes de la classe réservée passent par le cloisonnement, quelle que soit leur région d'origine. Elles ne pèsent plus sur les serveurs partagés.
2. Latence : `BASE_LAT + DIST[région utilisateur][région du cloisonnement] + srvLat(ρ) + LB_LAT`, avec ρ = charge pondérée du cloisonnement / 400.
3. Un paiement garde son poids `payCost` dans le cloisonnement : une API lente sature le cloisonnement, plus les serveurs partagés.
4. Au-delà de 100 % de charge, l'excédent de la classe échoue avec une nouvelle cause, `bulkheadSat` : « Cloisonnement saturé ».
5. Le disjoncteur, le timeout, les nouveaux essais et la file de paiements s'appliquent comme aujourd'hui, après le cloisonnement.
6. Le délestage s'applique dans un cloisonnement Recos avec le même seuil de 90 %. La carte Dégrader coupe les recos comme avant, et le cloisonnement Recos reste alors vide.

### Cas limites

- **Sans LB** : le cloisonnement ne reçoit rien et la classe reste sur le serveur unique. Le plateau affiche « sans LB », comme l'autoscaling.
- **Cloisonnement mort** (panne de région) : la classe revient sur les serveurs partagés au pas suivant. Pas de coupure sèche.
- **Panne de serveur** (`crash`, cible 0) : vise toujours `S.fixed[0]`, jamais le cloisonnement.
- **Mission sans la classe** (aucun paiement) : le cloisonnement reste vide, à 0 %, et coûte quand même.
- **Autoscaling** : il ne grossit pas le cloisonnement. Ses instances rejoignent les serveurs partagés.
- **Bots** : ils restent sur les serveurs partagés.

### Nouvelle mission, insérée après la 15

- Identifiant `m15b`, affichée comme mission 16. Les missions 16 à 19 deviennent 17 à 20.
- Titre : « Chacun son couloir ».
- Histoire : 1 200 req/s, dont 8 % de paiements. De la 6e à la 18e seconde, l'API de paiement répond en 750 ms : sous le seuil d'ouverture du disjoncteur (800 ms) et sous le timeout court, mais chaque paiement pèse 8,5 fois une page. Le joueur peut perdre des paiements, pas le site.
- Briques : celles de la mission 15 plus `bulkhead`. Réglage autorisé : timeout.
- Objectifs : 97 % de dispo, 200 ms de p95, budget 305 €. Avec le solveur de `docs/solutions.md` : la moins chère des infras trois étoiles coûte 300 € (LB moins chargé, 1 gros + 1 petit, cloisonnement Paiements, Redis, base) ; aucune infra sans cloisonnement ne tient sous 315 €. Un premier scénario (API à 3 s, 15 % de paiements et 25 % de recos) a été écarté : le disjoncteur y suffisait et aucune infra ne tenait 99 %.
- Le cloisonnement est aussi ajouté aux briques des missions 17 à 20 (anciennes 16 à 19).

### Sauvegarde

Une migration unique, marquée par `ST.levelsV = 2` : si `ST.level >= 15`, alors `ST.level += 1`. Les étoiles et les infras sont rangées par `lv.id` et ne bougent pas. Un joueur qui avait débloqué l'ancienne mission 16 garde l'accès aux suivantes (`missionUnlocked` accepte toute mission déjà étoilée). La nouvelle mission se débloque avec les trois étoiles de la mission 15.

### Modes générés

`bulkhead` rejoint le palier `['breaker', 'waf', 'pooler']` de `UNLOCKS`. Il est disponible en Croissance à partir de ce palier, et au Défi du jour. La génération du trafic ne change pas : seule la liste des briques offertes change.

## Hors périmètre

- Cloisonner les lectures, les écritures, le statique ou les envois de fichiers.
- Des tailles différentes de cloisonnement (petit, gros).
- L'autoscaling du cloisonnement.
- Une carte d'action liée au cloisonnement.
- Revoir l'équilibrage des missions 1 à 15.

## Impact par couche

| Couche | Fichiers | Changement |
| --- | --- | --- |
| config | `src/config.js` | `BULKHEAD_CAP = 400`, `BULKHEAD_CONNS = 30`, section Cloisonnement. Coût dans le catalogue, comme les autres briques. |
| content | `src/content/catalog.js` | Entrée `bulkhead` dans `CATALOG` (rangée `app`, coût 45, `opts: { cls: 'pay' }`, description), `OPT_DEFS.bulkhead` (Paiements / Recos). |
| content | `src/content/texts.js` | `REASONS.bulkheadSat`. |
| content | `src/content/levels.js` | Mission `m15b` insérée après `m15`, `bulkhead` ajouté aux missions suivantes. |
| rules | `src/rules/sim/make.js` | `S.bulkheads = { pay, reco }` avec capacité, connexions, région. `receiversOf` inchangé. |
| rules | `src/rules/sim/step.js` | Étage serveurs : la classe réservée sort de `vol` avant le calcul de `W` et passe dans un pool dédié (charge, saturation, délestage, latence). Connexions : ajout de celles des cloisonnements vivants. Champ `tk.servers` pour la jauge. |
| render | `src/render/dialogs.js` (`brickBlock`) | Blocage « une par classe » : deux cloisonnements au plus, classe déjà prise grisée. |
| rules | `src/rules/procgen.js` | `bulkhead` dans `UNLOCKS`. |
| state | `src/state/store.js` | Migration de `ST.level` (`levelsV`). |
| render | `src/render/board.js`, `css/style.css` | Icône, couleur `--brick-bulkhead`, sous-titre « Paiements · 45€ » ou « Recos · 45€ », jauge de charge en partie, « sans LB ». **Maquette à valider avant de coder.** |
| input / loop | — | Rien : la pose passe par le catalogue et la feuille existants. |

## Critères d'acceptation

- [ ] Le cloisonnement se pose dans la rangée Application, coûte 45 € et propose Paiements ou Recos.
- [ ] Un second cloisonnement ne peut prendre que l'autre classe. Un troisième est refusé.
- [ ] Mission 11 avec un cloisonnement Paiements à la place du disjoncteur : la lenteur de l'API ne fait plus échouer les lectures, et les échecs restants sont des « Cloisonnement saturé ».
- [ ] Sans LB, le cloisonnement ne reçoit rien et le plateau affiche « sans LB ».
- [ ] Si la région du cloisonnement tombe, sa classe repart sur les serveurs partagés.
- [ ] Une infra sans cloisonnement donne exactement le même résultat qu'avant, pour toutes les missions existantes.
- [ ] La nouvelle mission ne se gagne pas sans cloisonnement, et se gagne en trois étoiles avec.
- [ ] Un joueur sauvegardé sur l'ancienne mission 17 retrouve la même mission (désormais 18) à l'ouverture.
- [ ] Le cloisonnement apparaît en Croissance au palier du disjoncteur et au Défi du jour.

## Tests

- `tests/sim-step.test.js` :
  - « un cloisonnement Paiements protège les lectures quand l'API rame »
  - « un cloisonnement saturé fait échouer sa seule classe »
  - « sans load balancer, le cloisonnement ne reçoit rien »
  - « un cloisonnement mort renvoie sa classe sur les serveurs partagés »
  - « le délestage s'applique dans un cloisonnement Recos »
- `tests/sim-make.test.js` : « deux cloisonnements de classes différentes sont pris en compte, avec leurs connexions ».
- `tests/campaign.test.js` ou `tests/procgen.test.js` : « le cloisonnement est débloqué avec le disjoncteur ».
- Test de la migration de sauvegarde (nouveau, `tests/store.test.js` ou dans un test existant si `store.js` y est déjà testé).
- Nouvelle mission : un test qui joue la solution trouvée par le solveur et vérifie les trois étoiles, et une infra sans cloisonnement qui échoue.
- **`tests/golden.test.js` va échouer** : la liste des missions change (nouvelle mission, briques ajoutées) et les niveaux générés offrent une brique de plus. Préalable : implémenter `make-golden.js --current` (décision de `docs/decisions.md`), vérifier que seuls ces cas bougent, puis régénérer `golden.json` dans le même commit que la règle.

## Risques et questions ouvertes

- **Instantané** : l'option `--current` n'existe pas encore. C'est un chantier préalable, à faire dans un commit à part.
- **`stepSim` à découper** : `docs/decisions.md` impose de découper `stepSim` par étapes au premier ajout de brique, avant d'écrire la nouveauté. L'étage serveurs est le plus long, et c'est celui que le cloisonnement touche.
- **Numérotation** : les missions 16 à 19 deviennent 17 à 20. `README.md` (« 19 situations ») et `docs/solutions.md` sont à mettre à jour.
- **Équilibrage** : 45 € pour 400 req/s, c'est plus cher qu'un serveur moyen (40 €). Le surcoût paie l'isolation. À confirmer avec le solveur sur la nouvelle mission et sur les missions 11 et 15 (le cloisonnement ne doit pas rendre le disjoncteur ou le délestage inutiles).
- **Solutions publiées** : avec la brique ajoutée aux missions 17 à 20, leurs solutions les moins chères peuvent changer. Il faudra relancer le solveur.
- **Nom de la brique** : « Cloisonnement » est long sur une tuile étroite. `CLOIS` sur le plateau, nom complet dans le catalogue et la feuille.
