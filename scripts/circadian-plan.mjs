/**
 * Fixed-bin circadian day plan generator.
 *
 * We define a "day" as exactly TOTAL messages per agent, distributed across BINS time bins.
 * The distribution is "circadian-like": one peak + baseline + a bit of noise, normalized.
 *
 * Deterministic: uses a seeded PRNG from (userId, dayIndex) so runs are reproducible.
 */

function fnv1a32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // 32-bit FNV-1a prime
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function xorshift32(seed) {
  let x = seed >>> 0
  return () => {
    // xorshift32
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 0xffffffff
  }
}

function gaussianWeight(dist, sigma) {
  const z = dist / sigma
  return Math.exp(-0.5 * z * z)
}

function circularDistance(a, b, mod) {
  const d = Math.abs(a - b) % mod
  return Math.min(d, mod - d)
}

function normalize(weights) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return weights.map(() => 1 / weights.length)
  return weights.map((w) => w / sum)
}

function sampleIndex(rng, probs) {
  const r = rng()
  let acc = 0
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i]
    if (r <= acc) return i
  }
  return probs.length - 1
}

export function peakBinFromPeakHour({ peakHourLocal, bins }) {
  const h = typeof peakHourLocal === 'number' ? peakHourLocal : 18
  const p = Math.round(((h % 24) / 24) * bins) % bins
  return p
}

export function generateDayPlan({
  userId,
  dayIndex,
  bins = 48,
  total = 20,
  peakBin = null,
  sigmaBins = null,
  baseline = 0.08,
  noise = 0.25,
} = {}) {
  if (!userId && userId !== '0') throw new Error('userId required')
  if (!Number.isFinite(dayIndex)) throw new Error('dayIndex required')
  if (!Number.isFinite(bins) || bins <= 0) throw new Error('bins must be > 0')
  if (!Number.isFinite(total) || total < 0) throw new Error('total must be >= 0')

  const seed = fnv1a32(`${userId}:${dayIndex}`)
  const rng = xorshift32(seed)

  const p =
    peakBin === null || !Number.isFinite(peakBin) ? Math.floor(rng() * bins) : (peakBin % bins)
  const sigma =
    sigmaBins === null || !Number.isFinite(sigmaBins) ? Math.max(2, Math.floor(bins / 8)) : sigmaBins

  const weights = []
  for (let t = 0; t < bins; t++) {
    const dist = circularDistance(t, p, bins)
    const base = baseline
    const bump = gaussianWeight(dist, sigma)
    const n = 1 + noise * (rng() - 0.5) * 2 // [1-noise, 1+noise]
    weights.push((base + bump) * n)
  }

  const probs = normalize(weights)

  // Multinomial via repeated categorical draws (deterministic via rng).
  const counts = Array.from({ length: bins }, () => 0)
  for (let k = 0; k < total; k++) {
    const idx = sampleIndex(rng, probs)
    counts[idx] += 1
  }

  return {
    bins,
    total,
    peakBin: p,
    sigmaBins: sigma,
    probs,
    counts,
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function sampleGeometricLength(rng, mean, min = 1, max = 24) {
  // Geometric-like via exponential draw, clamped
  const u = clamp(rng(), 1e-9, 1 - 1e-9)
  const x = Math.ceil(-Math.log(1 - u) * mean)
  return clamp(x, min, max)
}

function sampleExpOffset(rng, len, tau) {
  // sample offset 0..len-1 with probability ~ exp(-offset/tau)
  const weights = []
  for (let i = 0; i < len; i++) weights.push(Math.exp(-i / tau))
  const probs = normalize(weights)
  return sampleIndex(rng, probs)
}

/**
 * Bursty, session-based plan across bins.
 *
 * Still enforces EXACT total messages for the day, but clusters them into sessions
 * that span multiple adjacent bins.
 */
export function generateBurstyDayPlan({
  userId,
  dayIndex,
  bins = 48,
  total = 20,
  peakBin = null,
  sigmaBins = null,
  baseline = 0.08,
  noise = 0.25,
  // session controls (in bins)
  sessionLenMeanBins = 3,
  sessionLenMinBins = 2,
  sessionLenMaxBins = 10,
  // messages per session
  sessionMsgMean = 3.5,
  sessionMsgMax = 6,
} = {}) {
  if (!userId && userId !== '0') throw new Error('userId required')
  if (!Number.isFinite(dayIndex)) throw new Error('dayIndex required')
  if (!Number.isFinite(bins) || bins <= 0) throw new Error('bins must be > 0')
  if (!Number.isFinite(total) || total < 0) throw new Error('total must be >= 0')

  const seed = fnv1a32(`${userId}:${dayIndex}:bursty`)
  const rng = xorshift32(seed)

  const p =
    peakBin === null || !Number.isFinite(peakBin) ? Math.floor(rng() * bins) : (peakBin % bins)
  const sigma =
    sigmaBins === null || !Number.isFinite(sigmaBins) ? Math.max(2, Math.floor(bins / 8)) : sigmaBins

  // Circadian start distribution
  const weights = []
  for (let t = 0; t < bins; t++) {
    const dist = circularDistance(t, p, bins)
    const base = baseline
    const bump = gaussianWeight(dist, sigma)
    const n = 1 + noise * (rng() - 0.5) * 2
    weights.push((base + bump) * n)
  }
  const startProbs = normalize(weights)

  const counts = Array.from({ length: bins }, () => 0)
  const sessions = []

  let remaining = total
  while (remaining > 0) {
    const startBin = sampleIndex(rng, startProbs)
    const len = sampleGeometricLength(
      rng,
      sessionLenMeanBins,
      sessionLenMinBins,
      sessionLenMaxBins,
    )

    // choose messages in this session
    const msgCount = clamp(
      sampleGeometricLength(rng, sessionMsgMean, 1, sessionMsgMax),
      1,
      remaining,
    )

    // allocate messages across session bins with a decay so replies cluster early
    const tau = Math.max(1, len / 3)
    for (let i = 0; i < msgCount; i++) {
      const offset = sampleExpOffset(rng, len, tau)
      const binIdx = (startBin + offset) % bins
      counts[binIdx] += 1
    }

    sessions.push({ startBin, lenBins: len, msgCount })
    remaining -= msgCount
  }

  return {
    bins,
    total,
    peakBin: p,
    sigmaBins: sigma,
    counts,
    sessions,
  }
}


