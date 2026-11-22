---
description: Revue complète des changements en cours — conventions, tests, maintenabilité, cohérence avec le système existant.
---

# /review

## 1. Contexte

1. Lire `CLAUDE.md`, puis `docs/decisions.md` (exceptions admises, comportements laissés tels quels).
2. Établir le périmètre :
   - `git diff`
   - `git diff --cached`
   - `git status`
   - `git log --oneline -5`
3. S'il n'y a aucun changement (ni indexé, ni non indexé, ni fichier non suivi pertinent), répondre « Rien à relire » et s'arrêter.

## 2. Vérifications

Pour chaque point : **OK**, **VIOLATION** (fichier:ligne, explication, correction proposée) ou **N/A**.

### Conventions
1. Ordre des couches respecté (`config` → `content` → `rules` → `state` → `render` → `input` / `loop` → `main`), aucune nouvelle exception.
2. Aucun accès au DOM, `Math.random`, `Date` ou `performance.now` dans `src/rules/`.
3. Aucun nombre de réglage en dur hors de `src/config.js` ; chaque nouvelle constante est nommée en MAJUSCULES et commentée avec son unité.
4. Aucune couleur, taille, espacement ou rayon en dur dans le CSS, les styles en ligne ou le canvas (variables de `:root`, `C`, `BRICK`, `REGION`, `CT`).
5. Aucune nouvelle règle qui modifie ses arguments (seules exceptions : `stepSim`, `useCard`, `promote`, `addReason`).
6. Le rendu lit `RUN.S` / `RUN.tk` sans recalculer la simulation.
7. Modification visuelle : un artefact a-t-il été validé ? (sinon, signaler)
8. Textes en français, apostrophe `’`, espace avant `%` et `€` ; commentaires en français.
9. Aucun `id` de mission ni champ de `ST` renommé ; un nouveau champ de `ST` tolère son absence dans une vieille sauvegarde.
10. Les comportements listés dans « Laissé volontairement tel quel » n'ont pas été modifiés sans demande.

### Tests
11. Chaque règle nouvelle ou modifiée a un test macro dans le bon fichier (skill `testing`).
12. Les tests vérifient un comportement observable, avec un nom en français qui énonce la règle.
13. `tests/golden/golden.json` n'est pas modifié sans un changement de règle explicitement voulu.

### Maintenabilité
14. Couplage : pas de nouvelle dépendance croisée entre modules.
15. Responsabilité unique : chaque fonction ajoutée fait une chose.
16. Duplication : pas de logique copiée depuis `rules/` vers `render/` (appeler la règle).
17. Longueur et complexité : pas de nouvelle fonction monolithique ; on n'allonge pas `stepSim` hors de l'étape concernée.
18. Nommage : cohérent avec le local (camelCase anglais court, clés de contenu courtes).
19. Valeurs magiques : aucune hors de `config.js` et des variables CSS.

### Cohérence du système
20. Intégration : le nouveau code passe par les points d'extension existants (`CATALOG`, `OPT_DEFS`, `LEVELS`, `CARDS`, `REASONS`, étapes de `stepSim`, `useCard`, `render…`).
21. Forme des données : layout `{ edge, app, svc, data }`, brique `{ type, opts?, region?, locked? }`, `tick`, résultat de `resultOf`, `ST`, inchangés ou étendus de façon compatible.
22. État initialisé dans `makeSim` pour tout nouveau champ de `S`.
23. Documentation vivante à jour : `desc` / `help` (`catalog.js`), `CARDS`, `story`, messages de `useCard`, textes en dur de `render/panels.js` et `render/dialogs.js`, `index.html`, `README.md`, skills et `CLAUDE.md`.

## 3. Tests

Lancer `npm test`, puis rapporter le nombre de tests et d'échecs. En cas d'échec, citer le test et la sortie utile.

## 4. Rapport

```
## Revue — <résumé du périmètre>

| # | Point | Statut | Détail |
| --- | --- | --- | --- |
| 1 | Ordre des couches | OK | |
…

Tests : <n> passés, <n> échoués.

Verdict : PRÊT | À CORRIGER (<n> violations) | BLOQUÉ (tests rouges)
```

Ne rien corriger sans que l'utilisateur le demande.
