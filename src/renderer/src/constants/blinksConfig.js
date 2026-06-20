// Single source of truth for BPM bracket definitions.
// All boundaries, labels, colors, messages, and scoring live here.
// EyeTracker.jsx (getBpmBracket) and focusScore.js (computeFocusScore) are derived from this array.
// When changing a bracket, update only this file.
//
// scoreAtMin / scoreAtMax define a linear interpolation over [min, max).
// For flat brackets (A, C, F) both values are identical.
// Formula: round(scoreAtMin + (bpm - min) / (max - min) * (scoreAtMax - scoreAtMin))
// max: null means "no upper bound" (bracket F).

export const BPM_BRACKETS = [
  {
    id: 'A', label: 'Hyper-focus', min: 0, max: 6,
    color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20',
    msg: 'Blink intentionally — eye strain risk at this intensity.',
    scoreAtMin: 45, scoreAtMax: 45
  },
  {
    id: 'B', label: 'High focus', min: 6, max: 12,
    color: 'text-cyan-400', bg: null, msg: null,
    scoreAtMin: 70, scoreAtMax: 85
  },
  {
    id: 'C', label: 'Cruise focus', min: 12, max: 26,
    color: 'text-emerald-400', bg: null, msg: null,
    scoreAtMin: 100, scoreAtMax: 100
  },
  {
    id: 'D', label: 'Task friction', min: 26, max: 46,
    color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',
    msg: "Getting tough? Take a breath — you've got this.",
    scoreAtMin: 65, scoreAtMax: 45
  },
  {
    id: 'E', label: 'Mind drifting', min: 46, max: 66,
    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
    msg: "Mind drifting? Let's bring it back to the screen.",
    scoreAtMin: 40, scoreAtMax: 20
  },
  {
    id: 'F', label: 'Zoning out', min: 66, max: null,
    color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20',
    msg: "Looks like you're zoning out — try a short visual reset.",
    scoreAtMin: 10, scoreAtMax: 10
  }
]

export function findBracket(bpm) {
  if (!bpm || bpm === 0) return null
  return BPM_BRACKETS.find((b) => b.max === null ? bpm >= b.min : bpm >= b.min && bpm < b.max) ?? null
}

// ── Personalized (baseline-relative) rate scoring ──────────────────────────────
// Honest reframe: blink rate is mostly meaningful RELATIVE TO THE SAME PERSON, not
// against fixed population numbers (resting rate varies 3–30+/min with dry eyes,
// contacts, lighting, screen distance). Once we have learned a user's own engaged
// baseline (see usePomodoro), we score the deviation ratio r = currentBPM / baseline
// instead of the absolute brackets. The absolute BPM_BRACKETS above are the FALLBACK
// used only until a personal baseline exists (a user's first sessions).
//
// Curve over r (piecewise-linear, clamped at the ends):
//   r ≈ 1   → 100  (blinking around your own focused norm = ideal)
//   r ≪ 1   → high but tapered (quiet eyes = deep visual focus, slight strain risk)
//   r ≫ 1   → low  (well above your own norm = likely tiring / drifting)
export const REL_RATE_CURVE = [
  { r: 0.0, s: 60 },   // total suppression — deep focus but unsustainable / dry-eye risk
  { r: 0.4, s: 80 },
  { r: 0.7, s: 100 },  // a little quieter than usual is still excellent focus
  { r: 1.3, s: 100 },  // plateau of "around your usual"
  { r: 1.8, s: 72 },
  { r: 2.6, s: 35 },
  { r: 4.0, s: 15 }    // far above your usual — distracted / fatigued
]

export function computeRelativeRateScore(bpm, baseline) {
  if (!bpm || !baseline || baseline <= 0) return null
  const r = bpm / baseline
  const c = REL_RATE_CURVE
  if (r <= c[0].r) return c[0].s
  if (r >= c[c.length - 1].r) return c[c.length - 1].s
  for (let i = 1; i < c.length; i++) {
    if (r <= c[i].r) {
      const t = (r - c[i - 1].r) / (c[i].r - c[i - 1].r)
      return Math.round(c[i - 1].s + t * (c[i].s - c[i - 1].s))
    }
  }
  return c[c.length - 1].s
}

