// Textes de jeu.
export const REGION_NAMES = { eu: 'Paris', us: 'New York', asia: 'Tokyo' };
export const REGION_SHORT = { eu: 'PAR', us: 'NYC', asia: 'TYO' };

export const EVENT_NAMES = {
  crash: 'un serveur tombe', cacheFlush: 'Redis redémarre', apiSlow: 'l’API de paiement rame', attack: 'un botnet attaque',
  spike: 'pic de trafic', writeRush: 'ruée sur les paniers', regionDown: 'la région de la base tombe',
};

export const CARDS = {
  addServer: { name: 'Serveur en renfort', desc: 'Un serveur moyen démarre en 5 s (+40 €).' },
  restart: { name: 'Relancer', desc: 'Les serveurs tombés redémarrent en 4 s.' },
  prewarm: { name: 'Préchauffer', desc: 'L’autoscaling lance 3 instances tout de suite (prêtes en 6 s).' },
  degrade: { name: 'Mode dégradé', desc: 'Coupe les recommandations jusqu’à la fin.' },
  waf: { name: 'Basculer le WAF', desc: 'Passe le pare-feu de souple à strict, ou l’inverse.' },
  promote: { name: 'Promouvoir la réplique', desc: 'La première réplique devient la primaire. Les écritures pas encore répliquées sont perdues.' },
};

// Causes d’échec affichées dans le bilan.
export const REASONS = {
  noServer: 'Aucun serveur pour répondre',
  noLb: 'Sans load balancer, un seul serveur reçoit tout le trafic',
  serverSat: 'Serveurs saturés',
  bulkheadSat: 'Cloisonnement saturé',
  crash: 'Le serveur tombé n’avait pas de relève',
  session: 'Sessions perdues : l’utilisateur arrive sur un serveur qui ne le connaît pas',
  noDb: 'Aucune base de données',
  dbDown: 'Plus de base primaire pour écrire',
  dbSat: 'Base de données saturée',
  conn: 'Trop de connexions ouvertes sur la base',
  stale: 'Lecture d’une donnée pas encore répliquée (« mon panier est vide »)',
  apiDown: 'API de paiement en panne',
  apiTimeout: 'Paiements expirés (timeout)',
  blocked: 'Vrais clients bloqués par le pare-feu',
  backlog: 'Tâches jamais traitées à la fin (workers manquants ou trop lents)',
  queueLost: 'File de messages perdue avec sa région',
  objDown: 'Stockage objet indisponible',
  promoLoss: 'Écritures perdues pendant la bascule',
};
