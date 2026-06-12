/** Core math utilities — arch §Build Order step 1. Pure, no I/O. */

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n − 1). Returns 0 for fewer than 2 points. */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const sumSq = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}

/**
 * Pearson correlation coefficient over paired samples.
 * Returns 0 when either series has zero variance or lengths mismatch
 * (degraded input is treated as "no correlation signal", not an error —
 * the adapter layer is responsible for flagging data quality).
 */
export function pearsonCorr(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** Annualised volatility from daily returns — arch: std_dev × √365. */
export function annualizedVol(dailyReturns: readonly number[]): number {
  return stdDev(dailyReturns) * Math.sqrt(365);
}

/** Daily fractional returns from a price series (p[i] / p[i−1] − 1). */
export function dailyReturns(prices: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1] as number;
    if (prev > 0) out.push((prices[i] as number) / prev - 1);
  }
  return out;
}
