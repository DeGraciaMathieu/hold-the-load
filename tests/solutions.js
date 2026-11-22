// Solution trois étoiles de référence de chaque mission : la moins chère trouvée par scripts/solve.mjs.
// tests/missions.test.js les rejoue toutes. Après un changement de règle ou d'équilibrage, relancer le solveur
// sur les missions qui échouent (npm run solve -- <id>) et reporter ici la nouvelle solution.
export const SOLUTIONS = {
  m01: {
    cost: 130,
    board: {
      app: [{ type: 'server' }],
      data: [{ type: 'db' }],
    },
  },
  m02: {
    cost: 190,
    board: {
      edge: [{ type: 'lb' }],
      app: [{ type: 'server' }, { type: 'server' }],
      data: [{ type: 'db' }],
    },
  },
  m03: {
    cost: 190,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'sticky' } }],
      app: [{ type: 'server' }, { type: 'server' }],
      data: [{ type: 'db' }],
    },
  },
  m04: {
    cost: 270,
    board: {
      edge: [{ type: 'lb' }],
      app: [{ type: 'server' }, { type: 'server' }, { type: 'server' }, { type: 'server' }],
      data: [{ type: 'db' }],
    },
  },
  m05: {
    cost: 235,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }],
      data: [{ type: 'db' }],
    },
  },
  m06: {
    cost: 300,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }, { type: 'cdn' }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }],
      svc: [{ type: 'cache', opts: { ttl: 'court' } }],
      data: [{ type: 'db' }],
    },
  },
  m07: {
    cost: 280,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }],
      svc: [{ type: 'cache', opts: { ttl: 'court', antiRuee: true } }],
      data: [{ type: 'db' }],
    },
  },
  m08: {
    cost: 340,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 's' } }, { type: 'worker' }, { type: 'worker' }],
      svc: [{ type: 'cache' }, { type: 'queue' }],
      data: [{ type: 'db' }],
    },
  },
  m09: {
    cost: 400,
    board: {
      edge: [{ type: 'lb' }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'l' } }],
      data: [{ type: 'db', opts: { sensible: true } }, { type: 'replica' }, { type: 'replica' }],
    },
  },
  m10: {
    cost: 319,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }, { type: 'cdn' }],
      app: [{ type: 'server', opts: { size: 's' } }, { type: 'autoscale', opts: { max: 4 } }],
      svc: [{ type: 'cache' }],
      data: [{ type: 'db' }],
    },
    actions: [{ t: 14, card: 'prewarm' }],
  },
  m11: {
    cost: 330,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }, { type: 'server', opts: { size: 's' } }, { type: 'worker' }],
      svc: [{ type: 'queue' }, { type: 'breaker' }],
      data: [{ type: 'db' }],
    },
  },
  m12: {
    cost: 260,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 's' } }, { type: 'server' }, { type: 'server', opts: { size: 'l' } }],
      data: [{ type: 'db' }],
    },
    settings: { retries: 1 },
  },
  m13: {
    cost: 200,
    board: {
      edge: [{ type: 'waf' }],
      app: [{ type: 'server', opts: { size: 'l' } }],
      data: [{ type: 'db' }],
    },
    actions: [{ t: 8, card: 'waf' }, { t: 16, card: 'waf' }],
  },
  m14: {
    cost: 405,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }, { type: 'cdn' }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 'l' } }, { type: 'server' }],
      svc: [{ type: 'cache' }, { type: 'pooler' }],
      data: [{ type: 'db' }],
    },
  },
  m15: {
    cost: 270,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server' }],
      svc: [{ type: 'cache', opts: { ttl: 'court' } }],
      data: [{ type: 'db' }],
    },
    settings: { shed: true },
  },
  m15b: {
    cost: 300,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' } }, { type: 'server', opts: { size: 's' } }, { type: 'bulkhead' }],
      svc: [{ type: 'cache', opts: { ttl: 'court' } }],
      data: [{ type: 'db' }],
    },
  },
  m16: {
    cost: 350,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 'l' }, region: 'asia' }, { type: 'server', region: 'us' }, { type: 'server', region: 'eu' }, { type: 'server', region: 'eu' }],
      svc: [{ type: 'cache', opts: { ttl: 'long' }, region: 'us' }],
      data: [{ type: 'db', region: 'us' }],
    },
  },
  m17: {
    cost: 315,
    board: {
      edge: [{ type: 'lb', opts: { algo: 'least' } }],
      app: [{ type: 'server', opts: { size: 's' }, region: 'eu' }, { type: 'server', opts: { size: 'l' }, region: 'eu' }],
      svc: [{ type: 'cache', opts: { ttl: 'long' }, region: 'eu' }],
      data: [{ type: 'db', region: 'us' }, { type: 'replica', region: 'eu' }],
    },
    actions: [{ t: 10.25, card: 'promote' }],
  },
  m18: {
    cost: 205,
    board: {
      edge: [{ type: 'cdn' }],
      app: [{ type: 'server', opts: { size: 'l' } }],
      data: [{ type: 'db' }],
    },
  },
  m19: {
    cost: 265,
    board: {
      app: [{ type: 'server', opts: { size: 'l' } }],
      data: [{ type: 'db', opts: { legacy: true } }, { type: 'replica' }],
    },
    actions: [{ t: 12.5, card: 'promote' }],
  },
};
