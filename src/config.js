// Tous les nombres qui règlent le jeu. Unités : secondes (s), millisecondes (ms), requêtes/s (req/s), euros (€).

// ---- Simulation
export const DT = 0.25; // pas de simulation (s)
export const BASE_LAT = 20; // latence réseau minimale d'un client (ms)
export const DIST = { eu: { eu: 0, us: 80, asia: 120 }, us: { eu: 80, us: 0, asia: 100 }, asia: { eu: 120, us: 100, asia: 0 } }; // ms entre régions
export const SIZES = {
  s: { cap: 200, cost: 25, conns: 15, label: 'Petit' },
  m: { cap: 400, cost: 40, conns: 30, label: 'Moyen' },
  l: { cap: 1000, cost: 85, conns: 70, label: 'Gros' },
};
export const TTL = { court: { hit: 0.6, stale: 0 }, moyen: { hit: 0.8, stale: 0.01 }, long: { hit: 0.93, stale: 0.08 } };

// ---- Latences : base × (1 + LAT_SURGE × ρ³)
export const SRV_LAT_MIN = 30; // ms
export const DB_LAT_MIN = 15; // ms
export const LAT_SURGE = 3;
export const LB_LAT = 2; // ms ajoutées par le load balancer
export const RETRY_LAT = 300; // ms ajoutées par nouvel essai
export const CDN_LAT = 15; // ms ajoutées à un fichier statique servi par le CDN
export const CACHE_LAT = 2; // ms d'une lecture servie par le cache
export const QUEUE_LAT = 5; // ms pour déposer une écriture en file
export const OBJSTORE_LAT = 30; // ms d'un upload vers le stockage objet
export const DIRECT_UPLOAD_LAT = 2.5; // sans stockage objet, un upload prend 2,5 × la latence de base

// ---- Coût en capacité serveur d'une requête, par classe
export const STATIC_COST = 0.5;
export const UPLOAD_COST = 6; // sans stockage objet : le serveur reçoit le fichier
export const SIGNED_UPLOAD_COST = 0.5; // avec stockage objet : le serveur ne fait que signer
export const PAY_WAIT_DIVISOR = 100; // coût d'un paiement : 1 + attente (ms) / PAY_WAIT_DIVISOR

// ---- Load balancer
export const STICKY_CAPACITY = 0.85; // sticky : −15 % de capacité

// ---- API de paiement et disjoncteur
export const API_DEFAULT_LAT = 100; // ms
export const API_BAD_LAT = 800; // ms au-delà desquelles l'API « va mal »
export const API_BAD_ERR = 0.25; // taux d'erreur au-delà duquel l'API « va mal »
export const BREAKER_OPEN_AFTER = 0.5; // s d'API malade avant ouverture
export const BREAKER_CLOSE_AFTER = 1; // s d'API saine avant fermeture
export const TIMEOUT_SHORT = 800; // ms
export const TIMEOUT_LONG = 5000; // ms

// ---- Cache
export const CACHE_WARMUP = 8; // s pour remplir un cache vide
export const STAMPEDE_LOAD = 2.2; // charge base multipliée pendant la ruée, sans anti-ruée

// ---- Pare-feu
export const WAF_STRICT_BLOCKED = 0.03; // part des vrais clients bloqués en strict
export const WAF_STRICT_BOTS_PASS = 0.02;
export const WAF_SOFT_BOTS_PASS = 0.3;

// ---- Sessions
export const SESSION_LOSS_WINDOW = 3; // s pendant lesquelles un crash fait perdre les sessions sticky

// ---- Délestage
export const SHED_THRESHOLD = 0.9; // charge au-delà de laquelle les recos sont délestées

// ---- Base de données
export const PRIMARY_CAP = 1000; // req/s
export const PRIMARY_MAX_CONN = 150;
export const LEGACY_CAP = 600; // req/s
export const LEGACY_MAX_CONN = 100;
export const REPLICA_CAP = 1000; // lectures/s
export const POOLER_MAX_CONN = 60;
export const FAILOVER_DELAY = 5; // s avant promotion automatique d'une réplique
export const PROMOTION_DURATION = 3; // s d'écritures perdues pendant une bascule manuelle

