// Turns a session's stored score factors into a human-readable "Why this score?" ledger.
//
// The Focus Score model is SUBTRACTIVE: a blink-focus `base` the session earns (the only positive),
// then four factors (presence, phone, drift, fatigue) that are each ≤ 1 and can only reduce it. So
// the explanation is a +/− ledger: `+base`, then a `−N` line per penalty that actually cost points,
// reconciling to the session's stored final score.
//
// IMPORTANT: this maps the raw factors to plain language + approximate point costs. It deliberately
// does NOT expose any tuning constant, weight, PERCLOS %, closure-ms or formula — only real-world
// values (minutes away, phone pickups), a qualitative impact, and a rounded point delta.

// Away time with seconds for sub-minute values: "45s" / "1m 30s" / "1h 5m".
function formatAway(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h ${m}m`
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

// |pts| → qualitative impact of a deduction on the final score.
function impactOf(absPts) {
  if (absPts <= 3) return 'slight'
  if (absPts <= 9) return 'moderate'
  return 'large'
}

function baseNote(cv, base) {
  let rhythm
  if (cv === null || cv === undefined) rhythm = 'from your blink rate'
  else if (cv < 0.4) rhythm = 'steady blink rhythm'
  else if (cv < 0.7) rhythm = 'somewhat variable blink rhythm'
  else rhythm = 'irregular blink rhythm'
  const strength = base >= 75 ? 'Strong' : base >= 50 ? 'Moderate' : 'Lower'
  return `${strength} base — ${rhythm}`
}

function buildSummary(base, deductions) {
  if (deductions.length === 0) {
    return 'You stayed present and steady the whole way — nothing pulled this session down.'
  }
  const top = deductions.reduce((a, b) => (Math.abs(b.pts) > Math.abs(a.pts) ? b : a))
  const lead = base >= 75 ? 'A strong base, but ' : ''
  const cap = (str) => (lead ? str : str.charAt(0).toUpperCase() + str.slice(1))
  const phrase = {
    presence: `the time you spent away from the screen was what held this back the most`,
    phone: `picking up your phone was the main thing trimming this score`,
    drift: `your focus tapered toward the end, the biggest drag here`,
    fatigue: `signs of eye fatigue late in the session were the main thing lowering this`
  }[top.key]
  return `${lead}${cap(phrase)}.`
}

// Returns null when there's no stored breakdown to explain (old sessions, or a withheld "—" score).
// Otherwise returns { base, deductions, positives, final, summary } for the ledger UI.
export function explainScore(session) {
  const b = session?.scoreBreakdown
  if (!b || session.focusScore == null) return null

  const base = b.base
  const final = session.focusScore

  // Waterfall: apply factors in order; each step's drop is that penalty's point cost.
  const factors = [
    {
      key: 'presence',
      label: 'Time away',
      value: session.awaySeconds ? formatAway(session.awaySeconds) : 'none',
      good: 'Stayed on screen',
      factor: b.presence
    },
    {
      key: 'phone',
      label: 'Phone pickups',
      value: (session.phonePickups ?? 0) > 0
        ? `${session.phonePickups} pickup${session.phonePickups === 1 ? '' : 's'}`
        : 'none',
      good: 'No phone pickups',
      factor: b.phone
    },
    {
      key: 'drift',
      label: 'Focus drift',
      value: 'tapered toward the end',
      good: 'Held focus steadily',
      factor: b.drift
    },
    {
      key: 'fatigue',
      label: 'Eye fatigue',
      value: 'slower / longer blinks',
      good: 'No fatigue signs',
      factor: b.fatigue
    }
  ]

  let running = base
  const rounded = factors.map((f) => {
    const next = running * (f.factor ?? 1)
    const pts = Math.round(next - running)
    running = next
    return { ...f, pts }
  })

  // Reconcile rounding so the ledger adds up exactly to the stored final score: push the residual
  // onto the largest-magnitude deduction (or fatigue if none moved).
  const target = final - base
  const sum = rounded.reduce((a, f) => a + f.pts, 0)
  const residual = target - sum
  if (residual !== 0) {
    const idx = rounded.reduce(
      (best, f, i) => (Math.abs(f.pts) > Math.abs(rounded[best].pts) ? i : best),
      rounded.length - 1
    )
    rounded[idx] = { ...rounded[idx], pts: rounded[idx].pts + residual }
  }

  const deductions = []
  const positives = []
  for (const f of rounded) {
    if (f.pts < 0) {
      deductions.push({ key: f.key, label: f.label, value: f.value, pts: f.pts, impact: impactOf(Math.abs(f.pts)) })
    } else {
      positives.push(f.good)
    }
  }

  return {
    base: { label: 'Blink focus', value: base, note: baseNote(session.blinkVariability, base) },
    deductions,
    positives,
    final,
    summary: buildSummary(base, deductions)
  }
}
