import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const OUTCOME_STATES = [
  { value: 1, label: 'Scattered', dotClass: 'text-red-400',    activeClass: 'border-red-500 bg-red-500/10 text-red-300' },
  { value: 2, label: 'Focused',   dotClass: 'text-amber-400',  activeClass: 'border-amber-500 bg-amber-500/10 text-amber-300' },
  { value: 3, label: 'Flow',      dotClass: 'text-violet-400', activeClass: 'border-violet-500 bg-violet-500/10 text-violet-300' },
]
import { useStore } from '../store'

const MOODS = [
  { value: 1, label: 'Tired',     emoji: '😴' },
  { value: 2, label: 'Bored',     emoji: '😑' },
  { value: 3, label: 'Neutral',   emoji: '😐' },
  { value: 4, label: 'Motivated', emoji: '💪' },
  { value: 5, label: 'Energized', emoji: '⚡' }
]

const BREATHING_CSS = `
  @keyframes breathe {
    0%   { transform: scale(1);   opacity: 0.35; }
    35%  { transform: scale(1.6); opacity: 1;    }
    55%  { transform: scale(1.6); opacity: 1;    }
    90%  { transform: scale(1);   opacity: 0.35; }
    100% { transform: scale(1);   opacity: 0.35; }
  }
  @keyframes breathe-ring {
    0%   { transform: scale(1);   opacity: 0.15; }
    35%  { transform: scale(1.8); opacity: 0.4;  }
    55%  { transform: scale(1.8); opacity: 0.4;  }
    90%  { transform: scale(1);   opacity: 0.15; }
    100% { transform: scale(1);   opacity: 0.15; }
  }
  .ritual-breathe { animation: breathe 8s ease-in-out infinite; }
  .ritual-breathe-ring { animation: breathe-ring 8s ease-in-out infinite; }
`

const AUTO_START_SECONDS = 32

export default function RitualModal({ onConfirmPre, onConfirmPost }) {
  const {
    ritualPhase, ritualGoal, ritualMoodBefore, phoneUseExpected,
    setRitualGoal, setRitualMoodBefore, setShowRitualModal, setPhoneUseExpected
  } = useStore()

  const [outcomeRating, setOutcomeRating] = useState(0)
  const [breathing, setBreathing] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_START_SECONDS)
  const [postCountdown, setPostCountdown] = useState(60)
  const autoStartRef = useRef(null)
  const countdownRef = useRef(null)
  const postCountdownRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(autoStartRef.current)
      clearInterval(countdownRef.current)
      clearInterval(postCountdownRef.current)
    }
  }, [])

  useEffect(() => {
    if (ritualPhase !== 'post') return
    setPostCountdown(60)
    postCountdownRef.current = setInterval(() => {
      setPostCountdown((prev) => {
        if (prev <= 1) { clearInterval(postCountdownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(postCountdownRef.current)
  }, [ritualPhase])

  const handleStartSession = () => {
    setBreathing(true)
    setCountdown(AUTO_START_SECONDS)

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    autoStartRef.current = setTimeout(() => {
      clearInterval(countdownRef.current)
      onConfirmPre()
    }, AUTO_START_SECONDS * 1000)
  }

  const skipBreathing = () => {
    clearTimeout(autoStartRef.current)
    clearInterval(countdownRef.current)
    onConfirmPre()
  }

  const handleDismissPre = () => {
    clearTimeout(autoStartRef.current)
    clearInterval(countdownRef.current)
    setShowRitualModal(false)
    setRitualGoal('')
    setRitualMoodBefore(null)
  }

  if (ritualPhase === 'pre') {
    if (breathing) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <style>{BREATHING_CSS}</style>
          <div className="bg-surface-1 border border-surface-3 rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
            <div className="flex flex-col items-center justify-center gap-8 px-6 py-12">
              <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                <div className="absolute w-40 h-40 rounded-full bg-violet-500/20 ritual-breathe-ring" />
                <div className="w-28 h-28 rounded-full bg-violet-500/50 ritual-breathe" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-neutral-300 font-medium">Breathe in… hold… breathe out…</p>
                <p className="text-xs text-neutral-600">Take a moment to settle in</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-surface-3">
              <span className="text-xs text-neutral-600">
                Starting in <span className="text-neutral-400 tabular-nums">{countdown}s</span>
              </span>
              <button
                onClick={skipBreathing}
                className="text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
              >
                Skip →
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-surface-1 border border-surface-3 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-5 shadow-2xl">

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-100">Before you begin</h2>
            <button onClick={handleDismissPre} className="text-neutral-600 hover:text-neutral-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-400">What's the session goal? (optional)</label>
            <input
              type="text"
              value={ritualGoal}
              onChange={(e) => setRitualGoal(e.target.value)}
              placeholder="My goal for this session…"
              className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-400">How are you feeling?</label>
            <div className="flex gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setRitualMoodBefore(ritualMoodBefore === m.value ? null : m.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-colors
                    ${ritualMoodBefore === m.value
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-surface-3 text-neutral-500 hover:border-neutral-600'}`}
                >
                  <span className="text-base leading-none">{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-400">Will you use your phone during this session?</label>
            <div className="flex gap-2">
              {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map(({ value, label }) => (
                <button
                  key={String(value)}
                  onClick={() => setPhoneUseExpected(phoneUseExpected === value ? null : value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors
                    ${phoneUseExpected === value
                      ? value === true
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-surface-3 text-neutral-500 hover:border-neutral-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end pt-1 border-t border-surface-3">
            <button
              onClick={handleStartSession}
              className="btn btn-primary text-sm"
            >
              Start Session
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Post phase
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-5 shadow-2xl">

        <h2 className="text-base font-semibold text-neutral-100">Session complete</h2>

        {ritualGoal && (
          <div className="bg-surface-2 rounded-lg px-4 py-3">
            <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">Your intention was</p>
            <p className="text-sm text-neutral-300 italic">"{ritualGoal}"</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-400">How did it go?</label>
          <div className="flex gap-2">
            {OUTCOME_STATES.map(({ value, label, dotClass, activeClass }) => (
              <button
                key={value}
                onClick={() => setOutcomeRating(outcomeRating === value ? 0 : value)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs transition-colors
                  ${outcomeRating === value ? activeClass : 'border-surface-3 text-neutral-500 hover:border-neutral-600'}`}
              >
                <span className={`text-base leading-none ${dotClass}`}>●</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neutral-600 tabular-nums">
            Closing in {postCountdown}s
          </span>
          <button
            onClick={() => onConfirmPost(outcomeRating || null)}
            className="btn btn-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