// ---- Retard de réplication : lag = LAG_MIN + LAG_SLOPE × max(0, ρ réplique − LAG_REPLICA_THRESHOLD) + écritures / LAG_WRITE_DIVISOR
export const LAG_MIN = 0.3; // s
export const LAG_SLOPE = 2.5;
export const LAG_REPLICA_THRESHOLD = 0.6;
export const LAG_WRITE_DIVISOR = 1500;
export const STALE_MAX = 0.95; // probabilité maximale de lecture périmée
export const STALE_LAG_DIVISOR = 1.2; // pStale = lag / STALE_LAG_DIVISOR

// ---- Workers et tâches de fond
export const WORKER_RATE = 250; // tâches/s par worker
export const WORKER_CONNS = 15; // connexions ouvertes par worker
export const BACKLOG_TOLERANCE = 2; // s de capacité des workers tolérées en file à la fin

// ---- Autoscaling
export const AUTO_INSTANCE_CAP = 400; // req/s (serveur moyen)
export const AUTO_INSTANCE_CONNS = 30;
export const AUTO_INSTANCE_COST = 40; // € par instance en moyenne
export const AUTO_BOOT = 6; // s de démarrage d'une instance
export const AUTO_UP_AFTER = 1; // s de besoin avant d'ajouter des instances
export const AUTO_DOWN_UTIL = 0.5; // utilisation sous laquelle on retire une instance
export const AUTO_DOWN_AFTER = 3; // s sous ce seuil avant de retirer une instance
export const AUTO_DOWN_RESET = 1; // compteur conservé après un retrait (le suivant arrive 2 s plus tard)

// ---- Cartes
export const ADD_SERVER_BOOT = 5; // s
export const ADD_SERVER_COST = 40; // €
export const RESTART_BOOT = 4; // s
export const PREWARM_COUNT = 3; // instances
export const PREWARM_HOLD = 15; // s sans réduction après un préchauffage

// ---- Croissance
export const CAMP_START_CASH = 300; // €
export const CAMP_BASE_REVENUE = 120; // € par tour
export const CAMP_REVENUE_PER_RPS = 0.2; // € par req/s
export const CAMP_AVAIL_FLOOR = 95; // % sous lequel le revenu est nul et la partie perdue
export const CAMP_AVAIL_SPAN = 4; // points de % pour passer de 0 au revenu plein
export const CAMP_SLOW_PENALTY = 0.7; // revenu conservé si la latence p95 dépasse l'objectif
export const CAMP_RPS_START = 300; // req/s au tour 1
export const CAMP_RPS_GROWTH = 1.32; // facteur de trafic d'un tour au suivant
export const REGIONS_CHANCE_ALL = 0.25; // probabilité de multi-régions dans le défi du jour
export const REGIONS_CHANCE_LATE = 0.35; // probabilité de multi-régions à partir de REGIONS_FROM_ROUND
export const REGIONS_FROM_ROUND = 9;
export const GEN_DURATION = 24; // s d'un tour généré
export const GEN_EVENT_FROM = 6; // s, plus tôt qu'un incident puisse survenir
export const GEN_EVENT_TO = 14; // s, plus tard qu'un incident puisse survenir
export const GEN_INCIDENT_LENGTH = 7; // s d'API lente ou d'attaque de bots
export const GEN_API_SLOW_LAT = 3000; // ms de l'API de paiement pendant qu'elle rame
export const GEN_ATTACK_MULT = 3; // trafic de bots multiplié pendant une attaque
export const GEN_SPIKE_LENGTH = 6; // s de pic de trafic
export const GEN_SPIKE_K = 1.8; // trafic multiplié pendant le pic
export const GEN_RUSH_LENGTH = 5; // s de ruée sur les paniers
export const GEN_RUSH_READS_KEPT = 0.3; // part des lectures conservée pendant la ruée
export const GEN_RUSH_READS_TO_WRITE = 0.7; // part des lectures devenue écritures pendant la ruée

// ---- Affichage lié aux règles
export const SPEED_FAST = 2; // vitesse de lecture d'un run au lancement (×2), ×1 sinon
export const QUEUE_GAUGE_MAX = 4000; // tâches en file pour une jauge pleine
export const POOLER_GAUGE_MAX = 150; // connexions pour une jauge pleine quand il n'y a pas de base
export const DIAG_MIN_SHARE = 0.0005; // part minimale d'une cause d'échec pour l'afficher
