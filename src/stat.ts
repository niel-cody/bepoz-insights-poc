// ---------------------------------------------------------------------------
// stat.ts — the statistics the Thinking edition runs on.
//
// Everything here is pure, deterministic and computed in the browser from the
// same Dataset the other two editions read. No new data, no server, no model
// fitted offline and pasted in. If a number appears on a Thinking page, the
// function that produced it is in this file and the page names it.
//
// Method provenance, chapter by chapter, from the Seeing Theory teardown:
//   ch.1  variance, Chebyshev            -> spread(), robustness warnings
//   ch.3  central limit theorem, σ/√n    -> sem(), welch(), the window control
//   ch.4  interval estimation, bootstrap -> ci(), bootstrapCI(), predictionBand()
//   ch.5  posterior as prior + data      -> shrink(), estimateK()
//   ch.6  OLS, correlation, ANOVA idea   -> pearson(), varianceExplained()
//
// And the three things Seeing Theory does not teach, which the product needs:
//   power / minimum detectable effect    -> mde()
//   aggregation and Simpson's paradox    -> poolVsStratify()
//   decomposition of a change            -> decompose()
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Descriptives
// ---------------------------------------------------------------------------
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Sample standard deviation, n−1. The n−1 is not pedantry: with 4 same-weekday
 *  observations the difference between n and n−1 is 15% of the band width. */
export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1))
}

export const sem = (xs: number[]) => sd(xs) / Math.sqrt(xs.length)

export function median(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = s.length / 2
  return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2
}

/** Linear-interpolated quantile on an already-sorted array. */
export function quantileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
export const quantile = (xs: number[], p: number) => quantileSorted([...xs].sort((a, b) => a - b), p)

/** Coefficient of variation. Size-neutral, which is the whole point of using it. */
export const cv = (xs: number[]) => sd(xs) / mean(xs)

// ---------------------------------------------------------------------------
// Distributions
//
// Implemented rather than imported so the arithmetic is inspectable. Lanczos
// log-gamma, continued-fraction incomplete beta, Student t from those two,
// bisection for the inverse. Accurate to ~1e-10 across the range we use.
// ---------------------------------------------------------------------------
const LG_C = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
]
function lgamma(x: number): number {
  let y = x, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += LG_C[j] / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300, EPS = 3e-14
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Regularised incomplete beta I_x(a,b). */
export function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** P(T ≤ t) for Student's t with df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (!isFinite(t) || !isFinite(df) || df <= 0) return NaN
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t))
  return t > 0 ? 1 - p : p
}

/** Two-sided p-value for a t statistic. */
export const tTwoSided = (t: number, df: number) => 2 * (1 - tCdf(Math.abs(t), df))

/** Critical t for a two-sided interval at the given confidence, by bisection. */
export function tCrit(conf: number, df: number): number {
  if (!isFinite(df) || df <= 0) return NaN
  const target = 1 - (1 - conf) / 2
  let lo = 0, hi = 200
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < target) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/** Standard normal quantile (Acklam), used for power arithmetic. */
export function zCrit(p: number): number {
  const a = [-39.696830286653757, 220.94609842452050, -275.92851044696869, 138.35775186726900, -30.664798066147159, 2.5066282774592392]
  const b = [-54.476098798224058, 161.58583685804089, -155.69897985988661, 66.801311887719720, -13.280681552885721]
  const c = [-0.0077848940024302926, -0.32239645804113648, -2.4007582771618381, -2.5497325393437338, 4.3746641414649678, 2.9381639826987831]
  const d = [0.0077846957090414622, 0.32246712907003983, 2.4451341117582890, 3.7544086619074162]
  const pl = 0.02425
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pl) return -zCrit(1 - p)
  const q = p - 0.5, r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

// ---------------------------------------------------------------------------
// Intervals and comparisons
// ---------------------------------------------------------------------------
export interface Interval { lo: number; hi: number; conf: number }

