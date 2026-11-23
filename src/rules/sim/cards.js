import {
  SIZES, PRIMARY_CAP, PRIMARY_MAX_CONN, PROMOTION_DURATION, LAG_MIN, AUTO_BOOT,
  ADD_SERVER_BOOT, ADD_SERVER_COST, RESTART_BOOT, PREWARM_COUNT, PREWARM_HOLD,
} from '../../config.js';
import { addReason } from '../stats.js';

// Cartes jouées en cours de partie et bascule de la base : modifient la simulation sur place.
// Les messages sont des clés de MSGS (content/texts.js), traduites au rendu.
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
  S.log.push({ t: S.t, msg: { k: 'promoLog', p: { auto } } });
  S.promotedId = rep.id;
  return true;
}

export function useCard(S, name) {
  if (!S.cards[name]) return { ok: false, msg: { k: 'noCard' } };
  const t = S.t;
  let ok = false, msg = null;
  if (name === 'addServer') {
    S.temps.push({ id: 'tmp' + S.temps.length, cap: SIZES.m.cap, conns: SIZES.m.conns, region: (S.lb && S.lb.region) || 'eu', alive: true, readyAt: t + ADD_SERVER_BOOT, kind: 'temp' });
    S.extraCost += ADD_SERVER_COST; ok = true; msg = { k: 'srvBoot' };
    if (!S.lb) msg = { k: 'srvNoLb' };
  } else if (name === 'restart') {
    const dead = S.fixed.filter(f => !f.alive && !(S.level.events || []).some(e => e.type === 'regionDown' && e.region === f.region && S.t >= e.t));
    if (!dead.length) return { ok: false, msg: { k: 'noDead' } };
    dead.forEach(f => { f.alive = true; f.readyAt = t + RESTART_BOOT; }); ok = true; msg = { k: 'restarting' };
  } else if (name === 'prewarm') {
    if (!S.group) return { ok: false, msg: { k: 'noAuto' } };
    for (let k = 0; k < PREWARM_COUNT; k++) S.group.inst.push({ readyAt: t + AUTO_BOOT, alive: true, region: S.group.brick.region });
    S.group.hold = t + PREWARM_HOLD; ok = true; msg = { k: 'prewarmed' };
  } else if (name === 'degrade') {
    S.recoOff = true; ok = true; msg = { k: 'degraded' };
  } else if (name === 'waf') {
    if (!S.waf) return { ok: false, msg: { k: 'noWaf' } };
    S.wafMode = S.wafMode === 'strict' ? 'souple' : 'strict'; ok = true; msg = { k: 'wafMode', p: { m: S.wafMode } };
  } else if (name === 'promote') {
    if (!S.replicas.some(x => x.alive)) return { ok: false, msg: { k: 'noReplica' } };
    S.lastLag = S.ticks.length ? S.ticks[S.ticks.length - 1].lag : LAG_MIN;
    ok = promote(S, false); msg = { k: 'promoted' };
  }
  if (ok) { S.cards[name]--; S.log.push({ t, msg: { k: 'card', p: { c: name } } }); }
  return { ok, msg };
}
