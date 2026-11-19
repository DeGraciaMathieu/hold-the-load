import { SIZES } from '../config.js';

// Les briques posables et les rangées du plateau.
export const ROW_DEF = [
  { key: 'edge', label: 'BORD', slots: 3 },
  { key: 'app', label: 'APPLICATION', slots: 5 },
  { key: 'svc', label: 'SERVICES', slots: 4 },
  { key: 'data', label: 'DONNÉES', slots: 4 },
];
export const CATALOG = {
  lb: { row: 'edge', name: 'Load balancer', short: 'LB', unique: true, cost: () => 20, opts: { algo: 'rr' },
    desc: 'Répartit le trafic entre les serveurs vivants et écarte ceux qui tombent. Avec des régions, envoie chacun vers la plus proche.' },
  cdn: { row: 'edge', name: 'CDN', short: 'CDN', unique: true, cost: () => 30,
    desc: 'Sert les fichiers statiques (images, JS, CSS) depuis le bord, partout dans le monde, sans toucher tes serveurs.' },
  waf: { row: 'edge', name: 'Pare-feu applicatif', short: 'WAF', unique: true, cost: () => 25, opts: { mode: 'souple' },
    desc: 'Filtre les bots. Souple : laisse passer 30 % des bots, aucun client bloqué. Strict : 2 % des bots passent, mais 3 % des vrais clients sont bloqués.' },
  server: { row: 'app', name: 'Serveur', short: 'SRV', cost: o => SIZES[o.size].cost, opts: { size: 'm' },
    desc: 'Fait tourner l’appli et garde les sessions dans sa mémoire. Petit 200 req/s, moyen 400, gros 1 000 (moins cher à la requête, mais une panne fait plus mal).' },
  autoscale: { row: 'app', name: 'Autoscaling', short: 'AUTO', unique: true, cost: () => 10, opts: { min: 1, max: 6, seuil: 70 },
    desc: 'Groupe de serveurs moyens qui s’ajoutent seuls quand la charge dépasse le seuil. Payé à l’usage (40 € par instance en moyenne), mais chaque instance met 6 s à démarrer. Nécessite un load balancer.' },
  worker: { row: 'app', name: 'Worker', short: 'WRK', cost: () => 30,
    desc: 'Dépile les tâches de fond : écritures en file, traitement des uploads, paiements différés. 250 tâches/s chacun.' },
  cache: { row: 'svc', name: 'Cache Redis', short: 'REDIS', unique: true, cost: o => 35 + (o.antiRuee ? 10 : 0), opts: { ttl: 'moyen', antiRuee: false },
    desc: 'Sert une partie des lectures depuis la mémoire et stocke les sessions de façon partagée. La durée de vie arbitre entre taux de succès et fraîcheur.' },
  queue: { row: 'svc', name: 'File de messages', short: 'FILE', unique: true, cost: () => 25,
    desc: 'Accuse réception des écritures tout de suite. Les workers les passent ensuite à la base quand elle respire.' },
  pooler: { row: 'svc', name: 'Pooler de connexions', short: 'POOL', unique: true, cost: () => 20,
    desc: 'Mutualise les connexions à la base : 60 connexions au plus, quel que soit le nombre de serveurs.' },
  breaker: { row: 'svc', name: 'Disjoncteur', short: 'DISJ', unique: true, cost: () => 15,
    desc: 'Coupe les appels à l’API de paiement quand elle va mal : les serveurs n’attendent plus. Avec une file et des workers, les paiements sont différés au lieu d’échouer.' },
  db: { row: 'data', name: 'Base primaire', short: 'DB', unique: true, cost: o => (o.legacy ? 120 : 90), opts: { sensible: false },
    desc: '1 000 requêtes/s, 150 connexions. La seule à accepter les écritures.' },
  replica: { row: 'data', name: 'Réplique', short: 'REP', cost: () => 60,
    desc: 'Copie en lecture seule, 1 000 lectures/s. Elle a toujours un peu de retard : une lecture juste après une écriture peut y trouver une donnée périmée. Si la primaire meurt, elle est promue au bout de 5 s.' },
  objstore: { row: 'data', name: 'Stockage objet', short: 'S3', unique: true, cost: () => 20,
    desc: 'Reçoit les uploads directement : les serveurs ne font plus que signer. Le traitement des fichiers part en tâche de fond pour les workers.' },
};