/** Confidence interval for a mean. This is an interval for the AVERAGE day,
 *  not for tomorrow — see predictionInterval() for that, and never mix them. */
export function ciMean(xs: number[], conf = 0.95): Interval & { mean: number; n: number; se: number } {
  const m = mean(xs), n = xs.length, se = sem(xs)
  const t = tCrit(conf, n - 1)
  return { mean: m, n, se, lo: m - t * se, hi: m + t * se, conf }
}

/** Interval for the NEXT observation. Always wider than the interval on the
 *  mean, by the factor √(1 + 1/n). Operators need this one. */
export function predictionInterval(xs: number[], conf = 0.95): Interval & { centre: number; n: number } {
  const m = mean(xs), n = xs.length, s = sd(xs)
  const t = tCrit(conf, n - 1)
  const half = t * s * Math.sqrt(1 + 1 / n)
  return { centre: m, n, lo: m - half, hi: m + half, conf }
}

export interface Comparison {
  a: number; b: number; diff: number; rel: number
  se: number; t: number; df: number; p: number
  lo: number; hi: number; conf: number
  nA: number; nB: number
  verdict: 'moved' | 'within' | 'thin'
}

/** Welch's t. Unequal variances assumed, because venues do not have equal
 *  variances and pretending otherwise makes the interval too narrow. */
export function welch(a: number[], b: number[], conf = 0.95, minN = 8): Comparison {
  const nA = a.length, nB = b.length
  const mA = mean(a), mB = mean(b)
  const vA = sd(a) ** 2 / nA, vB = sd(b) ** 2 / nB
  const se = Math.sqrt(vA + vB)
  const df = (vA + vB) ** 2 / ((vA * vA) / (nA - 1) + (vB * vB) / (nB - 1))
  const t = (mB - mA) / se
  const tc = tCrit(conf, df)
  const thin = nA < minN || nB < minN || !isFinite(se) || se === 0
  const diff = mB - mA
  return {
    a: mA, b: mB, diff, rel: mA ? diff / mA : NaN,
    se, t, df, p: tTwoSided(t, df),
    lo: diff - tc * se, hi: diff + tc * se, conf,
    nA, nB,
    verdict: thin ? 'thin' : Math.abs(t) > tc ? 'moved' : 'within',
  }
}

/** Smallest difference in daily means this pair of windows could ever detect,
 *  at the given confidence and 80% power. The honest answer to "why does the
 *  report never tell me anything" is usually printed here. */
export function mde(sdA: number, sdB: number, nA: number, nB: number, conf = 0.95, power = 0.8): number {
  const se = Math.sqrt((sdA * sdA) / nA + (sdB * sdB) / nB)
  return (zCrit(1 - (1 - conf) / 2) + zCrit(power)) * se
}

// ---------------------------------------------------------------------------
// Bootstrap
//
// Seeded, so the same page always shows the same interval. An interval that
// moves when you reload is not an interval, it is a rumour.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Percentile bootstrap. Works on any statistic, including the ones with no
 *  closed-form standard error, which is most of the ones on these pages. */
export function bootstrapCI(xs: number[], stat: (s: number[]) => number, conf = 0.95, B = 800, seed = 12345): Interval & { point: number } {
  const point = stat(xs)
  if (xs.length < 3) return { point, lo: NaN, hi: NaN, conf }
  const rnd = mulberry32(seed)
  const out: number[] = []
  const n = xs.length
  const buf = new Array(n)
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) buf[i] = xs[(rnd() * n) | 0]
    const v = stat(buf)
    if (isFinite(v)) out.push(v)
  }
  out.sort((a, b) => a - b)
  const α = (1 - conf) / 2
  return { point, lo: quantileSorted(out, α), hi: quantileSorted(out, 1 - α), conf }
}

