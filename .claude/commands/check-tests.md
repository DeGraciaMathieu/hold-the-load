---
description: Analyse la couverture de tests des changements en cours, propose les tests macro manquants, les écrit après accord.
---

# /check-tests

## 1. Contexte

1. Lire `CLAUDE.md` et le skill `testing` (`.claude/skills/testing/SKILL.md`).
2. Établir le périmètre :
   - `git diff`
   - `git diff --cached`
   - `git status`
   - `git log --oneline -5`
3. S'il n'y a aucun changement, répondre « Rien à analyser » et s'arrêter.

## 2. Analyse

Pour chaque fonction ou règle ajoutée ou modifiée dans `src/config.js`, `src/content/` et `src/rules/` :

1. Repérer le fichier de test qui la couvre (tableau « fichier de test → périmètre » du skill `testing`).
2. Statut : **OK** (comportement couvert), **MANQUANT** (aucun test), **PARTIEL** (cas limite non couvert : brique morte, sans load balancer, panne de région, valeur au seuil…) ou **N/A** (rendu, DOM, boucle : pas de test automatisé, vérification manuelle à indiquer).
3. Vérifier que `tests/golden.test.js` reste pertinent : un changement de règle voulu le fait échouer, ce qu'il faut signaler.

## 3. Proposition

Lister les tests macro à ajouter, sans les écrire :

```
- tests/<fichier>.test.js — « <nom du test en français, qui énonce la règle> »
  Mise en place : <niveau / plateau minimal>
  Vérifie : <résultat observable : avail, p95, cost, reasons, champ du tick…>
```

**Attendre l'accord de l'utilisateur avant d'écrire quoi que ce soit.**

## 4. Écriture (après accord)

- Suivre le gabarit des fichiers existants : `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, imports relatifs vers `../src/…`.
- Niveaux et plateaux minimaux écrits à la main, sans mock, un `S` neuf par test.
- Ne jamais modifier `tests/golden/golden.json`.

## 5. Tests et rapport

Relancer `npm test`.

```
## Couverture — <résumé du périmètre>

| Règle | Fichier de test | Statut | Détail |
| --- | --- | --- | --- |
…

Tests ajoutés : <liste>
Tests : <n> passés, <n> échoués.

Verdict : COUVERT | INCOMPLET (<n> manquants)
```
