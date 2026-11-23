import { SIZES } from '../config.js';

// Les briques posables et les rangées du plateau. Textes affichés : { en, fr } (voir texts.js).
export const ROW_DEF = [
  { key: 'edge', label: { en: 'EDGE', fr: 'BORD' }, slots: 3 },
  { key: 'app', label: { en: 'APPLICATION', fr: 'APPLICATION' }, slots: 5 },
  { key: 'svc', label: { en: 'SERVICES', fr: 'SERVICES' }, slots: 4 },
  { key: 'data', label: { en: 'DATA', fr: 'DONNÉES' }, slots: 4 },
];
export const CATALOG = {
  lb: { row: 'edge', name: 'Load balancer', short: 'LB', unique: true, cost: () => 20, opts: { algo: 'rr' },
    desc: { en: 'Spreads traffic across live servers and sidelines the ones that go down. With regions, sends everyone to the nearest one.',
      fr: 'Répartit le trafic entre les serveurs vivants et écarte ceux qui tombent. Avec des régions, envoie chacun vers la plus proche.' } },
  cdn: { row: 'edge', name: 'CDN', short: 'CDN', unique: true, cost: () => 30,
    desc: { en: 'Serves static files (images, JS, CSS) from the edge, all over the world, without touching your servers.',
      fr: 'Sert les fichiers statiques (images, JS, CSS) depuis le bord, partout dans le monde, sans toucher tes serveurs.' } },
  waf: { row: 'edge', name: { en: 'Web app firewall', fr: 'Pare-feu applicatif' }, short: 'WAF', unique: true, cost: () => 25, opts: { mode: 'souple' },
    desc: { en: 'Filters bots. Lenient: lets 30 % of bots through, no customer blocked. Strict: 2 % of bots get through, but 3 % of real customers are blocked.',
      fr: 'Filtre les bots. Souple : laisse passer 30 % des bots, aucun client bloqué. Strict : 2 % des bots passent, mais 3 % des vrais clients sont bloqués.' } },
  server: { row: 'app', name: { en: 'Server', fr: 'Serveur' }, short: 'SRV', cost: o => SIZES[o.size].cost, opts: { size: 'm' },
    desc: { en: 'Runs the app and keeps sessions in its memory. Small 200 req/s, medium 400, large 1,000 (cheaper per request, but an outage hurts more).',
      fr: 'Fait tourner l’appli et garde les sessions dans sa mémoire. Petit 200 req/s, moyen 400, gros 1 000 (moins cher à la requête, mais une panne fait plus mal).' } },
  autoscale: { row: 'app', name: 'Autoscaling', short: 'AUTO', unique: true, cost: () => 10, opts: { min: 1, max: 6, seuil: 70 },
    desc: { en: 'A group of medium servers that add themselves when load passes the threshold. Pay as you go (40 € per instance on average), but each instance takes 6 s to boot. Needs a load balancer.',
      fr: 'Groupe de serveurs moyens qui s’ajoutent seuls quand la charge dépasse le seuil. Payé à l’usage (40 € par instance en moyenne), mais chaque instance met 6 s à démarrer. Nécessite un load balancer.' } },
  worker: { row: 'app', name: 'Worker', short: 'WRK', cost: () => 30,
    desc: { en: 'Works through background tasks: queued writes, upload processing, deferred payments. 250 tasks/s each.',
      fr: 'Dépile les tâches de fond : écritures en file, traitement des uploads, paiements différés. 250 tâches/s chacun.' } },
  bulkhead: { row: 'app', name: { en: 'Bulkhead', fr: 'Cloisonnement' }, short: { en: 'BULK', fr: 'CLOIS' }, cost: () => 45, opts: { cls: 'pay' },
    desc: { en: 'A server reserved for one class of requests: 400 req/s just for it. If that class slows down or blows up, the rest of the site keeps responding. Needs a load balancer.',
      fr: 'Un serveur réservé à une classe de requêtes : 400 req/s rien que pour elle. Si elle rame ou explose, le reste du site continue de répondre. Il faut un load balancer.' } },
  cache: { row: 'svc', name: { en: 'Redis cache', fr: 'Cache Redis' }, short: 'REDIS', unique: true, cost: o => 35 + (o.antiRuee ? 10 : 0), opts: { ttl: 'moyen', antiRuee: false },
    desc: { en: 'Serves part of the reads from memory and stores sessions in a shared way. The time to live trades hit rate against freshness.',
      fr: 'Sert une partie des lectures depuis la mémoire et stocke les sessions de façon partagée. La durée de vie arbitre entre taux de succès et fraîcheur.' } },
  queue: { row: 'svc', name: { en: 'Message queue', fr: 'File de messages' }, short: { en: 'QUEUE', fr: 'FILE' }, unique: true, cost: () => 25,
    desc: { en: 'Acknowledges writes right away. Workers then pass them to the database when it has room to breathe.',
      fr: 'Accuse réception des écritures tout de suite. Les workers les passent ensuite à la base quand elle respire.' } },
  pooler: { row: 'svc', name: { en: 'Connection pooler', fr: 'Pooler de connexions' }, short: 'POOL', unique: true, cost: () => 20,
    desc: { en: 'Pools database connections: 60 connections at most, however many servers there are.',
      fr: 'Mutualise les connexions à la base : 60 connexions au plus, quel que soit le nombre de serveurs.' } },
  breaker: { row: 'svc', name: { en: 'Circuit breaker', fr: 'Disjoncteur' }, short: { en: 'BRKR', fr: 'DISJ' }, unique: true, cost: () => 15,
    desc: { en: 'Cuts calls to the payment API when it’s in trouble: servers stop waiting. With a queue and workers, payments are deferred instead of failing.',
      fr: 'Coupe les appels à l’API de paiement quand elle va mal : les serveurs n’attendent plus. Avec une file et des workers, les paiements sont différés au lieu d’échouer.' } },
  db: { row: 'data', name: { en: 'Primary database', fr: 'Base primaire' }, short: 'DB', unique: true, cost: o => (o.legacy ? 120 : 90), opts: { sensible: false },
    desc: { en: '1,000 requests/s, 150 connections. The only one that accepts writes.',
      fr: '1 000 requêtes/s, 150 connexions. La seule à accepter les écritures.' } },
  replica: { row: 'data', name: { en: 'Replica', fr: 'Réplique' }, short: 'REP', cost: () => 60,
    desc: { en: 'Read-only copy, 1,000 reads/s. It always lags a little: a read right after a write may find stale data there. If the primary dies, it is promoted after 5 s.',
      fr: 'Copie en lecture seule, 1 000 lectures/s. Elle a toujours un peu de retard : une lecture juste après une écriture peut y trouver une donnée périmée. Si la primaire meurt, elle est promue au bout de 5 s.' } },
  objstore: { row: 'data', name: { en: 'Object storage', fr: 'Stockage objet' }, short: 'S3', unique: true, cost: () => 20,
    desc: { en: 'Receives uploads directly: servers only sign them. File processing goes to the background for the workers.',
      fr: 'Reçoit les uploads directement : les serveurs ne font plus que signer. Le traitement des fichiers part en tâche de fond pour les workers.' } },
};

