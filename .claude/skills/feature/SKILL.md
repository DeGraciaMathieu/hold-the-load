---
name: feature
description: Use when the user asks to implement a new feature or change a behaviour of Tenir la charge end to end — from understanding the request to tests and documentation.
user_invocable: true
---

# Implémenter une fonctionnalité

Demande : $ARGUMENTS

## 1. Comprendre

1. Reformuler la demande en une ou deux phrases, en termes de jeu (ce que le joueur verra ou pourra faire).
2. Invoquer le skill `architecture`, puis le ou les skills de domaine concernés : `simulation`, `contenu`, `progression`, `rendu`.
3. Poser les questions de clarification **avant de coder**, seulement celles que le code ne tranche pas :
   - **valeurs numériques** : capacités, durées, coûts, seuils, probabilités (elles iront dans `src/config.js`) ;
   - **interactions avec l'existant** : quelles briques, quels incidents, quels modes (Missions, Croissance, Défi) sont touchés ? Les missions existantes doivent-elles changer ?
   - **cas limites** : brique morte, panne de région, sans load balancer, plateau vide, vieille sauvegarde sans le nouveau champ ;
   - **changement de règle voulu ?** Si oui, l'instantané `tests/golden.test.js` va casser : convenir avec l'utilisateur de la façon de le mettre à jour (skill `testing`).
4. Si la demande touche au visuel : préparer l'artefact (maquette ou avant/après, extraits de code) et **attendre la validation** avant de coder.
5. Implémenter seulement ce qui est demandé.

## 2. Implémenter

- Respecter l'ordre des couches et la liste « À ne jamais faire » de `CLAUDE.md`.
- Nombres dans `src/config.js`, données dans `src/content/`, calculs purs dans `src/rules/`, effets dans `render/`, `input/`, `loop/`.
- Pas de nouvelle exception au contrat de pureté.
- Suivre le style local : code compact, identifiants anglais courts, commentaires et textes en français.

## 3. Tester

1. Écrire ou compléter les tests macro dans le fichier indiqué par le skill `testing` (nom de test = règle en français).
2. Lancer `npm test` et corriger jusqu'au vert.
3. Si `golden.test.js` échoue : régression ou changement voulu ? Ne pas toucher `golden.json` sans l'accord de l'utilisateur.
4. Si le rendu a changé : vérifier dans le navigateur (`npm run dev`), sur téléphone et sur grand écran.

## 4. Documenter

Si le périmètre a bougé, mettre à jour dans le même changement :

- les textes de jeu qui citent les valeurs touchées : `desc` et `help` (`catalog.js`), `CARDS` (`texts.js`), `story` (`levels.js`), messages de `useCard`, textes en dur de `render/panels.js` et `render/dialogs.js`, aide clavier de `index.html` ;
- `README.md` (commandes, organisation) ;
- `CLAUDE.md` et les skills `.claude/skills/*` si un module, une convention ou une procédure a changé ;
- `docs/decisions.md` si une question ouverte a été tranchée.

## 5. Résumer

- Fichiers modifiés, avec une ligne par fichier.
- Tests ajoutés (nom et fichier).
- Résultat de `npm test` (nombre de tests, vert ou rouge).
- Ce qui reste ouvert ou n'a pas été fait.