// ---------------------------------------------------------------------------
// Shrinkage (empirical Bayes)
//
// The fix for small samples sitting at both ends of every league table. A rate
// is pulled toward the cohort mean by k pseudo-observations; k is estimated
// from the spread between groups rather than picked, and is published.
// ---------------------------------------------------------------------------
export const shrink = (x: number, n: number, m: number, k: number) => (x + k * m) / (n + k)

/** Method of moments on the between-group variance. If the groups differ no
 *  more than sampling alone would explain, k → ∞ and every group collapses to
 *  the cohort mean, which is the correct answer in that case. */
export function estimateK(groups: { x: number; n: number }[]): { k: number; m: number; between: number; within: number } {
  const totX = groups.reduce((a, g) => a + g.x, 0)
  const totN = groups.reduce((a, g) => a + g.n, 0)
  const m = totN ? totX / totN : NaN
  const usable = groups.filter(g => g.n > 0)
  if (usable.length < 2 || !isFinite(m) || m <= 0 || m >= 1) return { k: Infinity, m, between: NaN, within: NaN }
  const nbar = totN / usable.length
  const obs = usable.reduce((a, g) => a + (g.x / g.n - m) ** 2, 0) / (usable.length - 1)
  const within = (m * (1 - m)) / nbar
  const between = Math.max(0, obs - within)
  const k = between > 0 ? (m * (1 - m)) / between - 1 : Infinity
  return { k: Math.max(0, k), m, between, within }
}

// ---------------------------------------------------------------------------
// Correlation and variance explained
// ---------------------------------------------------------------------------
export function pearson(xs: number[], ys: number[]): { r: number; r2: number; n: number; lo: number; hi: number } {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return { r: NaN, r2: NaN, n, lo: NaN, hi: NaN }
  const mx = mean(xs), my = mean(ys)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  const r = sxy / Math.sqrt(sxx * syy)
  // Fisher z interval, so a correlation is never printed as a bare number.
  const z = 0.5 * Math.log((1 + r) / (1 - r))
  const se = 1 / Math.sqrt(n - 3)
  const lo = Math.tanh(z - 1.959964 * se), hi = Math.tanh(z + 1.959964 * se)
  return { r, r2: r * r, n, lo, hi }
}

/** Share of variance removed by grouping — the between/within idea behind
 *  ANOVA, used here to answer "how much of this chart is just the calendar". */
export function varianceExplained(values: number[], groups: (string | number)[]): number {
  const m = mean(values)
  const tot = values.reduce((a, x) => a + (x - m) ** 2, 0)
  const byG = new Map<string | number, number[]>()
  values.forEach((v, i) => {
    const g = groups[i]
    if (!byG.has(g)) byG.set(g, [])
    byG.get(g)!.push(v)
  })
  let within = 0
  for (const xs of byG.values()) {
    const gm = mean(xs)
    within += xs.reduce((a, x) => a + (x - gm) ** 2, 0)
  }
  return tot ? 1 - within / tot : NaN
}

// ---------------------------------------------------------------------------
// Decomposition
//
// An exact, additive split of a change into "the calendar was different" and
// "trade was different". Not a model: arithmetic. The two parts always sum
// back to the total, whatever is imputed for a day type that did not occur.
//
//   Δ = Σ_t (n1_t − n0_t)·r0_t   +   Σ_t n1_t·(r1_t − r0_t)
//        ^ calendar mix               ^ trading rate
// ---------------------------------------------------------------------------
export interface DayObs { key: string; value: number; secondary?: number }

export interface Decomposition {
  total0: number; total1: number; delta: number
  calendar: number; rate: number
  parts: { key: string; n0: number; n1: number; r0: number; r1: number; cal: number; rate: number; imputed: boolean }[]
  imputedTypes: string[]
}

