import { findBracket, computeRelativeRateScore, SCORE_CONFIG } from '../constants/blinksConfig'

// INSTANTANEOUS focus estimate (the live blink signal): blink RATE 55% + RHYTHM/variability 45%.
// Updated live as blinks/rate change. The SESSION score (computeSessionScore below) is the
// time-weighted average of this over on-screen time, scaled by behavioural + fatigue penalties.
//
// RATE scoring is PERSONALIZED when a learned baseline is supplied (`baselineBpm`): the score
// reflects how far the current rate sits from THIS user's own engaged norm — defensible, unlike
// fixed population thresholds. Without a baseline (new user) it falls back to the absolute
// BPM_BRACKETS. This is an estimate, not a measurement: blink rate is also affected by dry eyes,
// contacts, lighting and screen distance.
export function computeFocusScore(bpm, cv, baselineBpm = null) {
  if (!bpm) return null

  let rateScore = computeRelativeRateScore(bpm, baselineBpm)
  if (rateScore === null) {
    // Fallback: absolute brackets (used until a personal baseline has been learned)
    const bracket = findBracket(bpm)
    if (!bracket) return null
    if (bracket.max === null || bracket.scoreAtMin === bracket.scoreAtMax) {
      rateScore = bracket.scoreAtMin
    } else {
      rateScore = Math.round(
        bracket.scoreAtMin +
        (bpm - bracket.min) / (bracket.max - bracket.min) * (bracket.scoreAtMax - bracket.scoreAtMin)
      )
    }
  }

  if (cv === null || cv === undefined) return rateScore

  let rhythmScore
  if (cv < 0.40)      rhythmScore = 100
  else if (cv < 0.70) rhythmScore = Math.round(100 - (cv - 0.40) / 0.30 * 50)
  else                rhythmScore = Math.max(0, Math.round(50 - (cv - 0.70) / 0.30 * 50))

  return Math.round(rateScore * 0.55 + rhythmScore * 0.45)
}

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

// SESSION Focus Score — the reliable, whole-session number shown in Stats and saved per session.
//   finalScore = cognitiveAvg × presenceFactor × phoneFactor × driftFactor
// Inputs:
//   cognitiveAvg   — time-weighted mean of computeFocusScore over on-screen frames (0–100, or null)
//   cogSamples     — array of cognitive-score samples taken across the session (for the drift trend)
//   awaySeconds    — seconds the user looked away / left the screen during the session
//   phonePickups   — number of phone pickups detected during the session
//   duration       — counted on-task seconds (timer freezes during away/phone pauses)
//   presentSeconds — accumulated on-screen seconds that actually fed the cognitive average
//   blinkCount     — blinks recorded during the session
//   perclos        — session PERCLOS (fraction of valid frames with eyes closed); fatigue marker
//   meanClosureMs  — session mean blink-closure duration in ms; long closures = drowsiness
// Returns { score, confidence } where confidence is 'high' | 'low' | null (null ⇒ withhold "—").
export function computeSessionScore({
  cognitiveAvg, cogSamples = [], awaySeconds = 0, phonePickups = 0,
  duration = 0, presentSeconds = 0, blinkCount = 0, perclos = 0, meanClosureMs = 0
}) {
  // Withhold when there simply isn't enough data to trust a number.
  if (cognitiveAvg == null
      || presentSeconds < SCORE_CONFIG.MIN_PRESENT
      || blinkCount < SCORE_CONFIG.MIN_BLINKS) {
    return { score: null, confidence: null }
  }

  // Away-time: super-linear so moderate distraction hurts more than a flat fraction.
  const window = duration + awaySeconds
  const awayFraction = window > 0 ? Math.min(1, awaySeconds / window) : 0
  const presenceFactor = Math.pow(1 - awayFraction, SCORE_CONFIG.AWAY_EXP)

  // Phone pickups: heavier, capped, multiplicative penalty.
  const phoneFactor = 1 - Math.min(phonePickups * SCORE_CONFIG.PHONE_PICKUP_PENALTY, SCORE_CONFIG.PHONE_PENALTY_CAP)

  // Drift: compare the first third vs the last third of the session's cognitive samples.
  // A decline (rising BPM and/or rising variability ⇒ lower late score) is penalised; an
  // improvement never inflates the score. Needs enough samples for thirds to be meaningful.
  let driftFactor = 1
  if (Array.isArray(cogSamples) && cogSamples.length >= 6) {
    const third = Math.floor(cogSamples.length / 3)
    const decline = Math.max(0, (mean(cogSamples.slice(0, third)) - mean(cogSamples.slice(-third))) / 100)
    driftFactor = 1 - Math.min(decline * SCORE_CONFIG.DRIFT_WEIGHT, SCORE_CONFIG.DRIFT_CAP)
  }

  // Fatigue: PERCLOS (eyes-closed fraction) + long mean blink closures. These are the
  // validated drowsiness markers, applied as a small capped multiplicative penalty.
  const perclosPen = Math.min(1, Math.max(0, (perclos - SCORE_CONFIG.PERCLOS_FLOOR) / SCORE_CONFIG.PERCLOS_SPAN)) * SCORE_CONFIG.PERCLOS_PENALTY
  const closurePen = Math.min(1, Math.max(0, (meanClosureMs - SCORE_CONFIG.CLOSURE_FLOOR_MS) / SCORE_CONFIG.CLOSURE_SPAN_MS)) * SCORE_CONFIG.CLOSURE_PENALTY
  const fatigueFactor = 1 - Math.min(perclosPen + closurePen, SCORE_CONFIG.FATIGUE_CAP)

  const score = Math.max(0, Math.min(100,
    Math.round(cognitiveAvg * presenceFactor * phoneFactor * driftFactor * fatigueFactor)))

  const lowConfidence = presentSeconds < SCORE_CONFIG.LOWCONF_PRESENT
    || blinkCount < SCORE_CONFIG.LOWCONF_BLINKS
    || awayFraction > SCORE_CONFIG.AWAY_HIGH_THRESHOLD

  return { score, confidence: lowConfidence ? 'low' : 'high' }
}
