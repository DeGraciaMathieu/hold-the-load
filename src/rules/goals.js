// Objectifs d'un niveau : chaque critère atteint ou non, et la victoire s'ils le sont tous.
export function goalsMet(level, res) {
  const g = level.goals, out = {};
  out.avail = res.avail >= g.avail;
  out.p95 = res.ok > 0 && res.p95 <= g.p95;
  out.budget = g.budget == null || res.cost <= g.budget;
  if (g.fresh != null) out.fresh = res.fresh >= g.fresh;
  if (g.recos != null) out.recos = res.recos >= g.recos;
  out.win = Object.values(out).every(Boolean);
  return out;
}

// Étoiles d'une mission : aucune si la disponibilité, la fraîcheur ou les recos ratent leur objectif ;
// sinon une, plus une pour la latence et une pour le budget.
export function missionStars(met) {
  const extras = met.fresh !== false && met.recos !== false;
  return met.avail && extras ? 1 + (met.p95 ? 1 : 0) + (met.budget ? 1 : 0) : 0;
}

// Une mission est jouable si c'est la première, si la précédente a 3 étoiles, si on l'a déjà atteinte ou réussie.
export function missionUnlocked(levels, stars, i, current) {
  return i === 0 || (stars[levels[i - 1].id] || 0) === 3 || i <= current || (stars[levels[i].id] || 0) > 0;
}
