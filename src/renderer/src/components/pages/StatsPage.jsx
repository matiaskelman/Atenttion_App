import { useState } from 'react'
import { useStore } from '../../store'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Cell
} from 'recharts'
import { Clock, Flame, Eye, Zap, Download, Smartphone, Sun } from 'lucide-react'
import { AppUsageList } from '../AppUsageList'
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

const HOUR_BUCKETS = [
  { key: 'Morning', test: (h) => h >= 6 && h < 12 },
  { key: 'Afternoon', test: (h) => h >= 12 && h < 17 },
  { key: 'Evening', test: (h) => h >= 17 && h < 22 },
  { key: 'Night', test: (h) => h >= 22 || h < 6 }
]

const HoursTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length || payload[0].value == null) return null
  const { count } = payload[0].payload
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-xs">
      <p className="text-neutral-400 mb-1">{label}</p>
      <p className="text-violet-400">Avg focus: {payload[0].value} · {count} session{count === 1 ? '' : 's'}</p>
    </div>
  )
}

function BestFocusHoursCard({ sessions }) {
  const scored = sessions.filter((s) => s.focusScore != null)
  const data = HOUR_BUCKETS.map(({ key, test }) => {
    const bucket = scored.filter((s) => test(new Date(s.date).getHours()))
    return {
      name: key,
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
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -25 }}>
              <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<HoursTooltip />} />
              <Bar dataKey="avg" name="Avg focus" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={best && entry.name === best.name ? '#7c3aed' : '#3f3f46'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {best && (
            <p className="text-[10px] text-neutral-600 mt-2">Best window: {best.name} (avg {best.avg})</p>
          )}
        </>
      )}
    </div>
  )
}

export default function StatsPage() {
  const sessions = useStore((s) => s.sessions)
  const todayFocusSeconds = useStore((s) => s.todayFocusSeconds)
  const appUsageFocus = useStore((s) => s.appUsageFocus)
  const appUsageBreak = useStore((s) => s.appUsageBreak)
  const streak = useStore((s) => s.streak)
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

  const avgBPM = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + (s.blinkRate || 0), 0) / sessions.length)
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

      {sessions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center mb-4">
          <Flame size={32} className="text-neutral-700 mb-3" />
          <p className="text-neutral-500 text-sm">No sessions yet.</p>
          <p className="text-neutral-600 text-xs mt-1">Complete a Pomodoro to see your stats here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mb-4">
          <SessionsTable sessions={sessions} />
          <RecentSessionsChart recent={recent} />
          <div className="grid grid-cols-2 gap-4">
            <DistractionsCard sessions={sessions} />
            <BestFocusHoursCard sessions={sessions} />
          </div>
        </div>
      )}

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