// Classes de requêtes, dans l'ordre où le simulateur les traite.
export const CLASSES = ['static', 'read', 'write', 'upload', 'pay', 'reco'];

// Briques communes à toutes les régions.
export const GLOBAL = ['lb', 'cdn', 'waf'];

// Options réglables par brique et réglages de l’appli.
export const OPT_DEFS = {
  lb: [{ k: 'algo', label: 'Répartition', choices: [['rr', 'Tourniquet'], ['sticky', 'Sticky'], ['least', 'Moins chargé']],
    help: { rr: 'Chaque serveur reçoit la même part, quelle que soit sa taille.', sticky: 'Un utilisateur reste sur le même serveur : les sessions marchent sans Redis, mais la charge est moins bien répartie (−15 % de capacité).', least: 'Envoie vers le serveur le moins chargé : indispensable si les tailles sont mélangées.' } }],
  waf: [{ k: 'mode', label: 'Filtrage', choices: [['souple', 'Souple'], ['strict', 'Strict']] }],
  server: [{ k: 'size', label: 'Taille', choices: [['s', 'Petit · 25 €'], ['m', 'Moyen · 40 €'], ['l', 'Gros · 85 €']] }],
  autoscale: [
    { k: 'min', label: 'Instances minimum', choices: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] },
    { k: 'max', label: 'Instances maximum', choices: [[4, '4'], [6, '6'], [8, '8']] },
    { k: 'seuil', label: 'Seuil de déclenchement', choices: [[50, '50 %'], [70, '70 %'], [85, '85 %']] },
  ],
  cache: [
    { k: 'ttl', label: 'Durée de vie', choices: [['court', 'Courte'], ['moyen', 'Moyenne'], ['long', 'Longue']],
      help: { court: '60 % des lectures servies, toujours fraîches.', moyen: '80 % servies, 1 % périmées.', long: '93 % servies, 8 % périmées.' } },
    { k: 'antiRuee', label: 'Protection anti-ruée (+10 €)', choices: [[false, 'Non'], [true, 'Oui']],
      help: { false: 'Cache vide : chaque requête manquée part en base, souvent plusieurs fois pour la même donnée.', true: 'Cache vide : une seule requête par donnée part en base, les autres attendent.' } },
  ],
  db: [{ k: 'sensible', label: 'Lectures sensibles', choices: [[false, 'Partout'], [true, 'Sur la primaire']],
    help: { false: 'Les lectures juste après une écriture peuvent tomber sur une réplique en retard.', true: 'Les lectures juste après une écriture vont sur la primaire : toujours fraîches, mais plus de charge.' } }],
};
export const SET_DEFS = {
  retries: { label: 'Nouveaux essais', choices: [[0, 'Aucun'], [1, '1'], [2, '2']], help: { 0: 'Une requête qui échoue est perdue.', 1: 'Un nouvel essai (+300 ms). Sauve les erreurs passagères, mais sur des serveurs saturés chaque essai s’ajoute à la file et la saturation s’emballe.', 2: 'Deux nouveaux essais (+300 ms chacun). Encore plus efficace contre les erreurs passagères, encore plus dangereux en saturation.' } },
  timeout: { label: 'Timeout des appels externes', choices: [['court', '0,8 s'], ['long', '5 s']], help: { court: 'On abandonne vite : un serveur n’attend jamais plus de 0,8 s.', long: 'On attend jusqu’à 5 s : aucun paiement lent n’échoue, mais les serveurs restent bloqués pendant ce temps.' } },
  shed: { label: 'Délestage des recos', choices: [[false, 'Non'], [true, 'Oui']], help: { false: 'Quand ça sature, toutes les requêtes échouent pareil.', true: 'Au-delà de 90 % de charge, les recommandations sont rejetées en premier.' } },
};
