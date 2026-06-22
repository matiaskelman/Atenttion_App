import { useState, useRef } from 'react'
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react'
import { useStore } from '../store'
import { formatTime } from '../utils/format'

const modeLabel = {
  work: 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break'
}

const modeColor = {
  work: { ring: '#7c3aed', glow: 'rgba(124,58,237,0.3)', text: 'text-violet-400', badge: 'bg-violet-500/20 text-violet-400' },
  'short-break': { ring: '#10b981', glow: 'rgba(16,185,129,0.3)', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400' },
  'long-break': { ring: '#06b6d4', glow: 'rgba(6,182,212,0.3)', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-400' }
}

export default function Pomodoro({ controls }) {
  const { pomodoroState, pomodoroMode, timeLeft, workDuration, shortBreakDuration, longBreakDuration, sessionsCompleted } = useStore()
  const { start, pause, reset, skip } = controls

  const totalDuration = pomodoroMode === 'work' ? workDuration :
    pomodoroMode === 'short-break' ? shortBreakDuration : longBreakDuration

  const progress = 1 - timeLeft / totalDuration
  const isRunning = pomodoroState === 'work' || pomodoroState === 'break'
  const colors = modeColor[pomodoroMode]

  // Reset needs a confirm step when a session is in progress (running, paused, or
  // partially elapsed) so an accidental click can't silently wipe it.
  const [confirmReset, setConfirmReset] = useState(false)
  const confirmTimerRef = useRef(null)
  const hasProgress = isRunning || pomodoroState === 'paused' || progress > 0

  const handleReset = () => {
    if (!hasProgress) { reset(); return }
    if (confirmReset) {
      clearTimeout(confirmTimerRef.current)
      setConfirmReset(false)
      reset()
    } else {
      setConfirmReset(true)
      confirmTimerRef.current = setTimeout(() => setConfirmReset(false), 3000)
    }
  }

  // SVG ring
  const size = 220
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <div className="card flex flex-col items-center justify-center h-full gap-6 py-8">
      {/* Mode badge */}
      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${colors.badge}`}>
        {modeLabel[pomodoroMode]}
      </span>

      {/* Ring + Timer */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={colors.ring} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 8px ${colors.glow})` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="font-mono text-5xl font-semibold tracking-tight text-neutral-100">
            {formatTime(timeLeft)}
          </span>
          <span className="text-xs text-neutral-500">
            {pomodoroState === 'paused' ? 'Paused' : isRunning ? 'Running' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          className={`btn-icon ${confirmReset ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-500 hover:text-neutral-300'}`}
          title={confirmReset ? 'Click again to reset' : 'Reset'}
          aria-label={confirmReset ? 'Confirm reset, discard session' : 'Reset timer'}
        >
          <RotateCcw size={16} />
        </button>

        <button
          onClick={isRunning ? pause : start}
          aria-label={isRunning ? 'Pause timer' : 'Start timer'}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            pomodoroMode === 'work'
              ? 'bg-violet-600 hover:bg-violet-500 shadow-violet'
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          {isRunning
            ? <Pause size={22} fill="currentColor" />
            : <Play size={22} fill="currentColor" className="ml-0.5" />
          }
        </button>

        <button
          onClick={skip}
          className="btn-icon text-neutral-500 hover:text-neutral-300"
          title="Skip"
          aria-label="Skip to next session"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Reset confirm hint */}
      {confirmReset && (
        <p className="text-xs text-amber-400 -mt-2">Click reset again to discard this session</p>
      )}

      {/* Session dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < (sessionsCompleted % 4) ? 'bg-violet-500' : 'bg-surface-3'
            }`}
          />
        ))}
        <span className="text-xs text-neutral-600 ml-1">{sessionsCompleted} total</span>
      </div>
    </div>
  )
}
