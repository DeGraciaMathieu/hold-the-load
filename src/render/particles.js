import { TIMEOUT_SHORT, TIMEOUT_LONG } from '../config.js';
import { CLASSES } from '../content/catalog.js';
import { CUR, RUN, sets, mixNow } from '../state/context.js';
import { W, G, center, placed, serverPos } from './geometry.js';

export let particles = [], bursts = [];
export function clearParticles() { particles = []; bursts = []; }

// ---------- particules ----------
const jit = (p, a = 9) => ({ x: p.x + (Math.random() - .5) * a * 2, y: p.y + (Math.random() - .5) * a });
export function spawn() {
  const S = RUN.S, tk = RUN.tk, lv = CUR.level;
  const pts = [jit(G.internet, 40)];
  const P = t => placed(t).map(x => center(x.row, x.i));
  const alive = id => { const b = S.bricks.find(x => x.id === id); return b && b.alive; };
  const at = (t) => { const q = placed(t).filter(x => alive(x.row + x.i)); return q.length ? jit(center(q[0].row, q[0].i)) : null; };
  const done = (fail, col) => ({ pts, fail, color: fail ? '#d64534' : '#2f9e5b' });
  // bots
  const isBot = tk.bots > 0 && Math.random() < tk.bots / (tk.bots + tk.T);
  const waf = at('waf');
  if (waf) pts.push(waf);
  if (isBot) {
    if (waf && Math.random() > tk.botsPass / Math.max(1, tk.bots)) return { pts, fail: true, bot: true, color: '#8e44ad', blockColor: '#8e44ad' };
  } else if (waf && Math.random() < tk.vis.blockedFrac) return done(true);
  const m = mixNow(tk.t);
  const rnd = Math.random();
  let c = 'read', acc = 0;
  for (const k of CLASSES) { acc += m[k] || 0; if (rnd < acc) { c = k; break; } }
  if (isBot) c = 'read';
  if (c === 'static' && at('cdn')) { pts.push(at('cdn')); return done(false); }
  if (c === 'reco' && S.recoOff) return null;
  const lb = at('lb');
  if (lb) pts.push(lb);
  const recv = tk.servers.filter(x => x.receiving);
  if (!recv.length) { const sp = placed('server')[0]; if (sp) pts.push(jit(center(sp.row, sp.i))); else pts.push({ x: W / 2, y: G.rows.app.slots[0].y + 28 }); return done(true); }
  const sv = recv[Math.floor(Math.random() * recv.length)];
  const sp = serverPos(sv.id); if (sp) pts.push(jit(sp));
  const r = sets().retries;
  const served = sv.rho > 1 ? (r > 0 ? Math.max(0, 2 / sv.rho - 1) : 1 / sv.rho) : 1;
  if (Math.random() > served) return done(true);
  if (c === 'static') return done(false);
  if (!isBot && Math.random() < tk.vis.sessFrac) return done(true);
  const dbNodes = tk.dbNodes;
  const toDb = (fresh) => {
    if (!dbNodes.length) return done(true);
    if (Math.random() < tk.vis.connFail && at('pooler')) pts.push(at('pooler'));
    if (Math.random() < tk.vis.connFail) return done(true);
    const n = fresh && dbNodes[0].kind === 'p' && dbNodes.length && (S.primary && S.primary.brick.opts.sensible) ? dbNodes[0] : dbNodes[Math.floor(Math.random() * dbNodes.length)];
    const [row, i] = [n.id.replace(/\d+$/, ''), +n.id.match(/\d+$/)[0]];
    pts.push(jit(center(row, i)));
    if (Math.random() > n.served) return done(true);
    if (fresh && n.kind === 'r' && Math.random() < tk.vis.pStale) return done(true);
    return done(false);
  };
  if (c === 'upload') { const o = at('objstore'); if (o) { pts.push(o); return done(false); } return done(false); }
  if (c === 'pay') {
    const brk = at('breaker'); if (brk) pts.push(brk);
    if (tk.brkOpen) { const q = at('queue'); if (q && S.workers.some(w => w.alive)) { pts.push(q); return done(false); } return done(true); }
    pts.push(jit(G.api, 6));
    const to = sets().timeout === 'court' ? TIMEOUT_SHORT : TIMEOUT_LONG;
    return done(tk.api.lat > to || Math.random() < tk.api.err);
  }
  if (c === 'write') { const q = at('queue'); if (q) { pts.push(q); return done(false); } return toDb(false); }
  const fresh = c === 'read' && Math.random() < (lv.fresh || 0);
  if (!fresh && !isBot) { const ca = at('cache'); if (ca) { pts.push(ca); if (Math.random() < tk.hit) return done(false); } }
  return toDb(fresh);
}
export function spawnJob() {
  const q = placed('queue')[0], w = placed('worker'), d = RUN.tk.dbNodes[0];
  if (!q || !w.length) return;
  const wk = w[Math.floor(Math.random() * w.length)];
  const pts = [jit(center(q.row, q.i)), jit(center(wk.row, wk.i))];
  if (d && RUN.tk.drained.write > 0 && Math.random() < RUN.tk.drained.write / Math.max(1e-9, RUN.tk.drained.write + RUN.tk.drained.upload + RUN.tk.drained.pay)) {
    const [row, i] = [d.id.replace(/\d+$/, ''), +d.id.match(/\d+$/)[0]]; pts.push(jit(center(row, i)));
  }
  particles.push({ pts, fail: false, color: '#b08900', seg: 0, prog: 0, x: pts[0].x, y: pts[0].y, alpha: 1, job: true });
}
export function stepParticles(dt) {
  for (const p of particles) {
    if (p.dead) { p.alpha -= dt * 3; continue; }
    let move = 300 * dt;
    while (move > 0 && p.seg < p.pts.length - 1) {
      const a = p.pts[p.seg], b = p.pts[p.seg + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, rem = len * (1 - p.prog);
      if (move >= rem) { move -= rem; p.seg++; p.prog = 0; } else { p.prog += move / len; move = 0; }
    }
    if (p.seg >= p.pts.length - 1) {
      const l = p.pts[p.pts.length - 1]; p.x = l.x; p.y = l.y; p.dead = true;
      if (p.fail) { bursts.push({ x: p.x, y: p.y, age: 0, color: p.bot ? '#8e44ad' : '#d64534' }); p.alpha = 0; }
      else if (!p.job) p.color = '#2f9e5b';
    } else { const a = p.pts[p.seg], b = p.pts[p.seg + 1]; p.x = a.x + (b.x - a.x) * p.prog; p.y = a.y + (b.y - a.y) * p.prog; }
  }
  particles = particles.filter(p => p.alpha > 0);
  bursts.forEach(b => (b.age += dt)); bursts = bursts.filter(b => b.age < .5);
}
