---
description: Vérification rapide des conventions, de la cohérence tests/doc et de la suite de tests sur les changements en cours.
---

# /check-conventions

## 1. Contexte

1. Lire `CLAUDE.md`.
2. Établir le périmètre :
   - `git diff`
   - `git diff --cached`
   - `git status`
   - `git log --oneline -5`
3. S'il n'y a aucun changement, répondre « Rien à vérifier » et s'arrêter.

## 2. Vérifications

Pour chaque point : **OK**, **VIOLATION** (fichier:ligne, correction) ou **N/A**.

1. Ordre des couches respecté, aucune nouvelle exception.
2. `src/rules/` : ni DOM, ni `Math.random`, ni horloge.
3. Aucun nombre de réglage hors de `src/config.js`.
4. Aucune valeur visuelle en dur (CSS, styles en ligne, canvas).
5. Aucune nouvelle règle qui modifie ses arguments.
6. Textes et commentaires en français, typographie (`’`, espace avant `%` et `€`).
7. Tests : une règle nouvelle ou modifiée est couverte par un test macro.
8. Documentation vivante : les textes qui citent une valeur touchée (`catalog.js`, `texts.js`, `levels.js`, `useCard`, `render/panels.js`, `render/dialogs.js`, `index.html`, `README.md`) sont à jour.
9. `tests/golden/golden.json` n'est pas modifié sans changement de règle voulu.

## 3. Tests

Lancer `npm test`, puis rapporter le nombre de tests passés et échoués.

## 4. Rapport

```
## Conventions — <résumé du périmètre>

| # | Point | Statut | Détail |
| --- | --- | --- | --- |
…

Tests : <n> passés, <n> échoués.

Verdict : CONFORME | NON CONFORME (<n> violations)
```
