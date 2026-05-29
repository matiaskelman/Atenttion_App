import { findBracket } from '../constants/blinksConfig'

// Bracket C (12–25 BPM) is the optimal cruise — peak score 100.
// Bracket A (<6) is penalised despite high focus due to eye-strain risk.
// Scoring formula per bracket: linear interpolation between scoreAtMin and scoreAtMax.
export function computeFocusScore(bpm, cv) {
  if (!bpm) return null

  const bracket = findBracket(bpm)
  if (!bracket) return null

  let rateScore
  if (bracket.max === null || bracket.scoreAtMin === bracket.scoreAtMax) {
    rateScore = bracket.scoreAtMin
  } else {
    rateScore = Math.round(
      bracket.scoreAtMin +
      (bpm - bracket.min) / (bracket.max - bracket.min) * (bracket.scoreAtMax - bracket.scoreAtMin)
    )
  }

  if (cv === null || cv === undefined) return rateScore

  let rhythmScore
  if (cv < 0.40)      rhythmScore = 100
  else if (cv < 0.70) rhythmScore = Math.round(100 - (cv - 0.40) / 0.30 * 50)
  else                rhythmScore = Math.max(0, Math.round(50 - (cv - 0.70) / 0.30 * 50))

  return Math.round(rateScore * 0.55 + rhythmScore * 0.45)
}
