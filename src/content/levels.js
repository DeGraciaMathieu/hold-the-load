// Fabriques des niveaux : mélange de trafic par classe, profil de charge sinusoïdal.
export const mixOf = o => ({ static: 0, read: 0, write: 0, upload: 0, pay: 0, reco: 0, ...o });
export const wave = (a, b, p) => t => a + b * Math.sin(t / p);

// Briques disponibles, cumulées au fil des missions. Titres et récits : { en, fr } (voir texts.js).
const BR = {
  base: ['server', 'db'],
  lb: ['server', 'db', 'lb'],
  cache: ['server', 'db', 'lb', 'cache'],
  cdn: ['server', 'db', 'lb', 'cache', 'cdn', 'replica'],
  queue: ['server', 'db', 'lb', 'cache', 'cdn', 'replica', 'queue', 'worker'],
  all: ['server', 'db', 'lb', 'cache', 'cdn', 'replica', 'queue', 'worker', 'autoscale', 'breaker', 'waf', 'pooler', 'objstore', 'bulkhead'],
};
export const LEVELS = [
  {
    id: 'm01', title: { en: 'First customer', fr: 'Premier client' }, bricks: BR.base,
    story: {
      en: 'Your app leaves the dev room: 250 requests per second, all dynamic pages. The bare minimum will do.',
      fr: 'Ton appli sort de la salle de dev : 250 requêtes par seconde, que des pages dynamiques. Le strict nécessaire suffira.',
    },
    rps: 250, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: wave(0.85, 0.15, 3),
    goals: { avail: 99, p95: 120, budget: 140 },
  },
  {
    id: 'm02', title: { en: 'The launch', fr: 'Le lancement' }, bricks: BR.lb,
    story: {
      en: 'An article on Laravel News, and traffic climbs to 700 req/s. A medium server handles 400 req/s.',
      fr: 'Un article sur Laravel France, et le trafic grimpe jusqu’à 700 req/s. Un serveur moyen encaisse 400 req/s.',
    },
    rps: 700, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: t => Math.min(1, 0.4 + t / 12),
    goals: { avail: 99, p95: 150, budget: 210 },
  },
  {
    id: 'm03', title: { en: 'Alice loses her cart', fr: 'Alice perd son panier' }, bricks: BR.cache, lbAlgos: ['rr', 'sticky'],
    story: {
      en: '70 % of visitors are logged in, and their sessions live in the memory of the server that created them. Two ways out: share the sessions, or keep everyone on their own server.',
      fr: '70 % des visiteurs sont connectés, et leurs sessions vivent dans la mémoire du serveur qui les a créées. Deux façons de s’en sortir : partager les sessions, ou garder chacun sur son serveur.',
    },
    rps: 600, duration: 20, mix: mixOf({ read: 0.85, write: 0.15 }), logged: 0.7, profile: wave(0.9, 0.1, 2),
    goals: { avail: 99, p95: 150, budget: 230 },
  },
  {
    id: 'm04', title: { en: 'A server goes down', fr: 'Un serveur tombe' }, bricks: BR.cache, cards: { restart: 1 },
    story: {
      en: '1,000 req/s non-stop. At second 8, server A shuts down. A Restart card is available, but rebooting takes 4 s.',
      fr: '1 000 req/s en continu. À la 8e seconde, le serveur A s’éteint. Une carte Relancer est dispo, mais le redémarrage prend 4 s.',
    },
    rps: 1000, duration: 20, mix: mixOf({ read: 0.9, write: 0.1 }), profile: wave(0.95, 0.05, 1),
    events: [{ type: 'crash', t: 8, target: 0 }],
    goals: { avail: 99, p95: 170, budget: 290 },
  },
  {
    id: 'm05', title: { en: 'Big or small?', fr: 'Gros ou petits ?' }, bricks: BR.cache, sizes: true,
    story: {
      en: '1,800 req/s, 60 % of them static files that your servers serve themselves (no CDN yet). Large servers cost less per request, but watch the balancing if you mix sizes.',
      fr: '1 800 req/s, dont 60 % de fichiers statiques que tes serveurs servent eux-mêmes (pas encore de CDN). Les gros serveurs coûtent moins cher à la requête, mais attention à la répartition si tu mélanges les tailles.',
    },
    rps: 1800, duration: 20, mix: mixOf({ static: 0.6, read: 0.36, write: 0.04 }), profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 170, budget: 250 },
  },
  {
    id: 'm06', title: { en: 'The sales', fr: 'Les soldes' }, bricks: BR.cdn, sizes: true,
    story: {
      en: '2,400 req/s, half of them images. The catalog is read a lot, but prices change during the sales: at most 3 % stale pages.',
      fr: '2 400 req/s, la moitié en images. Le catalogue se lit beaucoup, mais les prix changent pendant les soldes : au plus 3 % de pages périmées.',
    },
    rps: 2400, duration: 20, mix: mixOf({ static: 0.5, read: 0.45, write: 0.05 }), profile: t => Math.min(1, 0.5 + t / 10),
    goals: { avail: 99, p95: 150, budget: 315, fresh: 97 },
  },
  {
    id: 'm07', title: { en: 'The 9 a.m. newsletter', fr: 'La newsletter de 9 h' }, bricks: BR.cdn, sizes: true,
    story: {
      en: '1,100 req/s of reads. At second 8, Redis restarts while the newsletter goes out: the cache is empty right at the peak.',
      fr: '1 100 req/s de lecture. À la 8e seconde, Redis redémarre pendant l’envoi de la newsletter : le cache est vide pile au moment du pic.',
    },
    rps: 1100, duration: 24, mix: mixOf({ read: 0.95, write: 0.05 }), profile: t => (t >= 8 && t < 16 ? 1 : 0.7),
    events: [{ type: 'cacheFlush', t: 8 }],
    goals: { avail: 99, p95: 160, budget: 295 },
  },
  {
    id: 'm08', title: { en: 'Black Friday', fr: 'Black Friday' }, bricks: BR.queue, sizes: true,
    story: {
      en: '1,200 req/s. Between seconds 5 and 11, everyone checks out: 90 % writes. A queue acknowledges them, but you need workers to drain it before the end.',
      fr: '1 200 req/s. Entre la 5e et la 11e seconde, tout le monde valide son panier : 90 % d’écritures. Une file accuse réception, mais il faut des workers pour la vider avant la fin.',
    },
    rps: 1200, duration: 24, mix: t => (t >= 5 && t < 11 ? mixOf({ read: 0.1, write: 0.9 }) : mixOf({ read: 0.85, write: 0.15 })), profile: () => 1,
    goals: { avail: 99, p95: 160, budget: 360 },
  },
  {
    id: 'm09', title: { en: 'My cart is empty', fr: 'Mon panier est vide' }, bricks: ['server', 'db', 'lb', 'cdn', 'replica', 'queue', 'worker'], sizes: true,
    story: {
      en: '1,600 req/s on personal pages that can’t be cached (no Redis here). 30 % of reads come right after adding to the cart, and replicas always lag a little behind the primary…',
      fr: '1 600 req/s sur des pages personnelles, impossibles à mettre en cache (pas de Redis ici). 30 % des lectures suivent juste un ajout au panier, et les répliques ont toujours un peu de retard sur la primaire…',
    },
    rps: 1600, duration: 20, mix: mixOf({ read: 0.85, write: 0.15 }), fresh: 0.3, profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 160, budget: 425 },
  },
  {
    id: 'm10', title: { en: 'Kick-off', fr: 'Le coup d’envoi' }, bricks: [...BR.queue, 'autoscale'], sizes: true, cards: { prewarm: 1 },
    story: {
      en: 'Big game tonight. A calm 500 req/s before the match, then kick-off at second 20: ×6 in 2 s. Fixed servers are expensive for an 8 s peak… and autoscaling takes 6 s to boot an instance.',
      fr: 'Match ce soir. Avant-match calme à 500 req/s, puis coup d’envoi à la 20e seconde : ×6 en 2 s. Les serveurs fixes coûtent cher pour un pic de 8 s… et l’autoscaling met 6 s à démarrer une instance.',
    },
    rps: 3000, duration: 40, mix: mixOf({ static: 0.4, read: 0.55, write: 0.05 }),
    profile: t => (t < 20 ? 1 / 6 : t < 22 ? 1 / 6 + (5 / 6) * (t - 20) / 2 : t < 30 ? 1 : Math.max(1 / 6, 1 - (t - 30) / 4)),
    goals: { avail: 99, p95: 170, budget: 335 },
  },
  {
    id: 'm11', title: { en: 'The provider is slow', fr: 'Le prestataire rame' }, bricks: [...BR.queue, 'breaker'], sizes: true, settingsAllowed: ['timeout'],
    story: {
      en: '1,000 req/s, 15 % of them payments. From second 6 to 16, the payment API takes 4 s to respond. Servers that wait are servers that no longer serve anyone.',
      fr: '1 000 req/s, dont 15 % de paiements. De la 6e à la 16e seconde, l’API de paiement met 4 s à répondre. Des serveurs qui attendent sont des serveurs qui ne servent plus personne.',
    },
    rps: 1000, duration: 24, mix: mixOf({ read: 0.75, write: 0.1, pay: 0.15 }), profile: () => 1,
    events: [{ type: 'apiSlow', from: 6, to: 16, lat: 4000 }],
    goals: { avail: 98.5, p95: 200, budget: 350 },
  },
  {
    id: 'm12', title: { en: 'Retrying is free?', fr: 'Réessayer, c’est gratuit ?' }, bricks: [...BR.queue, 'breaker'], sizes: true, settingsAllowed: ['timeout', 'retries'],
    story: {
      en: 'The payment API fails one time in 15, at random. Retrying helps… until second 10, when a server goes down and everything saturates. Every retry costs time.',
      fr: 'L’API de paiement échoue une fois sur 15, au hasard. Réessayer aide… jusqu’à la 10e seconde, où un serveur tombe et où tout sature. Chaque nouvel essai coûte du temps.',
    },
    rps: 1100, duration: 24, mix: mixOf({ read: 0.65, write: 0.1, pay: 0.25 }), api: { lat: 100, err: 0.07 }, profile: () => 1,
    events: [{ type: 'crash', t: 10, target: 0 }],
    goals: { avail: 99, p95: 300, budget: 280 },
  },
  {
    id: 'm13', title: { en: 'The attack', fr: 'L’attaque' }, bricks: [...BR.queue, 'breaker', 'waf'], sizes: true, cards: { waf: 2 }, settingsAllowed: ['timeout'],
    story: {
      en: '800 legitimate req/s. From second 8 to 16, a botnet sends 4 times as many requests. The strict firewall blocks 3 % of real customers: only turn it on at the right moment.',
      fr: '800 req/s légitimes. De la 8e à la 16e seconde, un botnet envoie 4 fois plus de requêtes. Le pare-feu strict bloque 3 % de vrais clients : à n’activer qu’au bon moment.',
    },
    rps: 800, duration: 24, mix: mixOf({ read: 0.9, write: 0.1 }), profile: () => 1,
    events: [{ type: 'attack', from: 8, to: 16, mult: 4 }],
    goals: { avail: 97.5, p95: 160, budget: 265 },
  },
  {
    id: 'm14', title: { en: 'Too many at the door', fr: 'Trop de monde à la porte' }, bricks: [...BR.queue, 'breaker', 'waf', 'pooler'], sizes: true,
    story: {
      en: '3,300 req/s, almost all cacheable. You need lots of servers… but each one opens its own connections to the database, which only accepts 150.',
      fr: '3 300 req/s, presque tout en cache. Il faut beaucoup de serveurs… mais chacun ouvre ses connexions à la base, qui n’en accepte que 150.',
    },
    rps: 3300, duration: 20, mix: mixOf({ static: 0.3, read: 0.65, write: 0.05 }), profile: wave(0.95, 0.05, 2),
    goals: { avail: 99, p95: 160, budget: 430 },
  },
  {
    id: 'm15', title: { en: 'Recommendations', fr: 'Les recommandations' }, bricks: [...BR.queue, 'breaker', 'waf', 'pooler'], sizes: true, cards: { degrade: 1 }, settingsAllowed: ['shed'],
    story: {
      en: '35 % of traffic is for showing “you may also like”. From second 8 to 16, traffic rises by 60 %. Recos can go, the rest can’t. Keep at least 70 % of recos served.',
      fr: '35 % du trafic sert à afficher « vous aimerez aussi ». De la 8e à la 16e seconde, le trafic monte de 60 %. Les recos peuvent sauter, le reste non. Garde au moins 70 % des recos servies.',
    },
    rps: 1000, duration: 24, mix: mixOf({ read: 0.55, write: 0.1, reco: 0.35 }), profile: t => (t >= 8 && t < 16 ? 1.6 : 1),
    goals: { avail: 99, p95: 160, budget: 290, recos: 70 },
  },
  {
    id: 'm15b', title: { en: 'Each to its own lane', fr: 'Chacun son couloir' }, bricks: [...BR.queue, 'breaker', 'waf', 'pooler', 'bulkhead'], sizes: true, settingsAllowed: ['timeout'],
    story: {
      en: '1,200 req/s, 8 % of them payments. From second 6 to 18, the payment API responds in 750 ms: too little to open the breaker, enough for each payment to hold a server eight times longer than a page. You can lose payments, not the site.',
      fr: '1 200 req/s, dont 8 % de paiements. De la 6e à la 18e seconde, l’API de paiement répond en 750 ms : trop peu pour ouvrir le disjoncteur, assez pour que chaque paiement occupe un serveur huit fois plus longtemps qu’une page. Tu peux perdre des paiements, pas le site.',
    },
    rps: 1200, duration: 24, mix: mixOf({ read: 0.82, write: 0.1, pay: 0.08 }), profile: () => 1,
    events: [{ type: 'apiSlow', from: 6, to: 18, lat: 750 }],
    goals: { avail: 97, p95: 200, budget: 310 },
  },
  {
    id: 'm16', title: { en: 'The whole world', fr: 'Le monde entier' }, bricks: [...BR.queue, 'breaker', 'pooler', 'bulkhead'], sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'],
    regions: { eu: 0.4, us: 0.35, asia: 0.25 },
    story: {
      en: 'Your customers are in Paris, New York and Tokyo. Crossing the Atlantic costs 80 ms, the Pacific 100, Paris to Tokyo 120. Each brick is placed in a region.',
      fr: 'Tes clients sont à Paris, New York et Tokyo. Traverser l’Atlantique coûte 80 ms, le Pacifique 100, aller de Paris à Tokyo 120. Chaque brique se place dans une région.',
    },
    rps: 1200, duration: 20, mix: mixOf({ static: 0.3, read: 0.65, write: 0.05 }), profile: () => 1,
    goals: { avail: 99, p95: 160, budget: 420 },
  },
  {
    id: 'm17', title: { en: 'Region outage', fr: 'Panne de région' }, bricks: [...BR.queue, 'breaker', 'pooler', 'bulkhead'], sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'], cards: { promote: 1 },
    regions: { eu: 0.6, us: 0.4 },
    story: {
      en: 'Paris and New York. At second 10, the region hosting your primary database goes down entirely: servers, database, cache, queue. A replica elsewhere is promoted after 5 s… if there is one.',
      fr: 'Paris et New York. À la 10e seconde, la région qui héberge ta base primaire tombe en entier : serveurs, base, cache, file. Une réplique ailleurs est promue au bout de 5 s… si elle existe.',
    },
    rps: 900, duration: 24, mix: mixOf({ read: 0.85, write: 0.15 }), profile: () => 1,
    events: [{ type: 'regionDown', t: 10, region: 'primary' }],
    goals: { avail: 99, p95: 200, budget: 390 },
  },
  {
    id: 'm18', title: { en: 'Trim the bill', fr: 'Dégraisser la facture' }, bricks: BR.all, sizes: true, settingsAllowed: ['timeout', 'retries', 'shed'],
    story: {
      en: 'You inherit a contractor’s infra: it holds, but it costs a fortune. The CFO wants it under 230 €/month without losing a single request.',
      fr: 'Tu hérites de l’infra d’un prestataire : ça tient, mais ça coûte une fortune. Le DAF veut passer sous 230 €/mois sans perdre une requête.',
    },
    rps: 1200, duration: 20, mix: mixOf({ static: 0.3, read: 0.6, write: 0.1 }), profile: wave(0.95, 0.05, 2),
    preset: {
      edge: [{ type: 'lb' }, { type: 'cdn' }, { type: 'waf' }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'm' } }, { type: 'worker' }, { type: 'worker' }],
      svc: [{ type: 'cache', opts: { ttl: 'court', antiRuee: true } }, { type: 'queue' }, { type: 'pooler' }, { type: 'breaker' }],
      data: [{ type: 'db' }, { type: 'replica' }, { type: 'replica' }, { type: 'objstore' }],
    },
    goals: { avail: 99, p95: 160, budget: 230 },
  },
  {
    id: 'm19', title: { en: 'Live migration', fr: 'La migration à chaud' }, bricks: BR.all, sizes: true, cards: { promote: 1 }, settingsAllowed: ['timeout', 'retries', 'shed'],
    story: {
      en: 'The old database (600 req/s, locked) will be shut down at second 22. You need a new machine ready to take over. A failover costs about 3 s of writes: aim for the lull, between seconds 12 and 15.',
      fr: 'L’ancienne base (600 req/s, verrouillée) sera éteinte à la 22e seconde. Il faut une nouvelle machine prête à prendre le relais. Une bascule coûte environ 3 s d’écritures : vise le creux, entre la 12e et la 15e seconde.',
    },
    rps: 900, duration: 26, mix: t => (t >= 12 && t < 15 ? mixOf({ read: 0.98, write: 0.02 }) : mixOf({ read: 0.75, write: 0.25 })),
    profile: t => (t >= 12 && t < 15 ? 0.5 : 1),
    events: [{ type: 'legacyShutdown', t: 22 }],
    preset: {
      edge: [{ type: 'lb' }, null, null], app: [{ type: 'server', opts: { size: 'm' } }, { type: 'server', opts: { size: 'm' } }, { type: 'server', opts: { size: 'm' } }, null, null],
      svc: [null, null, null, null], data: [{ type: 'db', opts: { legacy: true }, locked: true }, null, null, null],
    },
    goals: { avail: 99, p95: 200, budget: 300 },
  },
];
