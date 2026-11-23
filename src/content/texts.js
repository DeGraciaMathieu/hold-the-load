// Textes de jeu, dans les deux langues : { en, fr }. Un texte à paramètres est une fonction de p.
export const LANGS = ['en', 'fr'];

export const REGION_NAMES = { eu: 'Paris', us: 'New York', asia: 'Tokyo' };
export const REGION_SHORT = { eu: 'PAR', us: 'NYC', asia: 'TYO' };

export const EVENT_NAMES = {
  crash: { en: 'a server goes down', fr: 'un serveur tombe' },
  cacheFlush: { en: 'Redis restarts', fr: 'Redis redémarre' },
  apiSlow: { en: 'the payment API slows down', fr: 'l’API de paiement rame' },
  attack: { en: 'a botnet attacks', fr: 'un botnet attaque' },
  spike: { en: 'traffic spike', fr: 'pic de trafic' },
  writeRush: { en: 'checkout rush', fr: 'ruée sur les paniers' },
  regionDown: { en: 'the database region goes down', fr: 'la région de la base tombe' },
};

export const CARDS = {
  addServer: { name: { en: 'Backup server', fr: 'Serveur en renfort' }, desc: { en: 'A medium server boots in 5 s (+40 €).', fr: 'Un serveur moyen démarre en 5 s (+40 €).' } },
  restart: { name: { en: 'Restart', fr: 'Relancer' }, desc: { en: 'Downed servers reboot in 4 s.', fr: 'Les serveurs tombés redémarrent en 4 s.' } },
  prewarm: { name: { en: 'Prewarm', fr: 'Préchauffer' }, desc: { en: 'Autoscaling launches 3 instances right away (ready in 6 s).', fr: 'L’autoscaling lance 3 instances tout de suite (prêtes en 6 s).' } },
  degrade: { name: { en: 'Degraded mode', fr: 'Mode dégradé' }, desc: { en: 'Turns off recommendations until the end.', fr: 'Coupe les recommandations jusqu’à la fin.' } },
  waf: { name: { en: 'Switch the WAF', fr: 'Basculer le WAF' }, desc: { en: 'Switches the firewall from lenient to strict, or back.', fr: 'Passe le pare-feu de souple à strict, ou l’inverse.' } },
  promote: { name: { en: 'Promote the replica', fr: 'Promouvoir la réplique' }, desc: { en: 'The first replica becomes the primary. Writes not yet replicated are lost.', fr: 'La première réplique devient la primaire. Les écritures pas encore répliquées sont perdues.' } },
};

// Causes d’échec affichées dans le bilan.
export const REASONS = {
  noServer: { en: 'No server to respond', fr: 'Aucun serveur pour répondre' },
  noLb: { en: 'Without a load balancer, one server gets all the traffic', fr: 'Sans load balancer, un seul serveur reçoit tout le trafic' },
  serverSat: { en: 'Servers saturated', fr: 'Serveurs saturés' },
  bulkheadSat: { en: 'Bulkhead saturated', fr: 'Cloisonnement saturé' },
  crash: { en: 'The downed server had no backup', fr: 'Le serveur tombé n’avait pas de relève' },
  session: { en: 'Lost sessions: the user lands on a server that doesn’t know them', fr: 'Sessions perdues : l’utilisateur arrive sur un serveur qui ne le connaît pas' },
  noDb: { en: 'No database', fr: 'Aucune base de données' },
  dbDown: { en: 'No primary database left to write to', fr: 'Plus de base primaire pour écrire' },
  dbSat: { en: 'Database saturated', fr: 'Base de données saturée' },
  conn: { en: 'Too many open connections on the database', fr: 'Trop de connexions ouvertes sur la base' },
  stale: { en: 'Read of data not yet replicated (“my cart is empty”)', fr: 'Lecture d’une donnée pas encore répliquée (« mon panier est vide »)' },
  apiDown: { en: 'Payment API down', fr: 'API de paiement en panne' },
  apiTimeout: { en: 'Payments timed out', fr: 'Paiements expirés (timeout)' },
  blocked: { en: 'Real customers blocked by the firewall', fr: 'Vrais clients bloqués par le pare-feu' },
  backlog: { en: 'Tasks never processed by the end (missing or too slow workers)', fr: 'Tâches jamais traitées à la fin (workers manquants ou trop lents)' },
  queueLost: { en: 'Message queue lost with its region', fr: 'File de messages perdue avec sa région' },
  objDown: { en: 'Object storage unavailable', fr: 'Stockage objet indisponible' },
  promoLoss: { en: 'Writes lost during the failover', fr: 'Écritures perdues pendant la bascule' },
};