export function decompose(base: DayObs[], now: DayObs[]): Decomposition {
  const keys = [...new Set([...base.map(d => d.key), ...now.map(d => d.key)])]
  const agg = (rows: DayObs[]) => {
    const n = new Map<string, number>(), s = new Map<string, number>()
    for (const r of rows) { n.set(r.key, (n.get(r.key) || 0) + 1); s.set(r.key, (s.get(r.key) || 0) + r.value) }
    return { n, s }
  }
  const A = agg(base), B = agg(now)
  const fallback = base.length ? base.reduce((a, r) => a + r.value, 0) / base.length : 0
  const parts = keys.map(k => {
    const n0 = A.n.get(k) || 0, n1 = B.n.get(k) || 0
    const imputed = n0 === 0
    const r0 = n0 ? (A.s.get(k) || 0) / n0 : fallback
    const r1 = n1 ? (B.s.get(k) || 0) / n1 : r0
    return { key: k, n0, n1, r0, r1, cal: (n1 - n0) * r0, rate: n1 * (r1 - r0), imputed: imputed && n1 > 0 }
  })
  const total0 = base.reduce((a, r) => a + r.value, 0)
  const total1 = now.reduce((a, r) => a + r.value, 0)
  return {
    total0, total1, delta: total1 - total0,
    calendar: parts.reduce((a, p) => a + p.cal, 0),
    rate: parts.reduce((a, p) => a + p.rate, 0),
    parts,
    imputedTypes: parts.filter(p => p.imputed).map(p => p.key),
  }
}

/** Two-factor split of a total: volume effect and rate effect, exact.
 *  rev = q · p  ⇒  Δrev = (q1−q0)·p0 + q1·(p1−p0) */
export function splitVolumeRate(q0: number, p0: number, q1: number, p1: number) {
  return { volume: (q1 - q0) * p0, rate: q1 * (p1 - p0), delta: q1 * p1 - q0 * p0 }
}

// ---------------------------------------------------------------------------
// Aggregation
//
// Pooling is a choice, not a neutral act. This returns the three defensible
// answers side by side so a page can show that the headline number moved
// because someone chose a weighting, not because the world changed.
// ---------------------------------------------------------------------------
export interface Stratum { key: string; aNum: number; aDen: number; bNum: number; bDen: number }

export function poolVsStratify(strata: Stratum[]) {
  const s = strata.filter(x => x.aDen > 0 && x.bDen > 0)
  const pooledA = s.reduce((a, x) => a + x.aNum, 0) / s.reduce((a, x) => a + x.aDen, 0)
  const pooledB = s.reduce((a, x) => a + x.bNum, 0) / s.reduce((a, x) => a + x.bDen, 0)
  const gaps = s.map(x => ({ key: x.key, a: x.aNum / x.aDen, b: x.bNum / x.bDen, gap: x.aNum / x.aDen - x.bNum / x.bDen, w: x.aDen + x.bDen }))
  const wTot = gaps.reduce((a, g) => a + g.w, 0)
  return {
    pooled: pooledA - pooledB,
    pooledA, pooledB,
    weighted: gaps.reduce((a, g) => a + g.gap * g.w, 0) / wTot,   // within-stratum, size-weighted
    equal: mean(gaps.map(g => g.gap)),                             // every stratum counts once
    gaps,
    reversals: gaps.filter(g => Math.sign(g.gap) !== Math.sign(pooledA - pooledB)).length,
  }
}

// ---------------------------------------------------------------------------
// The expected-day model
//
// A day is judged against days like it — same venue, same weekday, recent —
// and never against "the average day", which mixes Saturday into Monday and
// then calls the difference an anomaly.
//
// Public holidays are excluded from training and are never flagged: a holiday
// is a different trading day, not an outlier.
// ---------------------------------------------------------------------------
export interface JudgedDay {
  d: string; label: string; dow: number; holiday: string | null
  actual: number
  expected: number; lo: number; hi: number
  n: number                              // comparable days behind the expectation
  state: 'above' | 'below' | 'normal' | 'thin' | 'holiday'
  z: number
}

