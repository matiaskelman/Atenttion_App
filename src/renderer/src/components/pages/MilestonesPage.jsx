import {
  Trophy, Clock, Layers, Flame, Gauge, Target, ShieldCheck, Sparkles, CalendarDays,
  Timer, Sunrise, Moon, Star, Gem, Undo2, CalendarHeart
} from 'lucide-react'
import { useStore } from '../../store'
import { formatDuration } from '../../utils/format'

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
  const byDay = {}
  sessions.forEach((s) => {
    const iso = new Date(s.date).toLocaleDateString('en-CA')
    if (!byDay[iso]) byDay[iso] = { secs: 0, scores: [] }
    byDay[iso].secs += s.duration || 0
    if (s.focusScore != null) byDay[iso].scores.push(s.focusScore)
  })

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

  return [
    { icon: Timer, label: 'Marathon', desc: 'A single 60-min+ session',
      earned: sessions.some((s) => (s.duration || 0) >= 3600) },
    { icon: Sunrise, label: 'Early Bird', desc: 'Focused before 7am',
      earned: sessions.some((s) => new Date(s.date).getHours() < 7) },
    { icon: Moon, label: 'Night Owl', desc: 'Focused after 11pm',
      earned: sessions.some((s) => new Date(s.date).getHours() >= 23) },
    { icon: Gem, label: 'Deep Diver', desc: 'A session scored ≥ 95',
      earned: sessions.some((s) => (s.focusScore ?? 0) >= 95) },
    { icon: Star, label: 'Perfect Day', desc: 'Hit goal, all sessions ≥ 80',
      earned: Object.values(byDay).some((d) => dailyGoalSeconds > 0 && d.secs >= dailyGoalSeconds && d.scores.length > 0 && d.scores.every((x) => x >= 80)) },
    { icon: Undo2, label: 'Comeback', desc: 'Returned after a 7-day gap', earned: comeback },
    { icon: CalendarHeart, label: 'Weekend Warrior', desc: 'Focused Sat & Sun', earned: weekendWarrior },
  ]
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

  const totalSecs = sessions.reduce((a, s) => a + (s.duration || 0), 0)
  const deepSecs = sessions.reduce((a, s) => a + (s.focusScore != null && s.focusScore >= 80 ? (s.duration || 0) : 0), 0)

  // Per-day totals for active-days + goal-hit streak.
  const dayMap = {}
  sessions.forEach((s) => {
    const iso = new Date(s.date).toLocaleDateString('en-CA')
    if (!dayMap[iso]) dayMap[iso] = 0
    dayMap[iso] += s.duration || 0
  })
  const activeDays = Object.keys(dayMap).length

  // Current goal-hit streak: consecutive days reaching the daily goal, ending
  // today (or yesterday if today isn't done yet so an unfinished day won't break it).
  const isoOf = (d) => d.toLocaleDateString('en-CA')
  let goalStreak = 0
  if (dailyGoalSeconds > 0) {
    const cur = new Date(); cur.setHours(0, 0, 0, 0)
    if ((dayMap[isoOf(cur)] || 0) < dailyGoalSeconds) cur.setDate(cur.getDate() - 1)
    while ((dayMap[isoOf(cur)] || 0) >= dailyGoalSeconds) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tracks.map((t) => (
          <MilestoneTrack key={t.title} {...t} />
        ))}
      </div>

      <AchievementsCard sessions={sessions} dailyGoalSeconds={dailyGoalSeconds} />
    </div>
  )
}
