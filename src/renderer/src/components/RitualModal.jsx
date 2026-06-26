import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { dueInfo } from './Tasks'

const OUTCOME_STATES = [
  { value: 1, label: 'Scattered', dotClass: 'text-red-400',    activeClass: 'border-red-500 bg-red-500/10 text-red-300' },
  { value: 2, label: 'Focused',   dotClass: 'text-amber-400',  activeClass: 'border-amber-500 bg-amber-500/10 text-amber-300' },
  { value: 3, label: 'Flow',      dotClass: 'text-violet-400', activeClass: 'border-violet-500 bg-violet-500/10 text-violet-300' },
]

const MOODS = [
  { value: 1, label: 'Tired',     emoji: '😴' },
  { value: 2, label: 'Bored',     emoji: '😑' },
  { value: 3, label: 'Neutral',   emoji: '😐' },
  { value: 4, label: 'Motivated', emoji: '💪' },
  { value: 5, label: 'Energized', emoji: '⚡' }
]

// Breath cycle: 8 s total — inhale 35%, hold 20%, exhale 35%, rest 10%
const CYCLE_MS = 8000
const PHASES = [
  { label: 'Breathe in',  sub: 'slow and steady',    end: 0.35 },
  { label: 'Hold',        sub: 'feel the stillness',  end: 0.55 },
  { label: 'Breathe out', sub: 'release completely',  end: 0.90 },
  { label: '',            sub: '',                     end: 1.00 },
]

// Arc circumference for r = 108: 2π × 108 ≈ 678.6
const ARC_C = 678.6

const BREATHING_CSS = `
  @keyframes breathe-core {
    0%   { transform: scale(1);    box-shadow: 0 0  0px  0px rgba(139,92,246,0.45); }
    35%  { transform: scale(1.52); box-shadow: 0 0 56px 18px rgba(139,92,246,0.18); }
    55%  { transform: scale(1.52); box-shadow: 0 0 56px 18px rgba(139,92,246,0.18); }
    90%  { transform: scale(1);    box-shadow: 0 0  0px  0px rgba(139,92,246,0.45); }
    100% { transform: scale(1);    box-shadow: 0 0  0px  0px rgba(139,92,246,0.45); }
  }
  @keyframes breathe-ring-1 {
    0%   { transform: scale(1);    opacity: 0.45; }
    35%  { transform: scale(1.45); opacity: 0.16; }
    55%  { transform: scale(1.45); opacity: 0.16; }
    90%  { transform: scale(1);    opacity: 0.45; }
    100% { transform: scale(1);    opacity: 0.45; }
  }
  @keyframes breathe-ring-2 {
    0%   { transform: scale(1);    opacity: 0.22; }
    35%  { transform: scale(1.32); opacity: 0.07; }
    55%  { transform: scale(1.32); opacity: 0.07; }
    90%  { transform: scale(1);    opacity: 0.22; }
    100% { transform: scale(1);    opacity: 0.22; }
  }
  @keyframes arc-sweep {
    from { stroke-dashoffset: ${ARC_C}; }
    to   { stroke-dashoffset: 0; }
  }
  .ritual-core   { animation: breathe-core   8s ease-in-out infinite; }
  .ritual-ring-1 { animation: breathe-ring-1 8s ease-in-out infinite 0.08s; }
  .ritual-ring-2 { animation: breathe-ring-2 8s ease-in-out infinite 0.18s; }
  .ritual-arc    { animation: arc-sweep      8s linear     infinite; }
`

const AUTO_START_SECONDS = 32