// Récit d'un niveau généré : trafic, mélange et incidents prévus (p.tags : [type d'incident, seconde]).
const genStory = (lang, p) => {
  const L = lang === 'fr';
  const bits = [p.rps.toLocaleString(L ? 'fr-FR' : 'en-US') + ' req/s'];
  if (p.static) bits.push(L ? p.static + ' % de statique' : p.static + ' % static');
  if (p.pay) bits.push(L ? p.pay + ' % de paiements' : p.pay + ' % payments');
  if (p.reco) bits.push(L ? p.reco + ' % de recos' : p.reco + ' % recommendations');
  if (p.upload) bits.push(L ? 'des uploads' : 'some uploads');
  if (p.regions) bits.push(L ? 'clients à Paris et New York' : 'customers in Paris and New York');
  const tags = p.tags.map(([e, t]) => EVENT_NAMES[e][lang] + (L ? ' vers ' : ' around ') + t + ' s');
  return bits.join(', ') + '. ' + (tags.length ? (L ? 'Au programme : ' : 'On the agenda: ') + tags.join(', ') + '.' : (L ? 'Pas d’incident prévu.' : 'No incident planned.'));
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Messages produits par les règles ({ k, p }) : réponses des cartes, chronologie du run, titres et récits générés.
export const MSGS = {
  noCard: { en: 'No card left', fr: 'Plus de carte' },
  srvBoot: { en: 'Server on its way (5 s)', fr: 'Serveur en route (5 s)' },
  srvNoLb: { en: 'Server launched, but without a load balancer it won’t receive anything', fr: 'Serveur lancé, mais sans load balancer il ne recevra rien' },
  noDead: { en: 'No server to restart', fr: 'Aucun serveur à relancer' },
  restarting: { en: 'Restarting (4 s)', fr: 'Redémarrage (4 s)' },
  noAuto: { en: 'No autoscaling', fr: 'Pas d’autoscaling' },
  prewarmed: { en: '+3 instances (6 s)', fr: '+3 instances (6 s)' },
  degraded: { en: 'Recommendations turned off', fr: 'Recommandations coupées' },
  noWaf: { en: 'No firewall', fr: 'Pas de pare-feu' },
  wafMode: { en: p => 'WAF ' + (p.m === 'strict' ? 'strict' : 'lenient'), fr: p => 'WAF ' + p.m },
  noReplica: { en: 'No replica to promote', fr: 'Aucune réplique à promouvoir' },
  promoted: { en: 'Replica promoted', fr: 'Réplique promue' },
  promoLog: { en: p => (p.auto ? 'Automatic failover: ' : '') + 'the replica becomes primary', fr: p => (p.auto ? 'Bascule automatique : ' : '') + 'la réplique devient primaire' },
  card: { en: p => CARDS[p.c].name.en, fr: p => CARDS[p.c].name.fr },
  srvDown: { en: p => 'Server ' + p.s + ' down', fr: p => 'Serveur ' + p.s + ' hors service' },
  cacheFlush: { en: 'Redis restarts: cache empty', fr: 'Redis redémarre : cache vide' },
  regionDown: { en: p => REGION_NAMES[p.r] + ' region down', fr: p => 'Panne de la région ' + REGION_NAMES[p.r] },
  legacyOff: { en: 'The old database is shut down', fr: 'L’ancienne base est éteinte' },
  genTitle: { en: p => 'Round ' + p.n, fr: p => 'Tour ' + p.n },
  dailyTitle: { en: p => 'Challenge of ' + MONTHS[p.d.slice(5, 7) - 1] + ' ' + Number(p.d.slice(8)), fr: p => 'Défi du ' + p.d.split('-').reverse().slice(0, 2).join('/') },
  genStory: { en: p => genStory('en', p), fr: p => genStory('fr', p) },
};

// Un texte dans la langue voulue : chaîne telle quelle, paire { en, fr }, ou message { k, p } des règles.
export function tr(x, lang) {
  if (x == null || typeof x !== 'object') return x;
  const v = x.k ? MSGS[x.k][lang] : x[lang];
  return typeof v === 'function' ? v(x.p || {}) : v;
}
