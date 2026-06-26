import { useState, useMemo } from 'react'
import { ChevronDown, Smartphone, Check, EyeOff, TrendingDown, Moon, Sparkles } from 'lucide-react'
import { AppUsageList, AppAvatar } from './AppUsageList'
import { formatDuration } from '../utils/format'
import { explainScore } from '../utils/scoreBreakdown'

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

function FocusBadge({ score, confidence }) {
  const low = confidence === 'low'
  const cls = score == null ? 'bg-surface-2 text-neutral-600'
    : score >= 80 ? 'bg-emerald-500/15 text-emerald-400'
    : score >= 50 ? 'bg-amber-500/15 text-amber-400'
    : 'bg-red-500/15 text-red-400'
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls} ${low ? 'opacity-50' : ''}`}
      title={score == null ? 'Not enough data to score this session' : low ? 'Low confidence — short or sparse session' : undefined}
    >
      {score == null ? '—' : low ? `~${score}` : score}
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

const impactChip = {
  slight: 'bg-neutral-500/10 text-neutral-400',
  moderate: 'bg-amber-500/15 text-amber-400',
  large: 'bg-red-500/15 text-red-400'
}

// Penalty severity → red intensity, shared by the composition bar and its legend swatches.
const impactRed = {
  slight: 'bg-red-500/40',
  moderate: 'bg-red-500/70',
  large: 'bg-red-500'
}

const factorIcon = { presence: EyeOff, phone: Smartphone, drift: TrendingDown, fatigue: Moon }
const factorShort = { presence: 'Away', phone: 'Phone', drift: 'Drift', fatigue: 'Fatigue' }

const scoreTone = (score) =>
  score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'

// Per-session "Why this score?" breakdown: a composition bar (kept-vs-lost out of 100) over a
// +base / −penalty ledger. Surfaces the stored score factors in plain language without exposing any
// tuning constant or formula. Pure renderer — ExpandedPanel decides when to show it (and places it
// first so it's the headline of the expanded row, not buried below the metrics).
function ScoreBreakdown({ exp, confidenceLow }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header + final score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">Why this score</p>
          <span className="text-[9px] text-neutral-700">an estimate from your blink signal</span>
        </div>
        <div className="flex items-baseline gap-0.5 leading-none">
          <span className={`text-2xl font-semibold tabular-nums ${scoreTone(exp.final)}`}>{exp.final}</span>
          <span className="text-[10px] text-neutral-600">/100</span>
        </div>
      </div>

      {/* Composition bar — green kept + red lost, scaled out of 100 (faint tail = headroom) */}
      <div className="flex flex-col gap-1.5">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3"
          title={`Kept ${exp.final} of a ${exp.base.value} base`}
        >
          <div className="bg-emerald-500" style={{ width: `${exp.final}%` }} />
          {exp.deductions.map((d) => (
            <div key={d.key} className={impactRed[d.impact]} style={{ width: `${Math.abs(d.pts)}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Kept {exp.final}
          </span>
          {exp.deductions.map((d) => (
            <span key={d.key} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${impactRed[d.impact]}`} /> {factorShort[d.key]} {d.pts}
            </span>
          ))}
        </div>
      </div>

      {/* Ledger: +base, −penalties, ✓ positives */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 min-w-0">
            <Sparkles size={12} className="text-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-medium flex-shrink-0">{exp.base.label}</span>
            <span className="text-[10px] text-neutral-600 truncate">{exp.base.note}</span>
          </span>
          <span className="text-emerald-400 font-medium tabular-nums">+{exp.base.value}</span>
        </div>

        {exp.deductions.map((d) => {
          const Icon = factorIcon[d.key]
          return (
            <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 min-w-0">
                {Icon && <Icon size={12} className="text-neutral-500 flex-shrink-0" />}
                <span className="text-neutral-300 flex-shrink-0">{d.label}</span>
                <span className="text-[10px] text-neutral-600 truncate">{d.value}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${impactChip[d.impact]}`}>
                  {d.impact}
                </span>
              </span>
              <span className="text-red-400 tabular-nums">{d.pts}</span>
            </div>
          )
        })}

        {exp.positives.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
            {exp.positives.map((p) => (
              <span key={p} className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                <Check size={9} /> {p}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-neutral-500 leading-snug">{exp.summary}</p>
      {confidenceLow && (
        <p className="text-[10px] text-amber-400/70">Short or sparse session — lower confidence.</p>
      )}
    </div>
  )
}

function ExpandedPanel({ s }) {
  const exp = explainScore(s)
  const showOldNote = !exp && s.focusScore != null && !s.scoreBreakdown
  const hasScoreBlock = !!exp || showOldNote
  const details = [
    ['Blinks', s.blinkCount ?? '—'],
    ['BPM', s.blinkRate || 0],
    ['Rhythm', rhythmLabel(s.blinkVariability)],
    ['Away', s.awaySeconds ? formatDuration(s.awaySeconds) : '—'],
    ['Pickups', s.phonePickups ?? 0],
    ['Mood', s.moodBefore ? moodLabel[s.moodBefore] : '—']
  ]
  return (
    <div className="bg-surface-2/50 border-t border-surface-3 rounded-b-lg px-3 py-3 flex flex-col gap-3">
      {/* Score breakdown is the headline of the expanded row — shown first, no scrolling to find it */}
      {exp && <ScoreBreakdown exp={exp} confidenceLow={s.scoreConfidence === 'low'} />}
      {showOldNote && (
        <p className="text-[10px] text-neutral-600">
          Detailed breakdown isn't available for sessions recorded before this update.
        </p>
      )}

      {/* Goal + metrics and Apps stacked as full-width bands so each uses the full horizontal space */}
      <div className={`flex flex-col gap-4 ${hasScoreBlock ? 'pt-3 border-t border-surface-3' : ''}`}>
        <div className="flex flex-col gap-3">
          {s.goal && (
            <div>
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">Goal</p>
              <p className="text-xs text-neutral-300 italic">"{s.goal}"</p>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2">
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
          <AppUsageList usage={s.appUsage || {}} emptyText="No app data for this session." cols={2} />
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
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-neutral-300">Sessions</h3>
          {sessions.length > 0 && (
            <span className="text-[10px] text-neutral-600">Tap a session to see why it scored what it did</span>
          )}
        </div>
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
                <FocusBadge score={s.focusScore} confidence={s.scoreConfidence} />
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
