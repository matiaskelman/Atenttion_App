import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  Sparkles, Timer, ScanEye, Gauge, ListChecks, Target,
  BarChart2, Trophy, Headphones, Monitor, Settings2,
  Camera, Check, ChevronLeft, ChevronRight, X
} from 'lucide-react'
import { useStore } from '../store'

// First-run spotlight tour. Mounted at the App root (sibling of RitualModal) only while
// `showTour` is true. Each step optionally switches the active page and highlights a real
// UI element by selector (the sidebar already exposes `data-page`; cards expose `data-tour`).
// Orchestration (step index, measuring, placement) lives here; the store only gates the mount.
const STEPS = [
  {
    icon: Sparkles, page: 'focus', target: null, placement: 'center',
    title: 'Welcome to Atenttion',
    body: "A focus companion that times your work and — if you let it — gauges your attention through your webcam. Here's a quick 60-second tour."
  },
  {
    icon: Timer, page: 'focus', target: '[data-tour="timer"]', placement: 'right',
    title: 'Your focus timer',
    body: 'Press play to start a focus session — 25 minutes by default, fully adjustable. Or switch to Free Rider for an open-ended, count-up session.'
  },
  {
    icon: ScanEye, page: 'focus', target: '[data-tour="eyetracker"]', placement: 'left', kind: 'camera',
    title: 'Attention-aware (optional)',
    body: 'Atenttion can use your webcam to estimate focus from your blink patterns and gently pause the timer when you look away. It runs 100% on your device — no video is recorded, stored, or uploaded. Totally optional; the timer works fine without it.'
  },
  {
    icon: Gauge, page: 'focus', target: '[data-tour="eyetracker"]', placement: 'left',
    title: 'The Focus Score',
    body: "While tracking, you'll see a Focus Score (0–100). Treat it as an honest estimate from your blink patterns — not a precise measurement. It learns your personal baseline over your first couple of sessions and gets sharper over time."
  },
  {
    icon: ListChecks, page: 'focus', target: '[data-tour="tasks"]', placement: 'left',
    title: 'Tasks',
    body: 'Jot down what you want to work on, add an optional due date, and check things off as you go.'
  },
  {
    icon: Target, page: 'focus', target: '[data-tour="daily-strip"]', placement: 'top',
    title: 'Your day at a glance',
    body: "Today's focus time, sessions, and your day streak — tracked against the daily goal you set."
  },
  {
    icon: BarChart2, page: 'stats', target: '[data-page="stats"]', placement: 'right',
    title: 'Stats',
    body: 'Weekly recaps, your best focus hours, a consistency calendar, and your full session history live here.'
  },
  {
    icon: Trophy, page: 'milestones', target: '[data-tour="getting-started"]', placement: 'bottom',
    title: 'Goals & Getting Started',
    body: 'Badges, long-term milestones, and this Getting Started checklist. Finish these at your own pace to discover the rest of the app.'
  },
  {
    icon: Headphones, page: 'audios', target: '[data-page="audios"]', placement: 'right',
    title: 'Audio',
    body: 'On-device ambient soundscapes — white/pink/brown noise, lo-fi, rain, forest, café — to help you settle in.'
  },
  {
    icon: Monitor, page: 'system', target: '[data-page="system"]', placement: 'right',
    title: 'System',
    body: 'A quick glance at CPU, memory, and your active app while you work.'
  },
  {
    icon: Settings2, page: 'settings', target: '[data-page="settings"]', placement: 'right',
    title: 'Settings',
    body: 'Customize timer lengths, your daily goal, rituals, focus wallpaper, and eye-tracking sensitivity. Everything saves automatically — and you can replay this tour anytime from here.'
  }
]

const PAD = 6     // breathing room around the spotlighted element
const CARD_W = 340

