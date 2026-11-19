// Défi du jour : seul un défi tenu compte, et le record est le coût le plus bas.
export function isDailyRecord(met, res, best) { return met.win && (!best || res.cost < best); }
