import {
  Trophy, Clock, Layers, Flame, Gauge, Target, ShieldCheck, Sparkles, CalendarDays,
  Timer, Sunrise, Sunset, Moon, Star, Gem, Undo2, CalendarHeart, Brain, PenLine,
  Compass, CheckCircle2, Circle, Crosshair, Eye, Sun, Rocket, Shield, Crown, Coffee
} from 'lucide-react'
import { useStore } from '../../store'
import { formatDuration } from '../../utils/format'
import { buildDailyMap } from '../../utils/sessionStats'

function MilestoneTrack({ icon: Icon, title, hint, current, valueLabel, milestones, milestoneLabel, remainingLabel, accent }) {
  const next = milestones.find((m) => m > current) ?? null
  const prev = [...milestones].filter((m) => m <= current).pop() ?? 0
  const pct = next ? Math.round(((current - prev) / (next - prev)) * 100) : 100
  const earned = milestones.filter((m) => current >= m).length

  return (
    <div className="card flex flex-col">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <Icon size={13} className={accent.icon} /> {title}
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4">{hint}</p>

      <div className="flex items-end justify-between mb-2">
        <span className="text-2xl font-semibold text-neutral-100">{valueLabel}</span>
        <span className="text-[10px] text-neutral-600">{earned}/{milestones.length} badges</span>
      </div>

      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${accent.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-neutral-600 mb-4">
        {next ? remainingLabel(next - current, next) : 'Top milestone reached — legend.'}
      </p>

      <div className="flex flex-wrap gap-1.5 mt-auto">
        {milestones.map((m) => {
          const done = current >= m
          return (
            <span
              key={m}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border ${done ? accent.chip : 'border-surface-3 text-neutral-700'}`}
            >
              {milestoneLabel(m)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function computeAchievements(sessions, dailyGoalSeconds) {
  const hasSession = new Set(sessions.map((s) => new Date(s.date).toLocaleDateString('en-CA')))
  // Per-day map carries each day's own goal (snapshot per session) — goal-based
  // achievements are measured against the goal that was active that day.
  const byDay = buildDailyMap(sessions, dailyGoalSeconds)

  // Comeback: a gap of ≥7 days between two consecutive sessions.
  const times = sessions.map((s) => new Date(s.date).getTime()).sort((a, b) => a - b)
  let comeback = false
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] >= 7 * 86400000) { comeback = true; break }
  }

  // Weekend warrior: a Saturday with a session and the following Sunday too.
  let weekendWarrior = false
  for (const iso of hasSession) {
    const d = new Date(iso + 'T00:00:00')
    if (d.getDay() === 6) {
      const sun = new Date(d); sun.setDate(d.getDate() + 1)
      if (hasSession.has(sun.toLocaleDateString('en-CA'))) { weekendWarrior = true; break }
    }
  }

  const dayValues = Object.values(byDay)
  const fullFocusDay = dayValues.some((d) => d.secs >= 4 * 3600)
  const goalCrusher = dayValues.some((d) => d.goal > 0 && d.secs >= 2 * d.goal)

  const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date))

  const laserFocus = sessions.some((s) => !(s.phonePickups > 0) && !(s.awaySeconds > 0) && (s.focusScore ?? 0) >= 90)
  const mindfulStart = sessions.some((s) => s.goal && s.goal.trim() && s.outcomeRating === 3)

  // Self-aware: self-rating matched the algorithm's bracket at least 5 times.
  const algoBracket = (score) => (score >= 80 ? 3 : score >= 50 ? 2 : 1)
  let selfMatches = 0
  sessions.forEach((s) => {
    if (s.outcomeRating != null && s.focusScore != null && algoBracket(s.focusScore) === s.outcomeRating) selfMatches++
  })
  const selfAware = selfMatches >= 5

  // Rebound: a Flow session immediately after a Scattered one.
  let rebound = false
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].outcomeRating === 1 && sorted[i].outcomeRating === 3) { rebound = true; break }
  }

  // All-Nighter: 60+ combined focus minutes between 00:00 and 06:00 in one night.
  // Hours 0–5 all fall on the same calendar date, so grouping by local ISO date
  // keeps a single night's sessions together.
  const nightSecs = {}
  sessions.forEach((s) => {
    const d = new Date(s.date)
    if (d.getHours() < 6) {
      const iso = d.toLocaleDateString('en-CA')
      nightSecs[iso] = (nightSecs[iso] || 0) + (s.duration || 0)
    }
  })
  const allNighter = Object.values(nightSecs).some((secs) => secs >= 3600)

  // Distraction-free week: any 7-day window with ≥3 sessions and 0 phone pickups.
  let distractionFreeWeek = false
  const ts = sorted.map((s) => ({ time: new Date(s.date).getTime(), pickups: s.phonePickups || 0 }))
  for (let i = 0; i < ts.length; i++) {
    const end = ts[i].time + 7 * 86400000
    let count = 0, pk = 0
    for (let j = i; j < ts.length && ts[j].time < end; j++) { count++; pk += ts[j].pickups }
    if (count >= 3 && pk === 0) { distractionFreeWeek = true; break }
  }

  return [
    { icon: Timer, label: 'Marathon', desc: 'A single 60-min+ session',
      earned: sessions.some((s) => (s.duration || 0) >= 3600) },
    { icon: Sunrise, label: 'Early Bird', desc: 'Focused before 7am',
      earned: sessions.some((s) => new Date(s.date).getHours() < 7) },
    { icon: Moon, label: 'Night Owl', desc: 'Focused after 11pm',
      earned: sessions.some((s) => new Date(s.date).getHours() >= 23) },
    { icon: Coffee, label: 'All-Nighter', desc: '60 min focused between 12am–6am', earned: allNighter },
    { icon: Gem, label: 'Deep Diver', desc: 'A session scored ≥ 95',
      earned: sessions.some((s) => (s.focusScore ?? 0) >= 95) },
    { icon: Crosshair, label: 'Laser Focus', desc: '0 distractions, score ≥ 90', earned: laserFocus },
    { icon: Star, label: 'Perfect Day', desc: 'Hit goal, all sessions ≥ 80',
      earned: dayValues.some((d) => d.goal > 0 && d.secs >= d.goal && d.scores.length > 0 && d.scores.every((x) => x >= 80)) },
    { icon: Crown, label: 'Goal Crusher', desc: 'Doubled your daily goal in a day', earned: goalCrusher },
    { icon: Sun, label: 'Full Focus Day', desc: '4+ focused hours in a day', earned: fullFocusDay },
    { icon: Brain, label: 'Mindful Start', desc: 'Set an intention, hit Flow', earned: mindfulStart },
    { icon: Eye, label: 'Self-Aware', desc: 'Your rating matched the score 5×', earned: selfAware },
    { icon: Rocket, label: 'Rebound', desc: 'Flow right after a Scattered session', earned: rebound },
    { icon: Shield, label: 'Distraction-Free Week', desc: '7 days, 0 phone pickups', earned: distractionFreeWeek },
    { icon: Undo2, label: 'Comeback', desc: 'Returned after a 7-day gap', earned: comeback },
    { icon: CalendarHeart, label: 'Weekend Warrior', desc: 'Focused Sat & Sun', earned: weekendWarrior },
  ]
}

function GettingStartedCard({ sessions, dailyGoalSeconds, workDuration, focusWallpaperEnabled, overlayEnabled, featuresUsed }) {
  // Each day measured against its own (snapshotted) goal; a past day that hit its
  // goal stays checked even if the goal later changes.
  const dayHitGoal = Object.values(buildDailyMap(sessions, dailyGoalSeconds))
    .some((d) => d.goal > 0 && d.secs >= d.goal)

  // Config-based items latch: once you've ever done it (featuresUsed flag), it stays
  // checked even if you later turn it off or revert to the default.
  const items = [
    { label: 'Complete your first focus session', done: sessions.length >= 1 },
    { label: 'Try eye tracking', done: sessions.some((s) => s.focusScore != null || (s.blinkCount || 0) > 0) },
    { label: 'Set a session intention', done: sessions.some((s) => (s.goal && s.goal.trim()) || s.ritual) },
    { label: 'Rate a session afterward', done: sessions.some((s) => s.outcomeRating != null) },
    { label: 'Hit your daily goal', done: dayHitGoal },
    { label: 'Personalize your timer', done: workDuration !== 25 * 60 || !!featuresUsed?.customTimer },
    { label: 'Set your own daily goal', done: dailyGoalSeconds !== 4 * 3600 || !!featuresUsed?.customGoal },
    { label: 'Turn on Focus Wallpaper', done: !!focusWallpaperEnabled || !!featuresUsed?.focusWallpaper },
    { label: 'Turn on the Minimized Overlay', done: !!overlayEnabled || !!featuresUsed?.overlay },
    { label: 'Try an ambient sound', done: !!featuresUsed?.audio },
    { label: 'Export your data', done: !!featuresUsed?.export },
  ]
  const done = items.filter((i) => i.done).length
  const pct = Math.round((done / items.length) * 100)

  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <Compass size={13} className="text-violet-400" /> Getting Started
        <span className="text-[10px] text-neutral-600 font-normal ml-auto">{done}/{items.length} explored</span>
      </h3>
      <p className="text-[10px] text-neutral-600 mb-3">Discover what Atenttion can do.</p>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-violet-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            {it.done
              ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              : <Circle size={14} className="text-neutral-700 shrink-0" />}
            <span className={`text-xs ${it.done ? 'text-neutral-400 line-through' : 'text-neutral-300'}`}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AchievementsCard({ sessions, dailyGoalSeconds }) {
  const badges = computeAchievements(sessions, dailyGoalSeconds)
  const earned = badges.filter((b) => b.earned).length

  return (
    <div className="card mt-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Trophy size={13} className="text-amber-400" /> Achievements
        <span className="text-[10px] text-neutral-600 font-normal ml-auto">{earned}/{badges.length} unlocked</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {badges.map((b) => (
          <div
            key={b.label}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${b.earned ? 'border-violet-500/30 bg-violet-500/5' : 'border-surface-3 bg-surface-2/40 opacity-60'}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${b.earned ? 'bg-violet-500/15' : 'bg-surface-3'}`}>
              <b.icon size={15} className={b.earned ? 'text-violet-300' : 'text-neutral-600'} />
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-medium ${b.earned ? 'text-neutral-200' : 'text-neutral-500'}`}>{b.label}</p>
              <p className="text-[9px] text-neutral-600 leading-snug">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MilestonesPage() {
  const sessions = useStore((s) => s.sessions)
  const bestStreak = useStore((s) => s.bestStreak)
  const dailyGoalSeconds = useStore((s) => s.dailyGoalSeconds)
  const baselineBpmConfidence = useStore((s) => s.baselineBpmConfidence)
  const workDuration = useStore((s) => s.workDuration)
  const focusWallpaperEnabled = useStore((s) => s.focusWallpaperEnabled)
  const overlayEnabled = useStore((s) => s.overlayEnabled)
  const featuresUsed = useStore((s) => s.featuresUsed)

  const totalSecs = sessions.reduce((a, s) => a + (s.duration || 0), 0)
  const deepSecs = sessions.reduce((a, s) => a + (s.focusScore != null && s.focusScore >= 80 ? (s.duration || 0) : 0), 0)
  const intentionsCount = sessions.filter((s) => (s.goal && s.goal.trim()) || s.ritual).length
  const mornings = sessions.filter((s) => new Date(s.date).getHours() < 12).length
  const evenings = sessions.filter((s) => new Date(s.date).getHours() >= 18).length

  // Per-day totals carrying each day's own goal (snapshot per session).
  const dayMap = buildDailyMap(sessions, dailyGoalSeconds)
  const activeDays = Object.keys(dayMap).length

  // Current goal-hit streak: consecutive days reaching THAT day's goal, ending
  // today (or yesterday if today isn't done yet so an unfinished day won't break it).
  const isoOf = (d) => d.toLocaleDateString('en-CA')
  const dayHit = (iso) => {
    const e = dayMap[iso]
    const g = e?.goal ?? dailyGoalSeconds
    return g > 0 && (e?.secs || 0) >= g
  }
  let goalStreak = 0
  {
    const cur = new Date(); cur.setHours(0, 0, 0, 0)
    if (!dayHit(isoOf(cur))) cur.setDate(cur.getDate() - 1)
    while (dayHit(isoOf(cur))) {
      goalStreak++
      cur.setDate(cur.getDate() - 1)
    }
  }

  const distractionFree = sessions.filter((s) => !(s.phonePickups > 0) && !(s.awaySeconds > 0)).length
  const flowSessions = sessions.filter((s) => s.outcomeRating === 3).length

  const tracks = [
    {
      icon: Clock,
      title: 'Focus Hours',
      hint: 'Total time spent in focus sessions',
      current: totalSecs / 3600,
      valueLabel: formatDuration(totalSecs),
      milestones: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      milestoneLabel: (m) => `${m}h`,
      remainingLabel: (diff, next) => `${diff < 1 ? Math.round(diff * 60) + 'm' : diff.toFixed(1) + 'h'} to your ${next}h badge`,
      accent: { icon: 'text-violet-400', bar: 'bg-violet-500', chip: 'border-violet-500/40 bg-violet-500/10 text-violet-300' },
    },
    {
      icon: Layers,
      title: 'Sessions Completed',
      hint: 'Number of focus sessions finished',
      current: sessions.length,
      valueLabel: `${sessions.length}`,
      milestones: [1, 10, 25, 50, 100, 250, 500, 1000],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-session badge`,
      accent: { icon: 'text-amber-400', bar: 'bg-amber-500', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
    },
    {
      icon: CalendarDays,
      title: 'Active Days',
      hint: 'Distinct days you’ve focused (gaps allowed)',
      current: activeDays,
      valueLabel: `${activeDays}`,
      milestones: [1, 7, 30, 100, 365],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more days to your ${next}-day badge`,
      accent: { icon: 'text-cyan-400', bar: 'bg-cyan-500', chip: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' },
    },
    {
      icon: Flame,
      title: 'Best Streak',
      hint: 'Longest run of consecutive focus days',
      current: bestStreak,
      valueLabel: bestStreak ? `${bestStreak}d` : '0d',
      milestones: [3, 7, 14, 30, 60, 100, 365],
      milestoneLabel: (m) => `${m}d`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more days to your ${next}-day badge`,
      accent: { icon: 'text-orange-400', bar: 'bg-orange-500', chip: 'border-orange-500/40 bg-orange-500/10 text-orange-300' },
    },
    {
      icon: Target,
      title: 'Goal-Hit Streak',
      hint: 'Consecutive days reaching your daily goal',
      current: goalStreak,
      valueLabel: `${goalStreak}d`,
      milestones: [3, 7, 14, 30, 60, 100],
      milestoneLabel: (m) => `${m}d`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more days to your ${next}-day badge`,
      accent: { icon: 'text-rose-400', bar: 'bg-rose-500', chip: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
    },
    {
      icon: ShieldCheck,
      title: 'Distraction-Free Sessions',
      hint: 'Sessions with no phone pickups or away time',
      current: distractionFree,
      valueLabel: `${distractionFree}`,
      milestones: [1, 10, 25, 100, 250],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-session badge`,
      accent: { icon: 'text-teal-400', bar: 'bg-teal-500', chip: 'border-teal-500/40 bg-teal-500/10 text-teal-300' },
    },
    {
      icon: Sparkles,
      title: 'Flow States',
      hint: 'Sessions you rated “Flow”',
      current: flowSessions,
      valueLabel: `${flowSessions}`,
      milestones: [1, 5, 25, 50, 100],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-flow badge`,
      accent: { icon: 'text-fuchsia-400', bar: 'bg-fuchsia-500', chip: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300' },
    },
    {
      icon: Gauge,
      title: 'Deep Work Hours',
      hint: 'Time spent in high focus (score ≥ 80)',
      current: deepSecs / 3600,
      valueLabel: formatDuration(deepSecs),
      milestones: [1, 5, 10, 25, 50, 100],
      milestoneLabel: (m) => `${m}h`,
      remainingLabel: (diff, next) => `${diff < 1 ? Math.round(diff * 60) + 'm' : diff.toFixed(1) + 'h'} to your ${next}h badge`,
      accent: { icon: 'text-emerald-400', bar: 'bg-emerald-500', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
    },
    {
      icon: Brain,
      title: 'Calibration',
      hint: 'Qualifying sessions in your personal blink baseline — scoring personalizes at 2',
      current: baselineBpmConfidence || 0,
      valueLabel: `${baselineBpmConfidence || 0}`,
      milestones: [1, 2, 5, 10, 20],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more sessions to your ${next}-session badge`,
      accent: { icon: 'text-indigo-400', bar: 'bg-indigo-500', chip: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' },
    },
    {
      icon: PenLine,
      title: 'Intentions Set',
      hint: 'Sessions started with a goal in mind',
      current: intentionsCount,
      valueLabel: `${intentionsCount}`,
      milestones: [1, 5, 25, 50, 100],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-intention badge`,
      accent: { icon: 'text-purple-400', bar: 'bg-purple-500', chip: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
    },
    {
      icon: Sunrise,
      title: 'Mornings Focused',
      hint: 'Sessions started before noon',
      current: mornings,
      valueLabel: `${mornings}`,
      milestones: [1, 10, 25, 100],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-morning badge`,
      accent: { icon: 'text-yellow-400', bar: 'bg-yellow-500', chip: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300' },
    },
    {
      icon: Sunset,
      title: 'Evenings Focused',
      hint: 'Sessions started after 6pm',
      current: evenings,
      valueLabel: `${evenings}`,
      milestones: [1, 10, 25, 100],
      milestoneLabel: (m) => `${m}`,
      remainingLabel: (diff, next) => `${Math.ceil(diff)} more to your ${next}-evening badge`,
      accent: { icon: 'text-sky-400', bar: 'bg-sky-500', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
    },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Trophy size={18} className="text-amber-400" />
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Milestones</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Long-term goals and badges you've earned</p>
        </div>
      </div>

      <GettingStartedCard
        sessions={sessions}
        dailyGoalSeconds={dailyGoalSeconds}
        workDuration={workDuration}
        focusWallpaperEnabled={focusWallpaperEnabled}
        overlayEnabled={overlayEnabled}
        featuresUsed={featuresUsed}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tracks.map((t) => (
          <MilestoneTrack key={t.title} {...t} />
        ))}
      </div>

      <AchievementsCard sessions={sessions} dailyGoalSeconds={dailyGoalSeconds} />
    </div>
  )
}
