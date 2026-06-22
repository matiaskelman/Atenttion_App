import { useState } from 'react'
import { Eye, EyeOff, Loader2, AlertTriangle, Activity, CheckCircle2, ChevronDown, HelpCircle } from 'lucide-react'
import { useStore } from '../store'
import { findBracket, getRelativeState, SCORE_CONFIG } from '../constants/blinksConfig'

function blinkRhythm(cv) {
  if (cv === null) return null
  if (cv < 0.40) return { label: 'Regular', color: 'text-emerald-400', tip: 'Consistent rhythm — focused state' }
  if (cv < 0.70) return { label: 'Variable', color: 'text-amber-400', tip: 'Some attentional fluctuation' }
  return { label: 'Irregular', color: 'text-red-400', tip: 'Erratic pattern — may be distracted or fatigued' }
}

function getBpmBracket(bpm) {
  const b = findBracket(bpm)
  return b ? { bracket: b.id, label: b.label, color: b.color, bg: b.bg, msg: b.msg } : null
}

const statusConfig = {
  looking:       { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Focused',            dot: 'bg-emerald-500' },
  away:          { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         label: 'Away',               dot: 'bg-red-500 animate-pulse' },
  blinking:      { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     label: 'Blinking',           dot: 'bg-amber-400' },
  'not-tracking':{ color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20',   label: 'Not tracking eyes',  dot: 'bg-orange-400 animate-pulse' },
  unknown:       { color: 'text-neutral-500', bg: 'bg-surface-2 border-surface-3',           label: 'Inactive',           dot: 'bg-neutral-600' }
}

export default function EyeTracker({ controls }) {
  const {
    eyeTrackingActive, eyeStatus, blinkCount, blinkRate,
    blinkVariability, liveFocusScore, modelLoaded, modelLoading, lookingAwaySeconds, camError, modelError,
    phoneDetected, baselineBpm, baselineBpmConfidence
  } = useStore()
  const { startCam, stopCam } = controls
  const [showDetails, setShowDetails] = useState(false)

  const rhythm  = blinkRhythm(blinkVariability)
  // Prefer the honest, baseline-RELATIVE state once a personal baseline is learned; otherwise fall
  // back to the absolute BPM brackets. `display` drives the BPM label/colour + the feedback banner.
  const relState = (baselineBpmConfidence >= SCORE_CONFIG.BASELINE_MIN_CONF && baselineBpm)
    ? getRelativeState(blinkRate, baselineBpm) : null
  const bracket = getBpmBracket(blinkRate)
  const display = relState || bracket
  const cfg     = statusConfig[eyeStatus] || statusConfig.unknown

  const focusTip = `Estimate from your blink patterns${relState ? ' vs your own baseline' : ''} — affected by dry eyes, lighting & screen distance.`

  return (
    <div className="card flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">Eye Tracking</h3>
        {modelLoading && (
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Loader2 size={11} className="animate-spin" /> Loading models…
          </span>
        )}
        {!modelLoading && modelLoaded && !eyeTrackingActive && (
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <CheckCircle2 size={11} /> Ready
          </span>
        )}
        {!modelLoading && !modelLoaded && (
          <span className="flex items-center gap-1 text-xs text-amber-500">
            <AlertTriangle size={11} /> Models not ready
          </span>
        )}
      </div>

      {/* Status pill */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
        <div className="flex flex-col">
          <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
          {eyeStatus === 'away' && lookingAwaySeconds > 0 && (
            <span className="text-xs text-neutral-500">Away for {lookingAwaySeconds}s</span>
          )}
          {eyeStatus === 'away' && (
            <span className="text-xs text-red-400/70">Timer paused automatically</span>
          )}
          {eyeStatus === 'not-tracking' && (
            <span className="text-xs text-orange-400/70">Turn your face toward the camera</span>
          )}
        </div>
        <div className="ml-auto">
          {eyeStatus === 'looking'       ? <Eye   size={18} className="text-emerald-400" /> :
           eyeStatus === 'away'          ? <EyeOff size={18} className="text-red-400" />    :
           eyeStatus === 'not-tracking'  ? <EyeOff size={18} className="text-orange-400" /> :
                                           <Eye   size={18} className="text-neutral-600" />}
        </div>
      </div>

      {/* Stats row */}
      {eyeTrackingActive && (
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-mini">
            <span className="stat-label">Blinks</span>
            <span className="stat-value">{blinkCount}</span>
          </div>
          <div className="stat-mini">
            <span className="stat-label">BPM</span>
            <span className={`stat-value ${display?.color || ''}`}>{blinkRate}</span>
            {display && <span className={`text-[9px] ${display.color}`}>{display.label}</span>}
          </div>
          <div className="stat-mini">
            <span className="stat-label flex items-center gap-1">
              Focus
              <HelpCircle size={10} className="text-neutral-600 cursor-help shrink-0" title={focusTip} aria-label={focusTip} />
            </span>
            <span className={`stat-value ${
              liveFocusScore == null   ? 'text-neutral-600' :
              liveFocusScore >= 80    ? 'text-emerald-400' :
              liveFocusScore >= 50    ? 'text-amber-400'   : 'text-red-400'
            }`}>
              {liveFocusScore ?? '—'}
            </span>
          </div>
        </div>
      )}

      {/* Feedback nudge — shown only for states that warrant one */}
      {eyeTrackingActive && display?.msg && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${display.bg}`}>
          <Activity size={12} className={`${display.color} shrink-0`} />
          <p className={`text-xs ${display.color}`}>{display.msg}</p>
        </div>
      )}

      {/* Secondary indicators tucked behind a Details expander to keep the card calm */}
      {eyeTrackingActive && rhythm && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors self-start"
          >
            <ChevronDown size={11} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            {showDetails ? 'Hide details' : 'Details'}
          </button>

          {showDetails && (
            /* Blink rhythm indicator */
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3">
              <Activity size={12} className={`${rhythm.color} shrink-0`} />
              <div className="flex flex-col">
                <span className={`text-xs font-medium ${rhythm.color}`}>Rhythm: {rhythm.label}</span>
                <span className="text-[10px] text-neutral-600">{rhythm.tip}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phone detection banner */}
      {phoneDetected && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40">
          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-amber-300">Phone detected — timer paused</span>
            <span className="text-[10px] text-amber-500/80">Look back at the camera to resume in 5s</span>
          </div>
        </div>
      )}

      {/* Camera error */}
      {camError && (
        <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
          {camError}
        </p>
      )}

      {/* Model load error */}
      {modelError && (
        <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20 break-all">
          Model error: {modelError}
        </p>
      )}

      {/* Toggle button */}
      <button
        onClick={eyeTrackingActive ? stopCam : startCam}
        disabled={modelLoading || (!eyeTrackingActive && !modelLoaded)}
        className={`btn w-full mt-auto ${
          eyeTrackingActive ? 'btn-danger'
          : !modelLoaded ? 'btn-primary opacity-40 cursor-not-allowed'
          : 'btn-primary'
        }`}
      >
        {modelLoading ? (
          <><Loader2 size={14} className="animate-spin" /> Loading…</>
        ) : !modelLoaded && !eyeTrackingActive ? (
          <><Loader2 size={14} className="animate-spin" /> Models not ready…</>
        ) : eyeTrackingActive ? (
          <><EyeOff size={14} /> Stop Tracking</>
        ) : (
          <><Eye size={14} /> Start Eye Tracking</>
        )}
      </button>
    </div>
  )
}