// Honest, baseline-relative STATE label for the live UI (replaces the absolute
// A–F cognitive-state claims when a personal baseline exists). Purely descriptive
// of "vs your own usual" — no dopamine/network claims stated as fact.
export function getRelativeState(bpm, baseline) {
  if (!bpm || !baseline || baseline <= 0) return null
  const r = bpm / baseline
  if (r < 0.5)  return { id: 'deep',  label: 'Quiet eyes',      color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20',
    msg: 'Blinking well below your usual — looks like deep focus. Remember to blink to avoid eye strain.' }
  if (r < 1.45) return { id: 'zone',  label: 'In your zone',    color: 'text-emerald-400', bg: null, msg: null }
  if (r < 2.0)  return { id: 'busy',  label: 'Busier than usual', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',
    msg: 'Blinking more than your usual — could be friction or early tiring. A breath might help.' }
  return { id: 'drift', label: 'Above your usual', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
    msg: "Blinking well above your usual — you may be drifting or tired. Try a short visual reset." }
}

// Session-level Focus Score tuning. The session score is the time-weighted average of the
// instantaneous (blink-based) cognitive score over on-screen time, scaled down by behavioural
// penalties and a rising-trend penalty:
//   finalScore = cognitiveAvg × presenceFactor × phoneFactor × driftFactor
// All knobs live here so the scoring can be tuned in one place. See docs/blinksInfo.md.
export const SCORE_CONFIG = {
  AWAY_EXP: 1.5,            // presenceFactor = (1 − awayFraction) ^ AWAY_EXP — >1 makes away-time bite harder
  PHONE_PICKUP_PENALTY: 0.09, // score lost per detected phone pickup (multiplicative)
  PHONE_PENALTY_CAP: 0.40,    // max total phone penalty
  DRIFT_WEIGHT: 1.0,       // how strongly an early→late cognitive decline is penalised
  DRIFT_CAP: 0.15,         // max drift penalty (kept modest — the average already captures most of it)
  MIN_PRESENT: 60,         // < this many on-screen seconds → score withheld (null)
  MIN_BLINKS: 3,           // < this many session blinks → score withheld (null)
  LOWCONF_PRESENT: 180,    // < this many on-screen seconds → low confidence
  LOWCONF_BLINKS: 8,       // < this many session blinks → low confidence
  AWAY_HIGH_THRESHOLD: 0.5, // away fraction above this → low confidence

  // Fatigue axis (PERCLOS + mean blink-closure duration). PERCLOS — the % of time the
  // eyes are closed — and long closures are the externally VALIDATED drowsiness markers
  // (driving-safety research), unlike the invented BPM brackets. They pull the session
  // score down multiplicatively, capped so they can flag fatigue without dominating.
  PERCLOS_FLOOR: 0.12,     // normal screen PERCLOS sits a few %; penalty starts above this
  PERCLOS_SPAN: 0.12,      // PERCLOS_FLOOR+SPAN (=0.24) reaches the full PERCLOS penalty
  PERCLOS_PENALTY: 0.15,   // max score fraction removed by PERCLOS alone
  CLOSURE_FLOOR_MS: 350,   // mean closure above this starts the long-closure penalty
  CLOSURE_SPAN_MS: 250,    // +250ms (=600ms) reaches full long-closure penalty
  CLOSURE_PENALTY: 0.10,   // max score fraction removed by long closures alone
  FATIGUE_CAP: 0.25,       // combined fatigue penalty ceiling

  // Personalized baseline (see computeRelativeRateScore / usePomodoro learning).
  BASELINE_MIN_CONF: 2,    // completed qualifying sessions before relative scoring engages
  BASELINE_ALPHA: 0.25,    // EMA weight when folding a new session's mean BPM into the baseline
  CV_MIN_INTERVALS: 6      // require this many inter-blink intervals before CV influences the score
}
