---
name: prd
description: Use when the user wants a specification (PRD) for a feature of Tenir la charge before any implementation — new brick, incident, card, mission, mode or interface change.
---

# Rédiger un PRD

Ce skill **n'implémente rien** : il produit un document de spécification.

## Démarche

1. **Explorer l'existant** pour remplir soi-même l'état technique, sans questionner l'utilisateur sur ce que le code dit déjà. S'appuyer sur les skills `architecture`, `simulation`, `contenu`, `progression`, `rendu`, et sur `docs/decisions.md`.
2. **Ne poser que les décisions produit** : le but pour le joueur, les valeurs de jeu (capacités, coûts, durées), les modes concernés, ce qui est exclu, l'effet attendu sur les missions existantes.
3. **Rédiger** le PRD dans le format fixe ci-dessous, en français. Proposer de l'enregistrer dans `docs/prd-<sujet>.md`.

## Format

```markdown
# PRD : <titre>

## But
Ce que le joueur pourra faire ou comprendre, et pourquoi.

## État technique
Ce qui existe aujourd'hui : modules, fonctions, données, constantes concernés (chemins réels).

## Comportement
Règles précises, valeurs numériques, déroulé en jeu, cas limites (brique morte, panne de région,
sans load balancer, vieille sauvegarde…).

## Hors périmètre
Ce qui ne sera pas fait.

## Impact par couche
| Couche | Fichiers | Changement |
| --- | --- | --- |
| config | `src/config.js` | … |
| content | `src/content/…` | … |
| rules | `src/rules/…` | … |
| state | `src/state/…` | … |
| render | `src/render/…`, `css/style.css` | … (artefact à valider) |
| input / loop | `src/input/handlers.js`, `src/loop/run.js` | … |

## Critères d'acceptation
- [ ] Vérifiables, formulés du point de vue du joueur ou du résultat de simulation.

## Tests
Tests macro à ajouter (fichier, nom en français) ; effet attendu sur `tests/golden.test.js`.

## Risques et questions ouvertes
Changement de l'instantané, sauvegardes existantes, équilibrage des missions, textes à mettre à jour.
```
