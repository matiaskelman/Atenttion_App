import Pomodoro from '../Pomodoro'
import EyeTracker from '../EyeTracker'
import { useStore } from '../../store'
import { Clock, Flame, Zap } from 'lucide-react'
import { formatDuration } from '../../utils/format'

export default function FocusPage({ pomodoroControls, eyeTrackerControls }) {
  const { todayFocusSeconds, sessions, streak, bestStreak, dailyGoalSeconds, ritualGoal, pomodoroState, pomodoroMode } = useStore()
  const todaySessions = sessions.filter(
    (s) => new Date(s.date).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
  ).length

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Focus</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Pomodoro timer with eye-tracking attention monitoring</p>
      </div>

      {/* Daily goal progress */}
      {(() => {
        const pct = Math.min(100, Math.round((todayFocusSeconds / dailyGoalSeconds) * 100))
        const remaining = Math.max(0, dailyGoalSeconds - todayFocusSeconds)
        return (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-neutral-500">Daily goal</span>
              <span className="text-xs text-neutral-400">
                {pct >= 100
                  ? <span className="text-violet-400 font-medium">Goal reached!</span>
                  : <>{formatDuration(todayFocusSeconds)} / {formatDuration(dailyGoalSeconds)}</>}
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
        )
      })()}

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card-sm">
          <Clock size={14} className="text-violet-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{formatDuration(todayFocusSeconds)}</span>
          <span className="text-xs text-neutral-500">Today's focus</span>
        </div>
        <div className="card-sm">
          <Flame size={14} className="text-amber-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{todaySessions}</span>
          <span className="text-xs text-neutral-500">Sessions today</span>
        </div>
        <div className="card-sm">
          <Zap size={14} className="text-emerald-400 mb-1" />
          <span className="text-lg font-semibold text-neutral-100">{streak ? `${streak}d` : '—'}</span>
          <span className="text-xs text-neutral-500">Day streak</span>
          {bestStreak > 0 && (
            <span className="text-[10px] text-neutral-600 mt-0.5">best: {bestStreak}d</span>
          )}
        </div>
      </div>

      {/* Active session goal */}
      {ritualGoal && pomodoroMode === 'work' && pomodoroState === 'work' && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
          <span className="text-[10px] text-violet-400/60 uppercase tracking-wider shrink-0">Goal</span>
          <span className="text-xs text-neutral-400 italic truncate">{ritualGoal}</span>
        </div>
      )}

      {/* Main panels */}
      <div className="grid grid-cols-[1fr_260px] gap-4">
        <Pomodoro controls={pomodoroControls} />
        <div className="flex flex-col gap-4">
          <EyeTracker controls={eyeTrackerControls} />
        </div>
      </div>
    </div>
  )
}
