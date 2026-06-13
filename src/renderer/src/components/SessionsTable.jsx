import { useState, useMemo } from 'react'
import { ChevronDown, Smartphone } from 'lucide-react'
import { AppUsageList, AppAvatar } from './AppUsageList'
import { formatDuration } from '../utils/format'

const GRID_COLS = '1.3fr 0.8fr 0.8fr 0.8fr 1.1fr 0.9fr 1.7fr 24px'

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' }
]

const moodLabel = { 1: '😴 Tired', 2: '😑 Bored', 3: '😐 Neutral', 4: '💪 Motivated', 5: '⚡ Energized' }

const outcomeConfig = {
  1: { label: 'Scattered', cls: 'text-red-400' },
  2: { label: 'Focused', cls: 'text-amber-400' },
  3: { label: 'Flow', cls: 'text-violet-400' }
}

function rhythmLabel(cv) {
  if (cv === null || cv === undefined) return '—'
  return cv < 0.40 ? '🟢 Regular' : cv < 0.70 ? '🟡 Variable' : '🔴 Irregular'
}

function filterByRange(sessions, range) {
  if (range === 'all') return sessions
  const daysBack = { today: 0, week: 6, month: 29 }[range]
  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  const startStr = start.toLocaleDateString('en-CA')
  return sessions.filter((s) => new Date(s.date).toLocaleDateString('en-CA') >= startStr)
}

function FocusBadge({ score }) {
  const cls = score == null ? 'bg-surface-2 text-neutral-600'
    : score >= 80 ? 'bg-emerald-500/15 text-emerald-400'
    : score >= 50 ? 'bg-amber-500/15 text-amber-400'
    : 'bg-red-500/15 text-red-400'
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {score != null ? score : '—'}
    </span>
  )
}

function AppIconStrip({ usage }) {
  const top = Object.entries(usage || {}).sort(([, a], [, b]) => b - a).slice(0, 3)
  if (top.length === 0) return <span>—</span>
  return (
    <div className="flex gap-1 items-center">
      {top.map(([name]) => <AppAvatar key={name} name={name} size="sm" />)}
    </div>
  )
}

function ExpandedPanel({ s }) {
  const details = [
    ['Blinks', s.blinkCount ?? '—'],
    ['BPM', s.blinkRate || 0],
    ['Rhythm', rhythmLabel(s.blinkVariability)],
    ['Away', s.awaySeconds ? formatDuration(s.awaySeconds) : '—'],
    ['Pickups', s.phonePickups ?? 0],
    ['Mood', s.moodBefore ? moodLabel[s.moodBefore] : '—']
  ]
  return (
    <div className="bg-surface-2/50 border-t border-surface-3 rounded-b-lg px-3 py-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          {s.goal && (
            <div>
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">Goal</p>
              <p className="text-xs text-neutral-300 italic">"{s.goal}"</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {details.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] text-neutral-600 uppercase tracking-wider">{label}</span>
                <span className="text-xs text-neutral-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">Apps used</p>
          <AppUsageList usage={s.appUsage || {}} emptyText="No app data for this session." />
        </div>
      </div>
    </div>
  )
}

export default function SessionsTable({ sessions }) {
  const [range, setRange] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(
    () => filterByRange(sessions, range).slice().reverse(),
    [sessions, range]
  )
  const displayed = showAll ? filtered : filtered.slice(0, 8)

  const changeRange = (key) => {
    setRange(key)
    setExpandedId(null)
    setShowAll(false)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">Sessions</h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-neutral-600">
            {range === 'all' ? `${sessions.length} total` : `${filtered.length} of ${sessions.length}`}
          </span>
          <div className="flex gap-1">
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => changeRange(key)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md transition-colors ${
                  range === key ? 'bg-surface-2 text-neutral-200' : 'text-neutral-600 hover:text-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div
          className="grid text-[10px] text-neutral-600 uppercase tracking-wider px-2 mb-1"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <span>Date / Time</span><span>Duration</span><span>Focus</span><span>Pickups</span>
          <span>Apps</span><span>Outcome</span><span>Goal</span><span />
        </div>

        {displayed.length === 0 && (
          <p className="text-xs text-neutral-600 py-4 text-center">No sessions in this range.</p>
        )}

        {displayed.map((s) => {
          const d = new Date(s.date)
          const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
          const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const oc = s.outcomeRating != null ? outcomeConfig[s.outcomeRating] : null
          const expanded = expandedId === s.date
          return (
            <div key={s.date} className="rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId((p) => (p === s.date ? null : s.date))}
                className={`w-full grid items-center text-left text-xs px-2 py-2 transition-colors text-neutral-400 hover:bg-surface-2 ${expanded ? 'bg-surface-2 rounded-t-lg' : 'rounded-lg'}`}
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-neutral-300 text-[10px]">{dateStr}</span>
                  <span className="text-neutral-600 text-[10px]">{timeStr}</span>
                </span>
                <span>{formatDuration(s.duration)}</span>
                <FocusBadge score={s.focusScore} />
                <span className="flex items-center gap-1">
                  {(s.phonePickups ?? 0) > 0 ? (
                    <>
                      <Smartphone size={10} className="text-amber-400 flex-shrink-0" />
                      {s.phonePickups}
                    </>
                  ) : '—'}
                </span>
                <AppIconStrip usage={s.appUsage} />
                <span className={`text-[10px] font-medium ${oc?.cls || ''}`}>{oc ? oc.label : '—'}</span>
                <span className="min-w-0 truncate text-neutral-500 italic">{s.goal || '—'}</span>
                <ChevronDown
                  size={14}
                  className={`text-neutral-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded && <ExpandedPanel s={s} />}
            </div>
          )
        })}
      </div>

      {filtered.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full py-1.5 text-xs text-neutral-500 hover:text-neutral-300 border border-surface-3 hover:border-neutral-600 rounded-lg transition-colors"
        >
          {showAll ? 'Show less' : `Show all ${filtered.length} sessions`}
        </button>
      )}
    </div>
  )
}
