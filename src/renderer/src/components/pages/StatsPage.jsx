import { useState } from 'react'
import { useStore } from '../../store'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell
} from 'recharts'
import { Clock, Flame, Eye, Zap, Download, BookOpen } from 'lucide-react'
import { AppUsageList } from '../AppUsageList'
import { formatDuration, formatIsoTime } from '../../utils/format'

function RitualImpactCard({ sessions }) {
  const ritualSessions = sessions.filter((s) => s.ritual === true && s.focusScore != null)
  const plainSessions = sessions.filter((s) => !s.ritual && s.focusScore != null)
  if (ritualSessions.length < 5) return null

  const avg = (arr) => Math.round(arr.reduce((a, s) => a + s.focusScore, 0) / arr.length)
  const withRitual = avg(ritualSessions)
  const withoutRitual = plainSessions.length ? avg(plainSessions) : null
  const delta = withoutRitual != null ? withRitual - withoutRitual : null

  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
        <BookOpen size={13} className="text-violet-400" /> Ritual Impact
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider">With ritual</span>
          <span className="text-2xl font-semibold text-violet-400">{withRitual}</span>
          <span className="text-[10px] text-neutral-600">avg focus score · {ritualSessions.length} sessions</span>
        </div>
        {withoutRitual != null ? (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Without ritual</span>
            <span className="text-2xl font-semibold text-neutral-300">{withoutRitual}</span>
            <span className={`text-[10px] ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-neutral-600'}`}>
              {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '—'} pts difference
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 justify-center">
            <span className="text-xs text-neutral-600 italic">Complete sessions without ritual to compare</span>
          </div>
        )}
      </div>
    </div>
  )
}

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

export default function StatsPage() {
  const { sessions, todayFocusSeconds, blinkCount, appUsageFocus, appUsageBreak, streak } = useStore()
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)
  const [selectedGoal, setSelectedGoal] = useState(null)

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

  const recent = sessions.slice(-10).map((s, i) => ({
    name: formatIsoTime(s.date),
    duration: Math.round(s.duration / 60),
    blinks: s.blinkCount,
    bpm: s.blinkRate,
    away: Math.round((s.awaySeconds || 0) / 60),
    outcomeRating: s.outcomeRating ?? null
  }))

  const avgBPM = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + (s.blinkRate || 0), 0) / sessions.length)
    : 0

  const avgAway = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + (s.awaySeconds || 0), 0) / sessions.length)
    : 0

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Statistics</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Your focus and attention history</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: Clock,  color: 'text-violet-400', value: formatDuration(todayFocusSeconds), label: "Today's Focus" },
          { icon: Flame,  color: 'text-amber-400',  value: todaySessions,                     label: 'Sessions Today' },
          { icon: Eye,    color: 'text-emerald-400', value: avgBPM,                           label: 'Avg BPM' },
          { icon: Zap,    color: 'text-cyan-400',   value: streak ? `${streak}d` : '—',      label: 'Streak' }
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="card-sm">
            <Icon size={14} className={`${color} mb-1`} />
            <span className="text-lg font-semibold text-neutral-100">{value}</span>
            <span className="text-xs text-neutral-500">{label}</span>
          </div>
        ))}
      </div>

      {/* App Activity — always visible, does not require completed sessions */}
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

      {/* Week view — always shown */}
      <div className="card mb-4">
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

      <RitualImpactCard sessions={sessions} />

      {/* Session charts — only once at least one session is complete */}
      {sessions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Flame size={32} className="text-neutral-700 mb-3" />
          <p className="text-neutral-500 text-sm">No sessions yet.</p>
          <p className="text-neutral-600 text-xs mt-1">Complete a Pomodoro to see your stats here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Focus duration chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-neutral-300 mb-4">Focus Duration (minutes)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={recent} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="duration" name="Minutes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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

          {/* Blink rate chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-neutral-300 mb-4">Blink Rate per Session (BPM)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={recent} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="0" />
                <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#525252', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="bpm" name="BPM"
                  stroke="#10b981" strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Session table */}
          <div className="card">
            <h3 className="text-sm font-semibold text-neutral-300 mb-3">Recent Sessions</h3>
            <div className="flex flex-col gap-1">
              <div className="grid text-[10px] text-neutral-600 uppercase tracking-wider px-2 mb-1"
                style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 2fr' }}>
                <span>Time</span><span>Duration</span><span>BPM</span><span>Rhythm</span><span>Focus</span><span>Away</span>
                <span className="text-center">State</span>
                <span className="text-center pl-4">Goal</span>
              </div>
              {[...sessions].reverse().slice(0, 8).map((s, i) => {
                const cv = s.blinkVariability
                const rhythm = cv === null || cv === undefined ? '—'
                  : cv < 0.40 ? '🟢 Regular'
                  : cv < 0.70 ? '🟡 Variable'
                  : '🔴 Irregular'
                const score = s.focusScore
                const moodLabel = { 1: '😴 Tired', 2: '😑 Bored', 3: '😐 Neutral', 4: '💪 Motivated', 5: '⚡ Energized' }
                return (
                  <div key={i} className="grid text-xs px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors text-neutral-400"
                    style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 2fr' }}>
                    <span>{formatIsoTime(s.date)}</span>
                    <span>{formatDuration(s.duration)}</span>
                    <span>{s.blinkRate || 0}</span>
                    <span className="text-[10px]">{rhythm}</span>
                    <span className={score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : score > 0 ? 'text-red-400' : ''}>
                      {score != null ? `${score}` : '—'}
                    </span>
                    <span>{s.awaySeconds ? formatDuration(s.awaySeconds) : '—'}</span>
                    <span className="text-[10px] text-center">{s.moodBefore ? moodLabel[s.moodBefore] : '—'}</span>
                    {s.goal ? (
                      <button
                        onClick={() => setSelectedGoal(s.goal)}
                        className="pl-4 min-w-0 truncate text-left text-neutral-500 italic hover:text-neutral-200 transition-colors"
                      >
                        {s.goal}
                      </button>
                    ) : (
                      <span className="pl-4 text-center">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {selectedGoal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setSelectedGoal(null)}
            >
              <div
                className="bg-surface-1 border border-surface-3 rounded-xl px-6 py-5 max-w-xs mx-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">Session Goal</p>
                <p className="text-sm text-neutral-200 italic">"{selectedGoal}"</p>
                <button
                  onClick={() => setSelectedGoal(null)}
                  className="mt-4 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}