export default function RitualModal({ onConfirmPre, onConfirmPost }) {
  const {
    ritualPhase, ritualGoal, ritualMoodBefore, phoneUseExpected, pendingSessionScore, tasks,
    setRitualGoal, setRitualMoodBefore, setShowRitualModal, setPhoneUseExpected
  } = useStore()

  const [goalFocused, setGoalFocused] = useState(false)
  const [outcomeRating, setOutcomeRating] = useState(0)

  // Suggest the user's open tasks as the session goal — filtered by what's typed, soonest-due first.
  const q = ritualGoal.trim().toLowerCase()
  const goalSuggestions = tasks
    .filter((t) => !t.done && t.title.toLowerCase() !== q && (!q || t.title.toLowerCase().includes(q)))
    .sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity))
    .slice(0, 5)
  const [breathing, setBreathing] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_START_SECONDS)
  const [postCountdown, setPostCountdown] = useState(60)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [textVisible, setTextVisible] = useState(true)
  const autoStartRef = useRef(null)
  const countdownRef = useRef(null)
  const postCountdownRef = useRef(null)
  const phaseRef = useRef(0)
  const breathStartRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(autoStartRef.current)
      clearInterval(countdownRef.current)
      clearInterval(postCountdownRef.current)
    }
  }, [])

  // Drive phase label in sync with the 8-second CSS animation cycle
  useEffect(() => {
    if (!breathing) return
    breathStartRef.current = Date.now()
    phaseRef.current = 0
    setPhaseIdx(0)
    setTextVisible(true)
    const id = setInterval(() => {
      const progress = ((Date.now() - breathStartRef.current) % CYCLE_MS) / CYCLE_MS
      const next = PHASES.findIndex((p) => progress < p.end)
      if (next !== phaseRef.current) {
        phaseRef.current = next
        setTextVisible(false)
        setTimeout(() => { setPhaseIdx(next); setTextVisible(true) }, 160)
      }
    }, 50)
    return () => clearInterval(id)
  }, [breathing])

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <style>{BREATHING_CSS}</style>
          <div className="bg-surface-1 border border-surface-3 rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
            <div className="flex flex-col items-center justify-center gap-6 px-6 py-10">

              {/* Animation container */}
              <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>

                {/* SVG: track ring + sweep arc */}
                <svg width="240" height="240" className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                  {/* Faint guide circle */}
                  <circle cx="120" cy="120" r="108"
                    fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="1.5"
                  />
                  {/* Sweep arc — starts at top, rotated -90° at the SVG level */}
                  <circle cx="120" cy="120" r="108"
                    fill="none" stroke="rgba(139,92,246,0.65)" strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={ARC_C} strokeDashoffset={ARC_C}
                    className="ritual-arc"
                    transform="rotate(-90 120 120)"
                  />
                </svg>

                {/* Outer ripple */}
                <div className="absolute w-52 h-52 rounded-full bg-violet-500/5 ritual-ring-2" />
                {/* Middle ripple */}
                <div className="absolute w-40 h-40 rounded-full bg-violet-500/10 ritual-ring-1" />
                {/* Core */}
                <div className="w-24 h-24 rounded-full bg-violet-500/60 ritual-core" />
              </div>

              {/* Phase text */}
              <div className="flex flex-col items-center gap-1.5" style={{ minHeight: 44 }}>
                <p className={`text-base font-medium text-neutral-100 transition-opacity duration-150 ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
                  {PHASES[phaseIdx].label}
                </p>
                <p className={`text-xs text-neutral-500 transition-opacity duration-150 ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
                  {PHASES[phaseIdx].sub}
                </p>
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
            <div className="relative">
              <input
                type="text"
                value={ritualGoal}
                onChange={(e) => setRitualGoal(e.target.value)}
                onFocus={() => setGoalFocused(true)}
                onBlur={() => setGoalFocused(false)}
                placeholder="My goal for this session…"
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-violet-500 transition-colors"
              />
              {/* Pick an existing task as the goal */}
              {goalFocused && goalSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-1 border border-surface-3 rounded-lg shadow-xl overflow-hidden max-h-44 overflow-y-auto">
                  <p className="px-3 pt-2 pb-1 text-[10px] text-neutral-600 uppercase tracking-wider">From your tasks</p>
                  {goalSuggestions.map((t) => {
                    const due = dueInfo(t.due, false)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        // onMouseDown (not onClick) fires before the input's blur, so the pick registers
                        onMouseDown={(e) => { e.preventDefault(); setRitualGoal(t.title); setGoalFocused(false) }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2 transition-colors"
                      >
                        <span className="flex-1 min-w-0 truncate text-xs text-neutral-300">{t.title}</span>
                        {due && <span className={`text-[10px] shrink-0 tabular-nums ${due.color}`}>{due.label}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
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

        {/* Frozen Focus Score earned this session — locked in before the survey, so it never
            changes while you answer. null = not enough data to score it confidently. */}
        <div className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Focus score</span>
            <span className="text-[10px] text-neutral-600">Locked in for this session</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            pendingSessionScore == null ? 'text-neutral-600' :
            pendingSessionScore >= 80  ? 'text-emerald-400' :
            pendingSessionScore >= 50  ? 'text-amber-400'   : 'text-red-400'
          }`}>
            {pendingSessionScore ?? '—'}
          </span>
        </div>

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
