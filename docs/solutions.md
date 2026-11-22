# Tenir la charge : solutions des missions

Mis à jour le 22 novembre 2026, avec la mission 16 « Chacun son couloir » et la brique Cloisonnement.

## Comment lire ce document

Chaque mission donne l'infra trois étoiles la moins chère trouvée, puis des alternatives qui tiennent aussi les trois objectifs. Toutes ont été rejouées avec le moteur de simulation du jeu (`runAll`), donc les chiffres sont ceux que le jeu affichera.

- **Méthode** : toutes les combinaisons de briques, d'options, de réglages et de moments pour jouer les cartes qui tiennent dans le budget, simulées de la moins chère à la plus chère. Les briques et réglages sans effet sur une mission sont écartés (par exemple le pare-feu sans attaque, ou le disjoncteur sans paiements). Pour les missions 17 et 18, à régions, la recherche se limite aux briques qui comptent pour les régions : leur tableau le précise. Pour relancer une recherche : `npm run solve -- <id mission>`.
- **Coût** : coût mensuel affiché à la fin de la partie (autoscaling compris).
- **Ordre des briques** : sans importance dans une rangée, sauf quand un serveur tombe. C'est alors toujours le premier serveur de la rangée Application qui s'éteint.
- **Cartes** : le moment indiqué est la seconde de la partie où il faut la jouer.
- **Réglages** : seuls ceux que la mission autorise sont cités. Sans mention, on garde les valeurs par défaut (aucun nouvel essai, timeout 5 s, pas de délestage).

## Missions 1 à 7

Les sept premières missions laissent environ 15 € de marge, mais les missions 1, 2 et 5 n'ont qu'une seule solution : la marge sert à se tromper d'une brique, pas à changer d'approche.

