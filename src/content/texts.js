// Textes de jeu.
export const REGION_NAMES = { eu: 'Paris', us: 'New York', asia: 'Tokyo' };

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
