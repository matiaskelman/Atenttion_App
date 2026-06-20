import { useState } from 'react'
import { useStore } from '../../store'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, LineChart, Line, Cell
} from 'recharts'
import {
  Clock, Flame, Star, Zap, Download, Smartphone, Sun,
  Trophy, Target, CalendarDays, Layers, Timer, CalendarRange, TrendingDown,
  Hourglass, TrendingUp, Gauge, Sparkles, Activity
} from 'lucide-react'
import { AppUsageList, AppAvatar, appDisplayName } from '../AppUsageList'
import SessionsTable from '../SessionsTable'
import { formatDuration, formatIsoTime } from '../../utils/format'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs">
      <p className="text-neutral-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function ChartLegend({ items }) {
  return (
    <div className="flex gap-3 mt-2">
      {items.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[9px] text-neutral-600">{label}</span>
        </div>
      ))}
    </div>
  )
}

function RecentSessionsChart({ recent }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4">Recent Sessions</h3>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={recent} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="right" orientation="right" domain={[0, 100]} width={30}
            tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar yAxisId="left" dataKey="duration" name="Minutes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="right" type="monotone" dataKey="focusScore" name="Focus score"
            stroke="#10b981" strokeWidth={2}
            dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={[{ color: '#7c3aed', label: 'Minutes' }, { color: '#10b981', label: 'Focus score' }]} />
      {recent.some((s) => s.outcomeRating != null) && (
        <div className="mt-3 pt-3 border-t border-surface-3">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">Session outcome</p>
          <div className="flex gap-1 items-center">
            {recent.map((s, i) => {
              const color = s.outcomeRating === 3 ? 'bg-violet-400' : s.outcomeRating === 2 ? 'bg-amber-400' : s.outcomeRating === 1 ? 'bg-red-400' : 'bg-surface-3'
              const label = s.outcomeRating === 3 ? 'Flow' : s.outcomeRating === 2 ? 'Focused' : s.outcomeRating === 1 ? 'Scattered' : '—'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-[9px] text-neutral-400 whitespace-nowrap">
                      {s.name}: {label}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-3 mt-2">
            {[{ color: 'bg-red-400', label: 'Scattered' }, { color: 'bg-amber-400', label: 'Focused' }, { color: 'bg-violet-400', label: 'Flow' }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
                <span className="text-[9px] text-neutral-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DistractionsCard({ sessions }) {
  const recent = sessions.slice(-10)
  const data = recent.map((s) => ({
    name: formatIsoTime(s.date),
    pickups: s.phonePickups ?? 0,
    awayMin: Math.round((s.awaySeconds || 0) / 60)
  }))
  const totalPickups = data.reduce((a, d) => a + d.pickups, 0)
  const totalAwaySeconds = recent.reduce((a, s) => a + (s.awaySeconds || 0), 0)
  const avgPickups = recent.length ? (totalPickups / recent.length).toFixed(1) : '0'
  const avgAwaySeconds = recent.length ? Math.round(totalAwaySeconds / recent.length) : 0
  const allZero = data.every((d) => d.pickups === 0 && d.awayMin === 0)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Smartphone size={13} className="text-amber-400" /> Distractions
      </h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Phone pickups</span>
          <span className="text-2xl font-semibold text-amber-400">{totalPickups}</span>
          <span className="text-[10px] text-neutral-600">{avgPickups} avg/session</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Away time</span>
          <span className="text-2xl font-semibold text-red-400">{totalAwaySeconds ? formatDuration(totalAwaySeconds) : '0m'}</span>
          <span className="text-[10px] text-neutral-600">{avgAwaySeconds ? formatDuration(avgAwaySeconds) : '0m'} avg/session</span>
        </div>
      </div>
      {allZero ? (
        <p className="text-xs text-emerald-400/70 py-2">No distractions recorded — great focus.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -25 }}>
              <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pickups" name="Pickups" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey="awayMin" name="Away (min)" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ChartLegend items={[{ color: '#f59e0b', label: 'Pickups' }, { color: '#ef4444', label: 'Away (min)' }]} />
        </>
      )}
    </div>
  )
}

const HoursTooltip = ({ active, payload }) => {
  if (!active || !payload?.length || payload[0].value == null) return null
  const { count, label } = payload[0].payload
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs">
      <p className="text-neutral-400 mb-1">{label}</p>
      <p className="text-violet-400">Avg focus: {payload[0].value} · {count} session{count === 1 ? '' : 's'}</p>
    </div>
  )
}

function BestFocusHoursCard({ sessions }) {
  // Exclude low-confidence sessions so the "best hours" insight isn't skewed by sparse data.
  // (Legacy sessions have no scoreConfidence — keep them.)
  const scored = sessions.filter((s) => s.focusScore != null && s.scoreConfidence !== 'low')
  // One bar per hour of the day (00:00–23:00). Bars stay even where there's no data
  // so the axis always reads as a full 00:00 → 23:59 day.
  const data = Array.from({ length: 24 }, (_, h) => {
    const bucket = scored.filter((s) => new Date(s.date).getHours() === h)
    const next = String((h + 1) % 24).padStart(2, '0')
    return {
      hour: h,
      tick: `${String(h).padStart(2, '0')}:00`,
      label: `${String(h).padStart(2, '0')}:00–${next}:00`,
      avg: bucket.length ? Math.round(bucket.reduce((a, s) => a + s.focusScore, 0) / bucket.length) : null,
      count: bucket.length
    }
  })
  const best = data.reduce((b, d) => (d.avg != null && (b == null || d.avg > b.avg) ? d : b), null)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Sun size={13} className="text-amber-400" /> Best Focus Hours
      </h3>
      {scored.length < 3 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">Not enough data yet — complete a few more sessions.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 14, left: -25 }}>
              <XAxis
                dataKey="tick"
                interval={5}
                tick={{ fill: '#525252', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Hour', position: 'insideBottom', offset: -10, fill: '#525252', fontSize: 9 }}
              />
              <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<HoursTooltip />} />
              <Bar dataKey="avg" name="Avg focus" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={best && entry.hour === best.hour ? '#7c3aed' : '#3f3f46'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {best && (
            <p className="text-[10px] text-neutral-600 mt-2">Best window: {best.label} (avg {best.avg})</p>
          )}
        </>
      )}
    </div>
  )
}

function RecordsCard({ sessions, bestStreak }) {
  const scored = sessions.filter((s) => s.focusScore != null)
  const longest = sessions.reduce((m, s) => Math.max(m, s.duration || 0), 0)
  const bestScore = scored.reduce((m, s) => Math.max(m, s.focusScore), 0)

  // Group by local calendar day for the per-day records.
  const byDay = {}
  sessions.forEach((s) => {
    const d = new Date(s.date).toLocaleDateString('en-CA')
    if (!byDay[d]) byDay[d] = { secs: 0, count: 0 }
    byDay[d].secs += s.duration || 0
    byDay[d].count += 1
  })
  const days = Object.values(byDay)
  const mostFocusDay = days.reduce((m, d) => Math.max(m, d.secs), 0)
  const mostSessionsDay = days.reduce((m, d) => Math.max(m, d.count), 0)

  const rows = [
    { icon: Timer, label: 'Longest session', value: longest ? formatDuration(longest) : '—', color: 'text-violet-400' },
    { icon: Target, label: 'Highest focus score', value: scored.length ? bestScore : '—', color: 'text-emerald-400' },
    { icon: CalendarDays, label: 'Most focus in a day', value: mostFocusDay ? formatDuration(mostFocusDay) : '—', color: 'text-cyan-400' },
    { icon: Layers, label: 'Most sessions in a day', value: mostSessionsDay || '—', color: 'text-amber-400' },
    { icon: Flame, label: 'Longest streak', value: bestStreak ? `${bestStreak}d` : '—', color: 'text-orange-400' },
  ]

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Trophy size={13} className="text-amber-400" /> Personal Records
      </h3>
      <div className="flex flex-col gap-2.5">
        {rows.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon size={14} className={`${color} shrink-0`} />
            <span className="text-xs text-neutral-400 flex-1">{label}</span>
            <span className={`text-sm font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConsistencyCard({ sessions, dailyGoalSeconds }) {
  const WEEKS = 13
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const byDate = {}
  sessions.forEach((s) => {
    const d = new Date(s.date).toLocaleDateString('en-CA')
    byDate[d] = (byDate[d] || 0) + (s.duration || 0)
  })

  // Grid runs from the Sunday WEEKS-1 weeks ago through the current week, so
  // columns are weeks (oldest→newest) and rows are weekdays (Sun→Sat).
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7)

  const weeks = []
  let daysHitGoal = 0
  let activeDays = 0
  for (let w = 0; w < WEEKS; w++) {
    const col = []
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(start)
      d.setDate(start.getDate() + w * 7 + dow)
      const iso = d.toLocaleDateString('en-CA')
      const isFuture = d > today
      const secs = byDate[iso] || 0
      if (!isFuture && secs > 0) activeDays++
      if (!isFuture && dailyGoalSeconds > 0 && secs >= dailyGoalSeconds) daysHitGoal++
      col.push({ iso, secs, isFuture, label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }) })
    }
    weeks.push(col)
  }

  const cellClass = (secs, isFuture) => {
    if (isFuture) return 'bg-transparent'
    if (secs === 0) return 'bg-surface-3'
    const pct = dailyGoalSeconds > 0 ? secs / dailyGoalSeconds : 0
    if (pct >= 1) return 'bg-violet-500 ring-1 ring-emerald-400/70'
    if (pct >= 0.66) return 'bg-violet-500/70'
    if (pct >= 0.33) return 'bg-violet-500/45'
    return 'bg-violet-500/20'
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <CalendarRange size={13} className="text-violet-400" /> Consistency
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4">
        {daysHitGoal} day{daysHitGoal === 1 ? '' : 's'} hit your goal · {activeDays} active in the last {WEEKS} weeks
      </p>
      <div className="flex gap-1">
        {weeks.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div key={cell.iso} className="relative group">
                <div className={`w-3 h-3 rounded-sm ${cellClass(cell.secs, cell.isFuture)}`} />
                {!cell.isFuture && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-[9px] text-neutral-400 whitespace-nowrap">
                      {cell.label}: {cell.secs ? formatDuration(cell.secs) : 'no focus'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        <span className="text-[9px] text-neutral-600 mr-0.5">Less</span>
        {['bg-surface-3', 'bg-violet-500/20', 'bg-violet-500/45', 'bg-violet-500/70', 'bg-violet-500'].map((c) => (
          <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span className="text-[9px] text-neutral-600 ml-0.5">More</span>
        <span className="ml-3 flex items-center gap-1 text-[9px] text-neutral-600">
          <div className="w-3 h-3 rounded-sm bg-violet-500 ring-1 ring-emerald-400/70" /> Goal hit
        </span>
      </div>
    </div>
  )
}

function AppsVsFocusCard({ sessions }) {
  const MIN_PRESENCE = 30   // seconds of an app open to count it as "present" that session
  const MIN_SESSIONS = 3    // need a few data points before an app's average means anything

  const scored = sessions.filter((s) => s.focusScore != null && s.appUsage)
  const overall = scored.length
    ? scored.reduce((a, s) => a + s.focusScore, 0) / scored.length
    : null

  const byApp = {}
  scored.forEach((s) => {
    Object.entries(s.appUsage).forEach(([name, secs]) => {
      if (secs < MIN_PRESENCE) return
      const key = name.toLowerCase()
      if (key.includes('electron') || key.includes('atenttion')) return // the app itself is always open
      if (!byApp[name]) byApp[name] = []
      byApp[name].push(s.focusScore)
    })
  })

  const rows = Object.entries(byApp)
    .filter(([, scores]) => scores.length >= MIN_SESSIONS)
    .map(([name, scores]) => {
      const avg = Math.round(scores.reduce((a, x) => a + x, 0) / scores.length)
      return { name, avg, delta: Math.round(avg - overall), count: scores.length }
    })
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <TrendingDown size={13} className="text-amber-400" /> Apps vs Focus
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4">
        Avg focus score when each app is open{overall != null ? ` · your overall avg ${Math.round(overall)}` : ''}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">
          Not enough data yet — needs a few sessions with the same app open.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map(({ name, avg, delta, count }) => (
            <div key={name} className="flex items-center gap-2.5">
              <AppAvatar name={name} size="sm" />
              <span className="text-xs font-medium text-neutral-300 truncate flex-1">{appDisplayName(name)}</span>
              <span className="text-[9px] text-neutral-600">{count}×</span>
              <span className="text-sm font-semibold text-neutral-200 w-7 text-right">{avg}</span>
              <span className={`text-[10px] font-mono w-9 text-right ${delta < 0 ? 'text-red-400' : delta > 0 ? 'text-emerald-400' : 'text-neutral-600'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OptimalDurationCard({ sessions }) {
  // 10-minute bins so the optimum is specific without getting too noisy.
  const bins = [
    { label: '≤10', test: (m) => m <= 10 },
    { label: '10–20', test: (m) => m > 10 && m <= 20 },
    { label: '20–30', test: (m) => m > 20 && m <= 30 },
    { label: '30–40', test: (m) => m > 30 && m <= 40 },
    { label: '40–50', test: (m) => m > 40 && m <= 50 },
    { label: '50–60', test: (m) => m > 50 && m <= 60 },
    { label: '60+', test: (m) => m > 60 },
  ]
  const scored = sessions.filter((s) => s.focusScore != null)
  const data = bins.map((b) => {
    const inB = scored.filter((s) => b.test((s.duration || 0) / 60))
    return {
      label: b.label,
      avg: inB.length ? Math.round(inB.reduce((a, s) => a + s.focusScore, 0) / inB.length) : null,
      count: inB.length,
    }
  })
  // A bin must hold ≥2 sessions before it can be the optimum, so one lucky session can't define it.
  const best = data.reduce((b, d) => (d.avg != null && d.count >= 2 && (b == null || d.avg > b.avg) ? d : b), null)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <Hourglass size={13} className="text-violet-400" /> Optimal Session Duration
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4 leading-snug">
        Your average focus score grouped by how long each session ran (minutes). The tallest bar with ≥2 sessions is the length where you concentrate best.
      </p>
      {scored.length < 4 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">Not enough data yet — complete a few more sessions.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -25 }}>
              <XAxis dataKey="label" tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<HoursTooltip />} />
              <Bar dataKey="avg" name="Avg focus" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={best && entry.label === best.label ? '#7c3aed' : '#3f3f46'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {best
            ? <p className="text-[10px] text-neutral-600 mt-2">Your optimum: <span className="text-violet-400">{best.label} min</span> (avg {best.avg} across {best.count} sessions)</p>
            : <p className="text-[10px] text-neutral-600 mt-2">No length has ≥2 sessions yet — keep going to find your optimum.</p>}
        </>
      )}
    </div>
  )
}

function StaminaCard({ sessions }) {
  // Group scored sessions by day, order each day chronologically, then average
  // focus by position-in-day (1st session, 2nd, …) to reveal a stamina curve.
  const byDay = {}
  sessions.forEach((s) => {
    if (s.focusScore == null) return
    const d = new Date(s.date).toLocaleDateString('en-CA')
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(s)
  })
  const slots = {}
  Object.values(byDay).forEach((day) => {
    day.sort((a, b) => new Date(a.date) - new Date(b.date))
    day.forEach((s, i) => {
      if (!slots[i]) slots[i] = { sum: 0, count: 0 }
      slots[i].sum += s.focusScore
      slots[i].count += 1
    })
  })
  const data = Object.entries(slots)
    .map(([i, v]) => ({ n: Number(i) + 1, label: `Session ${Number(i) + 1}`, avg: Math.round(v.sum / v.count), count: v.count }))
    .filter((d) => d.count >= 2) // need the slot to recur across days to be meaningful
    .sort((a, b) => a.n - b.n)
  const best = data.reduce((b, d) => (b == null || d.avg > b.avg ? d : b), null)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <TrendingUp size={13} className="text-emerald-400" /> Focus Stamina
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4 leading-snug">
        Your average focus score by a session's position in the day (1st, 2nd, 3rd…), averaged across days. Shows whether your focus holds up or fades as the day wears on. A position must recur on ≥2 days to appear.
      </p>
      {data.length < 2 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">Not enough data yet — needs multiple sessions per day across a few days.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
              <XAxis dataKey="n" tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<HoursTooltip />} />
              <Line type="monotone" dataKey="avg" name="Avg focus" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-neutral-600 mt-2">Avg focus by session order within a day · strongest at session {best.n}</p>
        </>
      )}
    </div>
  )
}

function DeepWorkCard({ sessions }) {
  const scored = sessions.filter((s) => s.focusScore != null)
  let high = 0, med = 0, low = 0
  scored.forEach((s) => {
    const t = s.duration || 0
    if (s.focusScore >= 80) high += t
    else if (s.focusScore >= 50) med += t
    else low += t
  })
  const total = high + med + low
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0)

  // "How it's incrementing": deep-work share this week vs the previous week.
  const dayMs = 86400000
  const now = Date.now()
  const shareFor = (subset) => {
    let h = 0, t = 0
    subset.forEach((s) => { const d = s.duration || 0; t += d; if (s.focusScore >= 80) h += d })
    return t ? h / t : null
  }
  const thisWk = scored.filter((s) => (now - new Date(s.date)) / dayMs < 7)
  const prevWk = scored.filter((s) => { const a = (now - new Date(s.date)) / dayMs; return a >= 7 && a < 14 })
  const sThis = shareFor(thisWk), sPrev = shareFor(prevWk)
  const trend = (sThis != null && sPrev != null) ? Math.round((sThis - sPrev) * 100) : null

  const segs = [
    { secs: high, color: 'bg-emerald-500', dot: 'bg-emerald-500', label: 'High (≥80)' },
    { secs: med,  color: 'bg-amber-500',   dot: 'bg-amber-500',   label: 'Medium (50–79)' },
    { secs: low,  color: 'bg-red-500',     dot: 'bg-red-500',     label: 'Low (<50)' },
  ]

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Gauge size={13} className="text-emerald-400" /> Deep Work
      </h3>
      {total === 0 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">Not enough data yet — complete a few scored sessions.</p>
      ) : (
        <>
          <div className="flex items-end justify-between mb-3">
            <div className="flex flex-col">
              <span className="text-2xl font-semibold text-emerald-400">{pct(high)}%</span>
              <span className="text-[10px] text-neutral-600">{formatDuration(high)} in high focus</span>
            </div>
            {trend != null && (
              <span className={`text-xs font-medium ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-neutral-600'}`}>
                {trend > 0 ? '▲' : trend < 0 ? '▼' : ''} {trend > 0 ? `+${trend}` : trend}% vs last week
              </span>
            )}
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-surface-3 mb-3">
            {segs.map((s) => s.secs > 0 && (
              <div key={s.label} className={s.color} style={{ width: `${pct(s.secs)}%` }} />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {segs.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                <span className="text-[10px] text-neutral-500 flex-1">{s.label}</span>
                <span className="text-[10px] text-neutral-400 font-mono">{formatDuration(s.secs)}</span>
                <span className="text-[10px] text-neutral-600 w-9 text-right">{pct(s.secs)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RecapStat({ label, value, delta, suffix = '', goodDown = false }) {
  let chip = <span className="text-[10px] text-neutral-700">—</span>
  if (delta != null && delta !== 0) {
    const up = delta > 0
    const good = goodDown ? !up : up
    chip = (
      <span className={`text-[10px] font-medium ${good ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(delta)}{suffix}
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-neutral-600 uppercase tracking-wider">{label}</span>
      <span className="text-lg font-semibold text-neutral-100">{value}</span>
      {chip}
    </div>
  )
}

function WeeklyRecapCard({ sessions }) {
  const dayMs = 86400000
  const now = Date.now()
  const thisWk = sessions.filter((s) => (now - new Date(s.date)) / dayMs < 7)
  const prevWk = sessions.filter((s) => { const a = (now - new Date(s.date)) / dayMs; return a >= 7 && a < 14 })

  const agg = (arr) => {
    const secs = arr.reduce((a, s) => a + (s.duration || 0), 0)
    const scored = arr.filter((s) => s.focusScore != null)
    const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.focusScore, 0) / scored.length) : null
    const best = scored.length ? Math.max(...scored.map((s) => s.focusScore)) : null
    return { count: arr.length, secs, avg, best }
  }
  const a = agg(thisWk), b = agg(prevWk)

  const minutesDelta = b.secs > 0 ? Math.round(((a.secs - b.secs) / b.secs) * 100) : null
  const avgDelta = (a.avg != null && b.avg != null) ? a.avg - b.avg : null
  const sessionsDelta = a.count - b.count
  const bestDelta = (a.best != null && b.best != null) ? a.best - b.best : null

  // Best weekday this week
  const wd = {}
  thisWk.forEach((s) => {
    const k = new Date(s.date).toLocaleDateString([], { weekday: 'long' })
    wd[k] = (wd[k] || 0) + (s.duration || 0)
  })
  const bestDay = Object.entries(wd).sort((x, y) => y[1] - x[1])[0]

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <Sparkles size={13} className="text-violet-400" /> Weekly Recap
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4">Last 7 days vs the week before{bestDay ? ` · best day ${bestDay[0]}` : ''}</p>
      {a.count === 0 ? (
        <p className="text-xs text-neutral-600 py-4 text-center">No sessions in the last 7 days — start one to build your recap.</p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <RecapStat label="Sessions" value={a.count} delta={sessionsDelta} />
          <RecapStat label="Focus" value={formatDuration(a.secs)} delta={minutesDelta} suffix="%" />
          <RecapStat label="Avg score" value={a.avg ?? '—'} delta={avgDelta} />
          <RecapStat label="Best score" value={a.best ?? '—'} delta={bestDelta} />
        </div>
      )}
    </div>
  )
}

function FocusTrendCard({ sessions }) {
  const DAYS = 56 // ~8 weeks
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const scored = sessions.filter((s) => s.focusScore != null)
  const byDay = {}
  scored.forEach((s) => {
    const iso = new Date(s.date).toLocaleDateString('en-CA')
    if (!byDay[iso]) byDay[iso] = { sum: 0, count: 0 }
    byDay[iso].sum += s.focusScore
    byDay[iso].count += 1
  })

  // For each day, the trailing 7-day rolling average of all session scores in that window.
  const data = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    let sum = 0, count = 0
    for (let k = 0; k < 7; k++) {
      const dd = new Date(d)
      dd.setDate(d.getDate() - k)
      const e = byDay[dd.toLocaleDateString('en-CA')]
      if (e) { sum += e.sum; count += e.count }
    }
    data.push({
      label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      avg: count ? Math.round(sum / count) : null,
    })
  }
  const valid = data.filter((d) => d.avg != null)
  const trend = valid.length >= 2 ? valid[valid.length - 1].avg - valid[0].avg : null

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1 flex items-center gap-2">
        <Activity size={13} className="text-violet-400" /> Focus Trend
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4 leading-snug">
        Your 7-day rolling average focus score over the last 8 weeks — smooths out daily noise to show the overall direction.
      </p>
      {scored.length < 5 ? (
        <p className="text-xs text-neutral-600 py-6 text-center">Not enough data yet — complete a few more sessions.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" interval={13} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="avg" name="7-day avg" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          {trend != null && (
            <p className="text-[10px] text-neutral-600 mt-2">
              <span className={trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-neutral-500'}>
                {trend > 0 ? `▲ +${trend}` : trend < 0 ? `▼ ${trend}` : 'flat'}
              </span> over the period
            </p>
          )}
        </>
      )}
    </div>
  )
}

function WeekCard({ weekData }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <Clock size={13} className="text-violet-400" /> This Week
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={weekData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="minutes" name="Minutes" radius={[4, 4, 0, 0]}>
            {weekData.map((entry, i) => (
              <Cell key={i} fill={entry.isToday ? '#7c3aed' : '#3f3f46'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function StatsPage() {
  const sessions = useStore((s) => s.sessions)
  const todayFocusSeconds = useStore((s) => s.todayFocusSeconds)
  const appUsageFocus = useStore((s) => s.appUsageFocus)
  const appUsageBreak = useStore((s) => s.appUsageBreak)
  const streak = useStore((s) => s.streak)
  const bestStreak = useStore((s) => s.bestStreak)
  const dailyGoalSeconds = useStore((s) => s.dailyGoalSeconds)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)

  const handleExportCsv = async () => {
    setExporting(true)
    setExportMsg(null)
    try {
      const result = await window.api?.data.exportCsv(sessions)
      if (result?.canceled) {
        setExportMsg(null)
      } else if (result?.success) {
        setExportMsg({ ok: true, text: 'Saved!' })
        setTimeout(() => setExportMsg(null), 3000)
      } else {
        setExportMsg({ ok: false, text: result?.error || 'Export failed' })
      }
    } catch (e) {
      setExportMsg({ ok: false, text: e.message || 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  const today = new Date().toLocaleDateString('en-CA')
  const todaySessions = sessions.filter((s) => new Date(s.date).toLocaleDateString('en-CA') === today).length
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const date = d.toLocaleDateString('en-CA')
    const daySessions = sessions.filter((s) => new Date(s.date).toLocaleDateString('en-CA') === date)
    return {
      label: date === today ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }),
      minutes: Math.round(daySessions.reduce((sum, s) => sum + (s.duration || 0), 0) / 60),
      isToday: date === today
    }
  })

  const recent = sessions.slice(-10).map((s) => ({
    name: formatIsoTime(s.date),
    duration: Math.round(s.duration / 60),
    focusScore: s.focusScore ?? null,
    outcomeRating: s.outcomeRating ?? null
  }))

  const totalFocusSeconds = sessions.reduce((a, s) => a + (s.duration || 0), 0)

  const scoredSessions = sessions.filter((s) => s.focusScore != null)
  const avgScore = scoredSessions.length
    ? Math.round(scoredSessions.reduce((a, s) => a + s.focusScore, 0) / scoredSessions.length)
    : null

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Statistics</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Your focus and attention history</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card-sm">
          <Clock size={14} className="text-violet-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{formatDuration(totalFocusSeconds)}</span>
          <span className="text-xs text-neutral-500">Total Focus</span>
        </div>
        <div className="card-sm">
          <Flame size={14} className="text-amber-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{sessions.length}</span>
          <span className="text-xs text-neutral-500">Total Sessions</span>
        </div>
        <div className="card-sm">
          <Star size={14} className="text-emerald-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{avgScore != null ? avgScore : '—'}</span>
          <span className="text-xs text-neutral-500">Avg Score</span>
        </div>
        <div className="card-sm">
          <Zap size={14} className="text-cyan-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{streak ? `${streak}d` : '—'}</span>
          <span className="text-xs text-neutral-500">Streak</span>
          {bestStreak > 0 && (
            <span className="text-[10px] text-neutral-600 mt-0.5">best: {bestStreak}d</span>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col gap-4 mb-4">
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <Flame size={32} className="text-neutral-700 mb-3" />
            <p className="text-neutral-500 text-sm">No sessions yet.</p>
            <p className="text-neutral-600 text-xs mt-1">Complete a Pomodoro to see your stats here.</p>
          </div>
          <WeekCard weekData={weekData} />
        </div>
      ) : (
        <div className="flex flex-col gap-4 mb-4">
          <WeeklyRecapCard sessions={sessions} />
          <SessionsTable sessions={sessions} />
          <div className="grid grid-cols-2 gap-4">
            <WeekCard weekData={weekData} />
            <ConsistencyCard sessions={sessions} dailyGoalSeconds={dailyGoalSeconds} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OptimalDurationCard sessions={sessions} />
            <StaminaCard sessions={sessions} />
          </div>
          <DeepWorkCard sessions={sessions} />
          <FocusTrendCard sessions={sessions} />
          <RecentSessionsChart recent={recent} />
          <div className="grid grid-cols-2 gap-4">
            <DistractionsCard sessions={sessions} />
            <BestFocusHoursCard sessions={sessions} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <RecordsCard sessions={sessions} bestStreak={bestStreak} />
            <AppsVsFocusCard sessions={sessions} />
          </div>
        </div>
      )}

      {/* App Activity */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
          <Clock size={13} className="text-violet-400" /> App Activity
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Focus Time</span>
            </div>
            <AppUsageList
              usage={appUsageFocus || {}}
              emptyText="Start a focus session to track apps."
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Breaks</span>
            </div>
            <AppUsageList
              usage={appUsageBreak || {}}
              emptyText="No breaks tracked yet."
            />
          </div>
        </div>
      </div>

      {/* CSV export */}
      <div className="flex items-center justify-end gap-3 mt-4">
        {exportMsg && (
          <span className={`text-xs ${exportMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {exportMsg.text}
          </span>
        )}
        <button
          onClick={handleExportCsv}
          disabled={exporting || sessions.length === 0}
          className="btn btn-secondary flex items-center gap-2 text-xs"
        >
          <Download size={13} />
          {exporting ? 'Exporting…' : 'Export XLSX'}
        </button>
      </div>
    </div>
  )
}