| Mission | Infra la moins chère | Coût | Dispo · p95 | Alternatives |
| --- | --- | --- | --- | --- |
| 1 · Premier client | 1 serveur moyen, base | 130 € / 140 | 100 % · 88 ms | Aucune : un deuxième serveur dépasse le budget. |
| 2 · Le lancement | LB, 2 serveurs moyens, base | 190 € / 210 | 100 % · 143 ms | Aucune. |
| 3 · Alice perd son panier | LB **sticky**, 2 serveurs moyens, base | 190 € / 230 | 100 % · 138 ms | Partager les sessions : LB tourniquet + Redis (n'importe quelle durée de vie), 225 €, 104 à 108 ms. Ou LB sticky + 3 serveurs moyens, 230 €, 95 ms. |
| 4 · Un serveur tombe | LB, 4 serveurs moyens, base | 270 € / 290 | 100 % · 163 ms | LB « moins chargé » à la place du tourniquet, même résultat. Avec 3 serveurs, la carte Relancer ne suffit pas : le redémarrage de 4 s coûte trop de requêtes. |
| 5 · Gros ou petits ? | LB **moins chargé**, 1 gros + 1 moyen, base | 235 € / 250 | 100 % · 149 ms | Aucune. Avec des tailles mélangées, seul « moins chargé » répartit correctement. |
| 6 · Les soldes | LB moins chargé, CDN, 1 gros + 1 moyen, Redis durée courte, base | 300 € / 315 | 100 % · 133 ms | Redis durée moyenne : 127 ms, fraîcheur toujours ≥ 97 %. La durée longue rate la fraîcheur. |
| 7 · La newsletter de 9 h | LB moins chargé, 1 gros + 1 moyen, Redis + **anti-ruée**, base | 280 € / 295 | 99,6 % · 158 ms | Sans Redis : LB moins chargé, 1 gros + 1 petit, base + 1 réplique, 280 €, 100 % · 145 ms. Le vidage du cache ne peut plus faire mal. |

## Missions 8 à 13

À partir d'ici, une brique ou un réglage précis fait souvent toute la différence : sans lui, la disponibilité s'effondre.

| Mission | Infra la moins chère | Coût | Dispo · p95 | Ce qui compte | Alternatives |
| --- | --- | --- | --- | --- | --- |
| 8 · Black Friday | LB moins chargé, 1 gros + 1 petit, 2 workers, Redis durée moyenne, file, base | 340 € / 360 | 100 % · 159 ms | La file et 2 workers pour vider les écritures du rush. | LB tourniquet, 3 moyens, 2 workers, Redis moyen, file : 350 €. 1 gros + 1 moyen, Redis court : 355 €, 129 ms. |
| 9 · Mon panier est vide | LB, 2 gros, base avec **lectures sensibles sur la primaire**, 2 répliques | 400 € / 425 | 100 % · 153 ms | Le réglage « lectures sensibles » : sans lui, les lectures d'après panier tombent sur des répliques en retard. | Aucune. |
| 10 · Le coup d'envoi | LB moins chargé, CDN, 1 petit serveur, autoscaling 1–4 à 70 %, Redis durée moyenne, base | 319 € / 335 | 100 % · 164 ms | La carte Préchauffer à la **14e seconde**. Sans elle : 86,7 %. | Sans serveur fixe : autoscaling 1–4 seul, Redis durée longue, 333 €, 120 ms. |
| 11 · Le prestataire rame | LB moins chargé, 1 gros + 1 moyen + 1 petit, 1 worker, file, disjoncteur, base | 330 € / 350 | 99,2 % · 185 ms | Le disjoncteur : sans lui, 67,9 %. La file aussi : sans elle, 92,6 %. Le timeout court ne remplace pas le disjoncteur. | LB tourniquet, 4 moyens : 340 €. 1 gros + 2 moyens : 345 €, 175 ms. |
| 12 · Réessayer, c'est gratuit ? | LB moins chargé, serveurs **dans l'ordre petit, moyen, gros**, base, 1 nouvel essai | 260 € / 280 | 99,97 % · 242 ms | Le premier serveur est celui qui tombe : mettre le petit en tête. Gros en tête : 42 %. Sans nouvel essai : 98,3 %. 2 essais passent aussi. | 3 petits + 1 gros : 270 €. 2 moyens + 1 gros : 275 €. |
| 13 · L'attaque | WAF, 1 gros serveur, base, sans LB | 200 € / 265 | 99 % · 145 ms | La carte Pare-feu à la **8e seconde**, puis à la **16e** pour revenir en souple. Sans les cartes : 85,6 %. | LB moins chargé, WAF, 2 moyens + 1 petit : 240 €. LB, WAF, 3 moyens : 255 €, 125 ms. |


## Missions 14 à 20

Les deux missions à infra imposée (19 et 20) se gagnent en retirant presque tout : un seul gros serveur suffit dans les deux cas. Le cloisonnement, disponible à partir de la mission 16, ne sert à rien aux missions 17 à 20 : elles n'ont ni paiements ni recos, leurs solutions ne changent pas.

| Mission | Infra la moins chère | Coût | Dispo · p95 | Ce qui compte | Alternatives |
| --- | --- | --- | --- | --- | --- |
| 14 · Trop de monde à la porte | LB moins chargé, CDN, 2 gros + 1 moyen, Redis durée moyenne, pooler, base | 405 € / 430 | 100 % · 155 ms | Le pooler : sans lui, 97,9 %. | 2 gros + 2 petits : 415 €. Sans CDN : 2 gros + 2 moyens, Redis durée longue, 415 €. LB tourniquet, 3 gros : 420 €, 149 ms. |
| 15 · Les recommandations | LB moins chargé, 1 gros + 1 moyen, Redis durée courte, base, **délestage activé** | 270 € / 290 | 100 % · 144 ms · 73 % de recos | Le délestage : sans lui, 94,4 %. La carte Dégrader n'est pas nécessaire. | Redis durée longue au même prix : 133 ms. |
| 16 · Chacun son couloir | LB moins chargé, 1 gros + 1 petit, **cloisonnement Paiements**, Redis durée courte, base | 300 € / 310 | 98 % · 162 ms | L'API à 750 ms n'ouvre pas le disjoncteur. Le cloisonnement garde les paiements lents dans leur couloir : il sature, le reste du site tient. Un serveur moyen à sa place, pour 295 € : 91,7 %. | 3 moyens + cloisonnement : 310 €. Sans cloisonnement, il faut 2 gros (315 €) : deux étoiles seulement, le budget saute. |
| 19 · Dégraisser la facture | CDN, 1 gros serveur, base | 205 € / 230 | 100 % · 145 ms | Tout retirer de l'infra héritée sauf la base et un gros serveur, puis ajouter le CDN. | Sans CDN : 1 gros + Redis durée courte, 210 €. LB moins chargé, 1 gros + 1 petit : 220 €. LB, 3 moyens : 230 €. |
| 20 · La migration à chaud | 1 gros serveur sans LB, ancienne base + 1 réplique | 265 € / 300 | 99,9 % · 168 ms | Retirer le LB et les 3 serveurs moyens. Jouer Promouvoir **entre 12,5 et 14,5 s**. À 12 s ou à 16 s : 96,5 %. Sans carte : 95,9 %. | Avec Redis : 300 €, 134 à 142 ms. Avec un LB : 285 €. |

### Missions à régions

Pour les missions 17 et 18, chaque brique se place dans une région. La recherche a donc porté sur ce qui compte pour les régions : serveurs, Redis (durée longue), file, base et répliques. Elle s'est arrêtée 40 € au-dessus de la première solution.

| Mission | Infra la moins chère | Coût | Dispo · p95 | Ce qui compte | Alternatives |
| --- | --- | --- | --- | --- | --- |
| 17 · Le monde entier | LB moins chargé. Paris : 2 moyens. New York : 1 moyen, Redis durée longue, base. Tokyo : 1 gros | 350 € / 420 | 99,4 % · 159 ms | Un gros serveur à Tokyo : sans lui, les 25 % d'utilisateurs asiatiques font tout le p95. | LB moins chargé, CDN. Paris : 1 petit + 1 moyen, base. New York : 1 moyen + 1 gros, Redis : 365 €, 100 %. Tout à New York (1 petit + 2 gros, Redis, base) : 370 €. |
| 18 · Panne de région | LB moins chargé. Paris : 1 petit + 1 gros, Redis durée longue, réplique. New York : **base primaire seule** | 315 € / 390 | 99,8 % · 187 ms | Mettre la primaire là où il n'y a rien d'autre : la panne ne fait tomber qu'elle. Jouer Promouvoir **juste après la panne, à 10 s**. Sans la carte, la bascule automatique arrive 5 s trop tard : 96,9 %. | 3 moyens à Paris : 325 €. 1 moyen + 1 gros à Paris : 330 €, 173 ms. |

## Défi du jour et Croissance

Ces deux modes n'ont pas de solution fixe : leurs niveaux sont générés. Le Défi change chaque jour, et chaque tour de Croissance est tiré au hasard avec un trafic qui grossit de 32 % par tour.

- **Défi du jour** : il n'y a pas de budget, le record est l'infra la moins chère qui tient 99 % de dispo et la latence demandée. Les incidents sont tirés parmi ceux des missions (pic, serveur qui tombe, cache vidé, rush d'écritures, API lente, attaque, panne de région), donc les parades ci-dessus s'appliquent telles quelles.
- **Croissance** : le revenu d'un tour vaut 120 € + 0,2 € par req/s. Il tombe à zéro sous 95 % de dispo et n'est plein qu'à 99 %. Une latence au-dessus de l'objectif retire 30 % du revenu. Avec 300 € au départ, il vaut mieux ajouter des briques un tour avant d'en avoir besoin que rater un tour.

Ce que les 20 missions montrent et qui vaut aussi ici :

- Avec des serveurs de tailles différentes, prendre le LB « moins chargé ».
- Sans objectif de fraîcheur, la durée de vie longue du cache donne la meilleure latence au même prix.
- Le CDN est la brique la plus rentable dès qu'il y a du statique.
- Le serveur qui tombe est toujours le premier de la rangée : y mettre le plus petit.
- Paiements lents : disjoncteur et file. Erreurs de paiement passagères : 1 nouvel essai.
- Une classe qui rame sans que le disjoncteur s'ouvre (paiements lents mais pas en panne) : un cloisonnement pour elle seule.
