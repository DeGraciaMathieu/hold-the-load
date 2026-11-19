import {
  SIZES, PRIMARY_CAP, PRIMARY_MAX_CONN, PROMOTION_DURATION, LAG_MIN, AUTO_BOOT,
  ADD_SERVER_BOOT, ADD_SERVER_COST, RESTART_BOOT, PREWARM_COUNT, PREWARM_HOLD,
} from '../../config.js';
import { CARDS } from '../../content/texts.js';
import { addReason } from '../stats.js';

// Cartes jouées en cours de partie et bascule de la base : modifient la simulation sur place.
export function promote(S, auto) {
  const rep = S.replicas.find(x => x.alive);
  if (!rep) return false;
  if (S.primary && S.primary.alive && !auto) {
    // écritures non répliquées perdues
    const loss = S.lastWriteRate * (S.lastLag + PROMOTION_DURATION); // la bascule elle-même dure ~3 s
    S.acc.ok -= loss; S.acc.fail += loss; addReason(S.acc.reasons, 'promoLoss', loss);
    S.primary.alive = false;
  }
  rep.type = 'db'; rep.promoted = true;
  S.replicas = S.replicas.filter(x => x !== rep);
  const old = S.primary;
  S.primary = { brick: { id: rep.id, opts: { sensible: old ? old.brick.opts.sensible : false } }, cap: PRIMARY_CAP, maxConn: PRIMARY_MAX_CONN, region: rep.region, alive: true };
  S.failoverAt = null;
  S.log.push({ t: S.t, msg: (auto ? 'Bascule automatique : ' : '') + 'la réplique devient primaire' });
  S.promotedId = rep.id;
  return true;
}

export function useCard(S, name) {
  if (!S.cards[name]) return { ok: false, msg: 'Plus de carte' };
  const t = S.t;
  let ok = false, msg = '';
  if (name === 'addServer') {
    S.temps.push({ id: 'tmp' + S.temps.length, cap: SIZES.m.cap, conns: SIZES.m.conns, region: (S.lb && S.lb.region) || 'eu', alive: true, readyAt: t + ADD_SERVER_BOOT, kind: 'temp' });
    S.extraCost += ADD_SERVER_COST; ok = true; msg = 'Serveur en route (5 s)';
    if (!S.lb) msg = 'Serveur lancé, mais sans load balancer il ne recevra rien';
  } else if (name === 'restart') {
    const dead = S.fixed.filter(f => !f.alive && !(S.level.events || []).some(e => e.type === 'regionDown' && e.region === f.region && S.t >= e.t));
    if (!dead.length) return { ok: false, msg: 'Aucun serveur à relancer' };
    dead.forEach(f => { f.alive = true; f.readyAt = t + RESTART_BOOT; }); ok = true; msg = 'Redémarrage (4 s)';
  } else if (name === 'prewarm') {
    if (!S.group) return { ok: false, msg: 'Pas d’autoscaling' };
    for (let k = 0; k < PREWARM_COUNT; k++) S.group.inst.push({ readyAt: t + AUTO_BOOT, alive: true, region: S.group.brick.region });
    S.group.hold = t + PREWARM_HOLD; ok = true; msg = '+3 instances (6 s)';
  } else if (name === 'degrade') {
    S.recoOff = true; ok = true; msg = 'Recommandations coupées';
  } else if (name === 'waf') {
    if (!S.waf) return { ok: false, msg: 'Pas de pare-feu' };
    S.wafMode = S.wafMode === 'strict' ? 'souple' : 'strict'; ok = true; msg = 'WAF ' + S.wafMode;
  } else if (name === 'promote') {
    if (!S.replicas.some(x => x.alive)) return { ok: false, msg: 'Aucune réplique à promouvoir' };
    S.lastLag = S.ticks.length ? S.ticks[S.ticks.length - 1].lag : LAG_MIN;
    ok = promote(S, false); msg = 'Réplique promue';
  }
  if (ok) { S.cards[name]--; S.log.push({ t, msg: CARDS[name].name }); }
  return { ok, msg };
}