/**
 * How the expected range is built.
 *   mean   — centre and symmetric spread. Simple, and inflated by the same tail
 *            it is meant to detect, so it flags the high side one-sidedly.
 *   robust — median and interquartile spread. Describes the typical day and is
 *            immune to one enormous function, but the band is narrower, so MORE
 *            days land outside it, not fewer.
 *   log    — the same arithmetic on log revenue, so the range is multiplicative
 *            and asymmetric in dollars. On this data it is the best calibrated
 *            of the three, and the page says so with the counts rather than
 *            asserting it.
 */
export type BandMode = 'mean' | 'robust' | 'log'
export interface BandOpts { weeks: number; conf: number; mode: BandMode; minN: number }

export function judgeDays(
  series: { d: string; label: string; dow: number; holiday: string | null; rev: number }[],
  opts: BandOpts,
): JudgedDay[] {
  // Normalised IQR: the same quantity as a standard deviation for symmetric
  // data, but one $138k Anzac Day cannot move it.
  const iqr = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return (quantileSorted(s, 0.75) - quantileSorted(s, 0.25)) / 1.349
  }
  return series.map((row, i) => {
    if (row.holiday) {
      return { ...row, actual: row.rev, expected: NaN, lo: NaN, hi: NaN, n: 0, state: 'holiday' as const, z: NaN }
    }
    // Trailing same-weekday history, this day excluded. Out of sample by
    // construction: a day is never used to judge itself.
    const hist: number[] = []
    for (let j = i - 1; j >= 0 && hist.length < opts.weeks; j--) {
      const p = series[j]
      if (p.dow === row.dow && !p.holiday && p.rev > 0) hist.push(p.rev)
    }
    if (hist.length < opts.minN) {
      return { ...row, actual: row.rev, expected: NaN, lo: NaN, hi: NaN, n: hist.length, state: 'thin' as const, z: NaN }
    }
    const t = tCrit(opts.conf, hist.length - 1)
    let c: number, lo: number, hi: number, z: number
    if (opts.mode === 'log') {
      const L = hist.map(Math.log)
      const cl = mean(L), sl = sd(L)
      const half = t * sl * Math.sqrt(1 + 1 / hist.length)
      c = Math.exp(cl); lo = Math.exp(cl - half); hi = Math.exp(cl + half)
      z = sl ? (Math.log(row.rev) - cl) / sl : NaN
    } else {
      const s = opts.mode === 'robust' ? iqr(hist) : sd(hist)
      c = opts.mode === 'robust' ? median(hist) : mean(hist)
      const half = t * s * Math.sqrt(1 + 1 / hist.length)   // prediction, not confidence
      lo = c - half; hi = c + half
      z = s ? (row.rev - c) / s : NaN
    }
    const state = row.rev > hi ? 'above' : row.rev < lo ? 'below' : 'normal'
    return { ...row, actual: row.rev, expected: c, lo, hi, n: hist.length, state: state as JudgedDay['state'], z }
  })
}

// ---------------------------------------------------------------------------
// Formatting helpers used only by Thinking pages
// ---------------------------------------------------------------------------
export function signedMoney(x: number): string {
  if (!isFinite(x)) return '—'
  const a = Math.abs(x)
  const s = x < 0 ? '−' : '+'
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'm'
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k'
  return s + '$' + Math.round(a)
}
export const signedPct = (x: number, d = 1) => (!isFinite(x) ? '—' : (x < 0 ? '−' : '+') + (Math.abs(x) * 100).toFixed(d) + '%')

/** Banded language for an effect size. The house rule against false precision:
 *  a one-window estimate has not earned a single-digit attribution claim. */
export function band(r2: number): string {
  if (!isFinite(r2)) return 'cannot be measured here'
  if (r2 < 0.02) return 'essentially nothing'
  if (r2 < 0.10) return 'very little'
  if (r2 < 0.25) return 'some'
  if (r2 < 0.50) return 'a good deal'
  return 'most of it'
}
