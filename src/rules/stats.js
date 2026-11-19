// Accumulateur de causes d'échec : modifie volontairement `o` (voir docs/decisions.md).
export function addReason(o, k, v) { if (v > 0) o[k] = (o[k] || 0) + v; }

// 95e centile d'une latence, à partir d'échantillons pondérés [latence, volume].
export function p95(samples) {
  const tot = samples.reduce((a, s) => a + s[1], 0);
  if (!tot) return 0;
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  let acc = 0;
  for (const [lat, w] of sorted) { acc += w; if (acc >= tot * 0.95) return lat; }
  return sorted[sorted.length - 1][0];
}
