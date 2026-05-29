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