export default function OnboardingTour({ eyeTrackerControls }) {
  const setShowTour = useStore((s) => s.setShowTour)
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted)
  const setPage = useStore((s) => s.setPage)
  const eyeTrackingActive = useStore((s) => s.eyeTrackingActive)
  const modelLoaded = useStore((s) => s.modelLoaded)
  const modelLoading = useStore((s) => s.modelLoading)

  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)      // viewport rect of the spotlighted element (null = centered)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const cardRef = useRef(null)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const finish = () => {
    setOnboardingCompleted(true)
    setShowTour(false)
    setPage('focus')
  }

  // Switch page if needed, then measure the target element (retrying across frames
  // so a freshly-remounted page has time to paint). Re-measure on resize.
  useEffect(() => {
    const s = STEPS[step]
    if (s.page && useStore.getState().page !== s.page) setPage(s.page)

    let raf, tries = 0
    const measure = () => {
      if (!s.target) { setRect(null); return }
      const el = document.querySelector(s.target)
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else if (tries++ < 30) {
        raf = requestAnimationFrame(measure)
      } else {
        setRect(null) // target never appeared — fall back to a centered coachmark
      }
    }
    raf = requestAnimationFrame(measure)
    const settle = setTimeout(measure, 320) // catch post-transition layout
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      window.removeEventListener('resize', measure)
    }
  }, [step, setPage])

  // Esc skips the tour
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Position the coachmark relative to the spotlight, then clamp it on-screen.
  useLayoutEffect(() => {
    const cw = cardRef.current?.offsetWidth || CARD_W
    const ch = cardRef.current?.offsetHeight || 220
    const vw = window.innerWidth, vh = window.innerHeight
    const gap = 16
    let top, left

    if (!rect) {
      top = (vh - ch) / 2
      left = (vw - cw) / 2
    } else {
      const place = current.placement || 'bottom'
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      if (place === 'top')        { top = rect.top - ch - gap;        left = cx - cw / 2 }
      else if (place === 'left')  { top = cy - ch / 2;                left = rect.left - cw - gap }
      else if (place === 'right') { top = cy - ch / 2;                left = rect.left + rect.width + gap }
      else                        { top = rect.top + rect.height + gap; left = cx - cw / 2 }
      // Flip vertically if the preferred side overflows
      if (place === 'bottom' && top + ch > vh - gap) top = rect.top - ch - gap
      if (place === 'top' && top < gap)              top = rect.top + rect.height + gap
    }

    top = Math.min(Math.max(gap, top), vh - ch - gap)
    left = Math.min(Math.max(gap, left), vw - cw - gap)
    setPos({ top, left })
  }, [rect, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = current.icon

  // Camera-enable affordance state for the eye-tracking step
  const camReady = modelLoaded && !modelLoading
  const camLabel = eyeTrackingActive ? 'Camera on' : camReady ? 'Enable camera' : 'Preparing camera…'

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Click shield — keeps the tour guided (clicks outside the coachmark do nothing).
          Dims the whole screen for centered steps; the box-shadow below handles dimming
          when an element is spotlighted. */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-black/70'}`} onClick={(e) => e.stopPropagation()} />

      {/* Spotlight cutout — the huge box-shadow dims everything outside this rect */}
      {rect && (
        <div
          className="absolute rounded-xl ring-2 ring-violet-400/80 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)'
          }}
        />
      )}

      {/* Coachmark */}
      <div
        ref={cardRef}
        className="absolute card animate-pop shadow-violet"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {/* keyed so the icon + copy gently re-animate on each step */}
          <div key={step} className="flex items-start gap-3 min-w-0 flex-1 animate-pop">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <Icon size={17} className="text-violet-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-100">{current.title}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mt-1">{current.body}</p>
            </div>
          </div>
          <button
            onClick={finish}
            aria-label="Skip tour"
            className="btn-icon shrink-0 -mt-1 -mr-1 text-neutral-500 hover:text-neutral-300"
          >
            <X size={15} />
          </button>
        </div>

        {/* Camera-enable button (eye-tracking step only) */}
        {current.kind === 'camera' && (
          <button
            onClick={() => { if (camReady && !eyeTrackingActive) eyeTrackerControls?.startCam?.() }}
            disabled={!camReady || eyeTrackingActive}
            className={`btn w-full mt-3 ${eyeTrackingActive ? 'btn-secondary text-emerald-400' : 'btn-primary'}`}
          >
            {eyeTrackingActive ? <Check size={14} /> : <Camera size={14} />} {camLabel}
          </button>
        )}

        {/* Footer — step counter + nav over a slim progress bar (matches the app's
            progress-bar language; can't misalign like a long row of dots) */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] text-neutral-600 tabular-nums">
              Step {step + 1} of {STEPS.length}
            </span>
            <div className="flex items-center gap-2">
              {step === 0 ? (
                <button onClick={finish} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors px-1.5 py-1.5">
                  Skip
                </button>
              ) : (
                <button onClick={() => setStep((s) => s - 1)} className="btn btn-secondary px-2.5 py-1.5">
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              {isLast ? (
                <button onClick={finish} className="btn btn-primary px-3 py-1.5">
                  Start focusing
                </button>
              ) : (
                <button onClick={() => setStep((s) => s + 1)} className="btn btn-primary px-3 py-1.5">
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
