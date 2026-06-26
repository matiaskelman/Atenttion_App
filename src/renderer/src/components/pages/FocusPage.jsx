import Pomodoro from '../Pomodoro'
import EyeTracker from '../EyeTracker'
import Tasks from '../Tasks'
import { useStore } from '../../store'
import { Clock, Flame, Zap } from 'lucide-react'
import { formatDuration } from '../../utils/format'

export default function FocusPage({ pomodoroControls, eyeTrackerControls }) {
  const { todayFocusSeconds, sessions, streak, bestStreak, dailyGoalSeconds, ritualGoal, pomodoroState, pomodoroMode } = useStore()
  const todaySessions = sessions.filter(
    (s) => new Date(s.date).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
  ).length

  const pct = Math.min(100, Math.round((todayFocusSeconds / dailyGoalSeconds) * 100))
  const remaining = Math.max(0, dailyGoalSeconds - todayFocusSeconds)
  // The bar tracks goal progress only, so its numerator never exceeds the goal
  // (today's *actual* total — which can run past the goal — is shown as its own chip).
  const goalProgress = Math.min(todayFocusSeconds, dailyGoalSeconds)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Focus</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Pomodoro timer with eye-tracking attention monitoring</p>
      </div>

      {/* Active session goal — sits right above the timer it belongs to */}
      {ritualGoal && pomodoroMode === 'work' && pomodoroState === 'work' && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
          <span className="text-[10px] text-violet-400/60 uppercase tracking-wider shrink-0">Goal</span>
          <span className="text-xs text-neutral-400 italic truncate">{ritualGoal}</span>
        </div>
      )}

      {/* Main panels — the timer is the hero; the right column stacks Eye Tracking (natural
          height) over the Tasks list (fills the rest, so the column bottom aligns with the timer) */}
      <div className="grid grid-cols-[1fr_280px] gap-4 items-stretch">
        <Pomodoro controls={pomodoroControls} />
        <div className="flex flex-col gap-4 min-h-0">
          <EyeTracker controls={eyeTrackerControls} />
          <Tasks />
        </div>
      </div>

      {/* Compact daily strip — goal progress + today's stats in one row */}
      <div data-tour="daily-strip" className="mt-5 card flex items-center gap-6">
        {/* Goal progress — goal only (capped at the goal) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-neutral-500">Daily goal</span>
            <span className={`text-xs ${pct >= 100 ? 'text-emerald-400 font-medium' : 'text-neutral-400'}`}>
              {formatDuration(dailyGoalSeconds)}{pct >= 100 ? ' · Goal reached!' : ''}
            </span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${pct >= 100 ? 'bg-emerald-500' : 'bg-violet-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct < 100 && remaining > 0 && (
            <p className="text-[10px] text-neutral-600 mt-1">{formatDuration(remaining)} to go</p>
          )}
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-surface-3 shrink-0" />

        {/* Today's stats */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col items-center">
            <Clock size={14} className="text-violet-400 mb-1" />
            <span className="text-lg font-semibold text-neutral-100 leading-none">{formatDuration(todayFocusSeconds)}</span>
            <span className="text-[10px] text-neutral-500 mt-1">Focus</span>
          </div>
          <div className="flex flex-col items-center">
            <Zap size={14} className="text-amber-400 mb-1" />
            <span className="text-lg font-semibold text-neutral-100 leading-none">{todaySessions}</span>
            <span className="text-[10px] text-neutral-500 mt-1">Sessions</span>
          </div>
          <div className="flex flex-col items-center">
            <Flame size={14} className="text-orange-400 mb-1" />
            <span className="text-lg font-semibold text-neutral-100 leading-none">{streak ? `${streak}d` : '—'}</span>
            <span className="text-[10px] text-neutral-500 mt-1">{bestStreak > 0 ? `Streak · best ${bestStreak}d` : 'Streak'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
