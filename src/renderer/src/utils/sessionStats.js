// Per-day session aggregates, each carrying the daily goal that was active that day.
//
// Each session may hold a `dailyGoalSeconds` snapshot (recorded at completion time).
// The last goal-bearing session of a day wins. Sessions/days without a snapshot
// (legacy data saved before snapshots existed) fall back to `currentGoal`, so the
// goal a day is measured against reflects what it was THAT day — not whatever the
// user has configured now.
//
// Returns a map keyed by local ISO date ('en-CA') →
//   { secs, scores[], pickups, count, goal }
export function buildDailyMap(sessions, currentGoal) {
  const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const map = {}
  for (const s of sorted) {
    const iso = new Date(s.date).toLocaleDateString('en-CA')
    if (!map[iso]) map[iso] = { secs: 0, scores: [], pickups: 0, count: 0, goal: currentGoal }
    const d = map[iso]
    d.secs += s.duration || 0
    d.count += 1
    d.pickups += s.phonePickups || 0
    if (s.focusScore != null) d.scores.push(s.focusScore)
    if (s.dailyGoalSeconds != null) d.goal = s.dailyGoalSeconds
  }
  return map
}