// Classes de requêtes, dans l'ordre où le simulateur les traite.
export const CLASSES = ['static', 'read', 'write', 'upload', 'pay', 'reco'];

// Briques communes à toutes les régions.
export const GLOBAL = ['lb', 'cdn', 'waf'];

const NO_YES = [[false, { en: 'No', fr: 'Non' }], [true, { en: 'Yes', fr: 'Oui' }]];

// Options réglables par brique et réglages de l’appli.
export const OPT_DEFS = {
  lb: [{ k: 'algo', label: { en: 'Balancing', fr: 'Répartition' }, choices: [['rr', { en: 'Round robin', fr: 'Tourniquet' }], ['sticky', 'Sticky'], ['least', { en: 'Least loaded', fr: 'Moins chargé' }]],
    help: {
      rr: { en: 'Each server gets the same share, whatever its size.', fr: 'Chaque serveur reçoit la même part, quelle que soit sa taille.' },
      sticky: { en: 'A user stays on the same server: sessions work without Redis, but load is spread less evenly (−15 % capacity).', fr: 'Un utilisateur reste sur le même serveur : les sessions marchent sans Redis, mais la charge est moins bien répartie (−15 % de capacité).' },
      least: { en: 'Sends to the least loaded server: essential if sizes are mixed.', fr: 'Envoie vers le serveur le moins chargé : indispensable si les tailles sont mélangées.' } } }],
  waf: [{ k: 'mode', label: { en: 'Filtering', fr: 'Filtrage' }, choices: [['souple', { en: 'Lenient', fr: 'Souple' }], ['strict', 'Strict']] }],
  server: [{ k: 'size', label: { en: 'Size', fr: 'Taille' }, choices: [['s', { en: 'Small · 25 €', fr: 'Petit · 25 €' }], ['m', { en: 'Medium · 40 €', fr: 'Moyen · 40 €' }], ['l', { en: 'Large · 85 €', fr: 'Gros · 85 €' }]] }],
  bulkhead: [{ k: 'cls', label: { en: 'Reserved class', fr: 'Classe réservée' }, choices: [['pay', { en: 'Payments', fr: 'Paiements' }], ['reco', { en: 'Recos', fr: 'Recos' }]] }],
  autoscale: [
    { k: 'min', label: { en: 'Minimum instances', fr: 'Instances minimum' }, choices: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] },
    { k: 'max', label: { en: 'Maximum instances', fr: 'Instances maximum' }, choices: [[4, '4'], [6, '6'], [8, '8']] },
    { k: 'seuil', label: { en: 'Trigger threshold', fr: 'Seuil de déclenchement' }, choices: [[50, '50 %'], [70, '70 %'], [85, '85 %']] },
  ],
  cache: [
    { k: 'ttl', label: { en: 'Time to live', fr: 'Durée de vie' }, choices: [['court', { en: 'Short', fr: 'Courte' }], ['moyen', { en: 'Medium', fr: 'Moyenne' }], ['long', { en: 'Long', fr: 'Longue' }]],
      help: {
        court: { en: '60 % of reads served, always fresh.', fr: '60 % des lectures servies, toujours fraîches.' },
        moyen: { en: '80 % served, 1 % stale.', fr: '80 % servies, 1 % périmées.' },
        long: { en: '93 % served, 8 % stale.', fr: '93 % servies, 8 % périmées.' } } },
    { k: 'antiRuee', label: { en: 'Stampede protection (+10 €)', fr: 'Protection anti-ruée (+10 €)' }, choices: NO_YES,
      help: {
        false: { en: 'Empty cache: every miss goes to the database, often several times for the same data.', fr: 'Cache vide : chaque requête manquée part en base, souvent plusieurs fois pour la même donnée.' },
        true: { en: 'Empty cache: a single request per piece of data goes to the database, the others wait.', fr: 'Cache vide : une seule requête par donnée part en base, les autres attendent.' } } },
  ],
  db: [{ k: 'sensible', label: { en: 'Sensitive reads', fr: 'Lectures sensibles' }, choices: [[false, { en: 'Anywhere', fr: 'Partout' }], [true, { en: 'On the primary', fr: 'Sur la primaire' }]],
    help: {
      false: { en: 'Reads right after a write may land on a lagging replica.', fr: 'Les lectures juste après une écriture peuvent tomber sur une réplique en retard.' },
      true: { en: 'Reads right after a write go to the primary: always fresh, but more load.', fr: 'Les lectures juste après une écriture vont sur la primaire : toujours fraîches, mais plus de charge.' } } }],
};
export const SET_DEFS = {
  retries: { label: { en: 'Retries', fr: 'Nouveaux essais' }, choices: [[0, { en: 'None', fr: 'Aucun' }], [1, '1'], [2, '2']], help: {
    0: { en: 'A failed request is lost.', fr: 'Une requête qui échoue est perdue.' },
    1: { en: 'One retry (+300 ms). Saves transient errors, but on saturated servers each retry joins the queue and saturation snowballs.', fr: 'Un nouvel essai (+300 ms). Sauve les erreurs passagères, mais sur des serveurs saturés chaque essai s’ajoute à la file et la saturation s’emballe.' },
    2: { en: 'Two retries (+300 ms each). Even better against transient errors, even more dangerous under saturation.', fr: 'Deux nouveaux essais (+300 ms chacun). Encore plus efficace contre les erreurs passagères, encore plus dangereux en saturation.' } } },
  timeout: { label: { en: 'External call timeout', fr: 'Timeout des appels externes' }, choices: [['court', { en: '0.8 s', fr: '0,8 s' }], ['long', '5 s']], help: {
    court: { en: 'Give up fast: a server never waits more than 0.8 s.', fr: 'On abandonne vite : un serveur n’attend jamais plus de 0,8 s.' },
    long: { en: 'Wait up to 5 s: no slow payment fails, but servers stay blocked meanwhile.', fr: 'On attend jusqu’à 5 s : aucun paiement lent n’échoue, mais les serveurs restent bloqués pendant ce temps.' } } },
  shed: { label: { en: 'Reco shedding', fr: 'Délestage des recos' }, choices: NO_YES, help: {
    false: { en: 'When things saturate, all requests fail alike.', fr: 'Quand ça sature, toutes les requêtes échouent pareil.' },
    true: { en: 'Above 90 % load, recommendations are rejected first.', fr: 'Au-delà de 90 % de charge, les recommandations sont rejetées en premier.' } } },
};
