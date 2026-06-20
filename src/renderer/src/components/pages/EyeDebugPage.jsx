import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts'
import { useStore } from '../../store'
import { registerDebugCanvas, earChartBufferRef, EAR_THRESHOLD_RATIO, TYPING_VETO_MS } from '../../hooks/useEyeTracker'
import { SCORE_CONFIG } from '../../constants/blinksConfig'

const MAX_HISTORY = 300   // ~10 s at 30 fps
const RENDER_INTERVAL = 100  // ms — throttle chart re-renders to ~10 fps

// ─── Concept cards data ──────────────────────────────────────────────────────

const concepts = [
  {
    title: 'Eye Aspect Ratio (EAR)',
    body: 'EAR measures how open your eye is at any given moment. Six specific points around each eye are tracked by the model. When your eye is fully open, EAR is high (~0.28–0.40 depending on your eye shape). When you blink, it drops sharply toward 0. The formula uses the vertical distances between eyelid landmarks divided by the horizontal eye width, so it stays consistent even as you move your head.',
    code: 'EAR = (|p2–p6| + |p3–p5|) / (2 × |p1–p4|)\n\nLeft eye landmarks:  362, 385, 387, 263, 373, 380  (cyan dots)\nRight eye landmarks:  33, 160, 158, 133, 153, 144  (emerald dots)\n\nNormal resting EAR: 0.25 – 0.40 (varies per person)\nSee the EAR Quality Reference table below.'
  },
  {
    title: 'EAR Smoothing (3-Frame Average)',
    body: 'Raw EAR computed from a single frame is noisy — lighting flicker, slight head wobble, and JPEG compression artifacts all cause it to jump frame-to-frame. Before comparing to the threshold, the last 3 frames (~100 ms) are averaged. This removes most transient noise while adding essentially no perceptible delay to detection.',
    code: 'smoothedEAR = (EAR[t] + EAR[t-1] + EAR[t-2]) / 3\n\nAt 30 fps: 3 frames ≈ 100 ms latency'
  },
  {
    title: 'Adaptive Calibration',
    body: 'A fixed threshold fails for many people — someone with naturally narrower eyes might have a resting EAR of 0.24, making 0.20 nearly useless for them. During the first 10 seconds, the app collects your open-eye EAR readings. The threshold is set to 85% of the 75th percentile of those readings (not the mean), which represents your "comfortably open" eye regardless of whether you have wide or narrow eyes. The line sits close to your resting EAR so light, partial blinks (common at a screen) still register; the blendshape cross-check rejects the extra noise.',
    code: 'Threshold = 75th_percentile(open-eye EAR) × 0.85\n\nCalibration window: first 10 seconds\nMinimum samples needed: 30\nSample filter: EAR > 0.15 (covers all eye sizes)\nFallback if not enough data: 0.20 (static default)'
  },
  {
    title: 'Blink Detection Window (MIN / MAX Frames)',
    body: 'Not every EAR dip is a real blink. A single frame below threshold (~33 ms) is almost certainly noise. To filter it, at least 2 consecutive frames below threshold (~66 ms) are required before a blink is registered. If your eyes stay closed for more than 15 frames (~500 ms), that is a deliberate squint or closure — excluded. A small dead zone (hysteresis) above the threshold prevents flickering. As a second check, MediaPipe also outputs a trained eyeBlink value (0=open, 1=closed); a blink only counts if that value actually peaked during the closure, which rejects jitter and brief occlusions that fool the geometric EAR.',
    code: 'BLINK_MIN_FRAMES = 2   (~66 ms at 30 fps)\nBLINK_MAX_FRAMES = 15  (~500 ms at 30 fps)\nEAR_HYSTERESIS   = 0.02  (dead zone above threshold)\nBLEND_BLINK_MIN  = 0.15  (trained blendshape must peak above this)\n\nBlink is counted on the RISING EDGE (when eye reopens)\nso the full closure DURATION is known before deciding\n(that duration also feeds the fatigue metric below).'
  },
  {
    title: 'Head Pose: Yaw & Pitch',
    body: 'Turning your head left/right (yaw) or tilting it up/down (pitch) moves your eyelids in ways completely unrelated to blinking, producing large EAR changes that would register as false blinks. The app measures both angles every frame using the nose tip position relative to the eye midpoint, normalised by inter-ocular distance. Suppression activates only after 3 consecutive bad-pose frames — so a brief head turn during speech does not interrupt detection.',
    code: 'Yaw  = |noseTipX − eyeMidpointX| / eyeSpan\nPitch = (noseTipY − eyeMidpointY)  / eyeSpan\n\nYAW_THRESHOLD:   > 0.55  → suppressed\nPITCH_DOWN_MIN: < 0.50  → suppressed (looking down)\nPITCH_UP_MAX:   > 2.50  → suppressed (looking up)\n\nPOSE_GUARD_FRAMES = 3  (require 3 consecutive bad frames)\nYellow dot = nose tip (yaw/pitch anchor)'
  },
  {
    title: 'Jaw Open / Talking Detection',
    body: 'When your mouth is open (talking, yawning, laughing), jaw movement can slightly tension the muscles around the eyes, causing small EAR dips that register as false blinks. The app measures how far apart your upper and lower inner lips are, normalised by eye span. If that ratio exceeds 0.22, blink detection is paused — the same 3-frame hysteresis applies so brief mouth movements do not interrupt. The Jaw stat box turns orange when this guard is active.',
    code: 'jawOpenRatio = |upperLipY − lowerLipY| / eyeSpan\n\nLandmarks: lm[13] = upper inner lip\n           lm[14] = lower inner lip\n\nTALK_THRESHOLD = 0.22\nSuppression requires POSE_GUARD_FRAMES = 3 sustained frames'
  },
  {
    title: 'Blink Rate (BPM) — personalized, not absolute',
    body: 'BPM = blinks per minute over a rolling 60-second window. Honest caveat: blink rate is only loosely tied to focus and varies hugely between people and conditions (dry eyes, contacts, lighting, screen distance, caffeine, time of day). What IS reliable is the relationship WITHIN one person: blinking drops when you read/focus intently and tends to rise when you tire or drift. So once the app has watched a few of your sessions it learns YOUR own engaged baseline and scores how far the current rate sits from it — rather than asserting a population number. Until that baseline is learned, it falls back to the fixed A–F brackets below as a rough first guess. Treat the result as an estimate, not a measurement.',
    code: 'Personalized (after a few sessions):\n  score from ratio  r = currentBPM / yourBaseline\n  r ~ 1   -> in your zone (best)\n  r << 1  -> quiet eyes (deep focus, slight strain)\n  r >> 1  -> above your usual (tiring / drifting)\n\nFallback brackets (new users, rough guide only):\n  < 6, 6-11, 12-25, 26-45, 46-65, > 65 BPM\n\n60s rolling window, clamped to [20s, 60s]; the rate now\nrecomputes ~1x/s so it DECAYS when you stop blinking.'
  },
  {
    title: 'Blink Rhythm (Coefficient of Variation)',
    body: 'Even at the same BPM, the pattern of your blinks matters. CV (Coefficient of Variation) measures how consistent the time gaps between blinks are. A steady, almost metronomic rhythm gives a low CV; erratic, clustered blinks give a high CV. CV is computed from the last 20 inter-blink intervals — but it now stays hidden until at least 6 intervals exist, because a CV from 2–3 samples is statistically meaningless and it carries 45% of the live score.',
    code: 'CV = std_dev(inter-blink intervals) / mean(inter-blink intervals)\n\nCV < 0.40  → Regular   (consistent rhythm)\n0.40–0.69  → Variable  (some fluctuation)\nCV ≥ 0.70  → Irregular (erratic — distracted/fatigued)\n\nNeeds ≥ 6 intervals before it influences the score.'
  },
  {
    title: 'Focus Score Formula',
    body: 'Two layers. The INSTANTANEOUS estimate (the live number) combines a RATE score 55% and rhythm 45%. The rate score is personalized once your baseline is learned (how far your current BPM sits from your own norm); before that it uses the fallback brackets. The SESSION score (saved and shown in Stats) is the time-weighted AVERAGE of that estimate over your on-screen time, scaled down by behavioural penalties — away time (super-linear), phone pickups (capped), a rising-trend penalty — and now a FATIGUE penalty from PERCLOS + long blink closures (the validated drowsiness markers). Too little data shows "—" or a faded "~" low-confidence score.',
    code: 'live = rateScore × 0.55 + rhythmScore × 0.45\n  rateScore   → vs your baseline (or brackets, new users)\n  rhythmScore → from CV (only once ≥6 intervals)\n\nsession = cognitiveAvg × presence × phone × drift × fatigue\n  presence = (1 − awayFraction) ^ 1.5\n  phone    = 1 − min(pickups × 0.09, 0.40)\n  drift    = 1 − min(early−late drop, 0.15)\n  fatigue  = 1 − min(PERCLOS + long-closure pen, 0.25)\n\nWithheld ("—") under ~60s on-screen or <3 blinks.'
  },
  {
    title: 'Fatigue: PERCLOS & Blink Duration',
    body: 'Unlike blink RATE (a weak focus proxy), these two are externally validated drowsiness markers from driving-safety research. PERCLOS is the percentage of time your eyes are closed; long, slow blink closures (>400 ms) indicate physical tiredness regardless of rate. The app tracks both — PERCLOS as a rolling live percentage, and the mean closure duration of your recent blinks (the closure time is already known because blinks are counted on reopening). They feed a small, capped fatigue penalty into the session score, so genuine tiredness lowers the number even if your blink rate looks normal.',
    code: 'PERCLOS = closed_frames / valid_frames   (rolling)\nclosure = mean(blink closure durations), ms\n\nNormal screen PERCLOS: a few %\nPenalty starts at PERCLOS > 12% and closure > 350 ms\nfatigue penalty capped at 25% of the score.\nThe PERCLOS / Closure stat boxes turn orange when high.'
  },
  {
    title: 'Personalized Baseline (relative scoring)',
    body: 'Because resting blink rate varies so much between people, the app learns YOUR own engaged blink rate over time instead of judging you against fixed numbers. After each qualifying session it folds that session\'s mean rate (blinks ÷ on-task minutes) into a stored baseline using an exponential moving average. Once a couple of sessions exist, scoring switches from the fixed A–F brackets to a ratio against your baseline — so the same 18 BPM can be "your normal" for one person and "elevated" for another. The baseline persists across sessions; the Scoring-mode box shows whether it is active yet.',
    code: 'sessionMeanBpm = blinks / (onTaskSeconds / 60)\nbaseline = baseline·(1−α) + sessionMeanBpm·α   (α=0.25)\n\nQualifies: session ≥ 120 s and ≥ 8 blinks,\n           3 ≤ sessionMeanBpm ≤ 60\nRelative scoring engages after 2 qualifying sessions;\nstored in atenttion-preferences.json (baselineBpm).'
  }
]

// ─── EAR quality zones ────────────────────────────────────────────────────────

const EAR_ZONES = [
  { min: 0.35, max: Infinity, label: '> 0.35',    quality: 'Excellent', success: '~95%', tip: 'Eyes well open — ideal', bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-400' },
  { min: 0.28, max: 0.35,     label: '0.28 – 0.35', quality: 'Good',    success: '~90%', tip: 'Normal resting open eye', bg: 'bg-green-500/15 border-green-500/30',   text: 'text-green-400' },
  { min: 0.22, max: 0.28,     label: '0.22 – 0.28', quality: 'Fair',    success: '~75%', tip: 'Open eyes slightly wider', bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-400' },
  { min: 0.18, max: 0.22,     label: '0.18 – 0.22', quality: 'Poor',    success: '~50%', tip: 'Squinting / dim light', bg: 'bg-orange-500/20 border-orange-500/40',  text: 'text-orange-400' },
  { min: 0,    max: 0.18,     label: '< 0.18',    quality: 'Very poor', success: '~30%', tip: 'Recalibrate + improve lighting', bg: 'bg-red-500/20 border-red-500/40', text: 'text-red-400' },
]

function getEarZone(ear) {
  if (ear === null || ear === undefined) return null
  return EAR_ZONES.find((z) => ear > z.min && ear <= z.max) || EAR_ZONES[EAR_ZONES.length - 1]
}

// ─── Helper: rhythm label from CV ────────────────────────────────────────────

function rhythmLabel(cv) {
  if (cv === null || cv === undefined) return '—'
  if (cv < 0.40) return 'Regular'
  if (cv < 0.70) return 'Variable'
  return 'Irregular'
}

function rhythmColor(cv) {
  if (cv === null || cv === undefined) return 'text-neutral-400'
  if (cv < 0.40) return 'text-emerald-400'
  if (cv < 0.70) return 'text-amber-400'
  return 'text-red-400'
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, unit, highlight, warning }) {
  let bg, text
  if (highlight) {
    bg = 'bg-red-500/20 border border-red-500/40'
    text = 'text-red-400'
  } else if (warning) {
    bg = 'bg-orange-500/20 border border-orange-500/40'
    text = 'text-orange-400'
  } else {
    bg = 'bg-surface-2'
    text = 'text-neutral-100'
  }
  return (
    <div className={`flex-1 rounded-xl p-3 flex flex-col gap-1 ${bg}`}>
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className={`text-lg font-mono font-semibold ${text}`}>
        {value ?? '—'}{unit && value !== null && value !== undefined ? <span className="text-xs text-neutral-400 ml-0.5">{unit}</span> : ''}
      </span>
    </div>
  )
}

// ─── Concept card ─────────────────────────────────────────────────────────────

function ConceptCard({ title, body, code }) {
  return (
    <div className="bg-surface-1 rounded-2xl p-5 flex flex-col gap-3">
      <h3 className="text-violet-400 font-semibold text-sm">{title}</h3>
      <p className="text-neutral-300 text-xs leading-relaxed">{body}</p>
      <pre className="bg-surface-2 rounded-lg p-3 text-[11px] text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed">{code}</pre>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EyeDebugPage({ videoRef, recalibrate }) {
  const eyeTrackingActive      = useStore((s) => s.eyeTrackingActive)
  const eyeStatus              = useStore((s) => s.eyeStatus)
  const liveEar                = useStore((s) => s.liveEar)
  const earThreshold           = useStore((s) => s.earThreshold)
  const calibrationProgress    = useStore((s) => s.calibrationProgress)
  const calibrationSampleCount = useStore((s) => s.calibrationSampleCount)
  const liveYaw                = useStore((s) => s.liveYaw)
  const livePitch              = useStore((s) => s.livePitch)
  const liveJawOpen            = useStore((s) => s.liveJawOpen)
  const liveGaze               = useStore((s) => s.liveGaze)
  const phoneScorePct          = useStore((s) => s.phoneScorePct)
  const inputIdleMs            = useStore((s) => s.inputIdleMs)
  const lastRecalAt            = useStore((s) => s.lastRecalAt)
  const blinkRate              = useStore((s) => s.blinkRate)
  const blinkVariability       = useStore((s) => s.blinkVariability)
  const blinkCount             = useStore((s) => s.blinkCount)
  const livePerclos            = useStore((s) => s.livePerclos)
  const liveBlinkDurMs         = useStore((s) => s.liveBlinkDurMs)
  const baselineBpm            = useStore((s) => s.baselineBpm)
  const baselineBpmConfidence  = useStore((s) => s.baselineBpmConfidence)

  const canvasRef = useRef(null)
  const [chartData, setChartData] = useState([])

  // Register / unregister the debug canvas
  useEffect(() => {
    registerDebugCanvas(canvasRef.current)
    return () => registerDebugCanvas(null)
  }, [])

  // Poll chart buffer on a fixed interval — decoupled from Zustand re-renders
  useEffect(() => {
    if (!eyeTrackingActive) return
    const timer = setInterval(() => {
      const buf = earChartBufferRef.current
      if (buf.length === 0) return
      setChartData(buf.map((d, i) => ({
        t:         i,
        ear:       Math.round(d.ear       * 1000) / 1000,
        threshold: Math.round(d.threshold * 1000) / 1000
      })))
    }, RENDER_INTERVAL)
    return () => clearInterval(timer)
  }, [eyeTrackingActive])

  const statusColors = {
    looking:      'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    away:         'bg-red-500/20 text-red-400 border-red-500/30',
    blinking:     'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'not-tracking': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    unknown:      'bg-surface-3 text-neutral-500 border-surface-3'
  }
  const statusLabel = {
    looking: 'Looking', away: 'Away', blinking: 'Blinking',
    'not-tracking': 'Pose suppressed', unknown: 'Inactive'
  }

  const yawSuppressed = liveYaw  !== null && liveYaw  > 0.55
  const pitchSuppressed = livePitch !== null && (livePitch < 0.50 || livePitch > 2.50)
  const jawSuppressed = liveJawOpen !== null && liveJawOpen > 0.22
  const typingActive = inputIdleMs !== null && inputIdleMs < TYPING_VETO_MS

  const calMeanEar = earThreshold !== null ? (earThreshold / EAR_THRESHOLD_RATIO).toFixed(3) : null
  const calibrated = calibrationProgress >= 100 && earThreshold !== null && earThreshold !== 0.20

  const earZone = getEarZone(liveEar)

  const handleRecalibrate = useCallback(() => {
    setChartData([])
    recalibrate()
  }, [recalibrate])

  return (
    <div className="p-5 flex flex-col gap-5 min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Eye Tracker Debug</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Real-time pipeline visibility — start eye tracking on the Focus page first</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border font-medium ${statusColors[eyeStatus] || statusColors.unknown}`}>
          {statusLabel[eyeStatus] || eyeStatus}
        </span>
      </div>

      {/* Top row: camera + EAR graph */}
      <div className="flex gap-5 items-start">

        {/* Camera canvas */}
        <div className="flex flex-col gap-2 shrink-0">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">Live Camera + Face Mesh</p>
          <div className="relative rounded-xl overflow-hidden bg-surface-2" style={{ width: 320, height: 240 }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{ width: 320, height: 240, display: 'block' }}
            />
            {!eyeTrackingActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2/90 rounded-xl">
                <p className="text-xs text-neutral-500 text-center px-4 leading-relaxed">
                  Start eye tracking on the<br />Focus page to see the overlay
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-neutral-500">
            <span><span className="inline-block w-2 h-2 rounded-sm bg-[#22d3ee] mr-1" />Left eye landmarks</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-[#34d399] mr-1" />Right eye landmarks</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-[#fbbf24] mr-1" />Nose tip (pose anchor)</span>
          </div>
        </div>

        {/* EAR live graph */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">Live EAR — Eye Aspect Ratio</p>
          <div className="bg-surface-2 rounded-xl p-3" style={{ height: 180 }}>
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <span className="text-xs text-neutral-600">Waiting for data…</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 0.5]} tick={{ fontSize: 9, fill: '#6b7280' }} width={28} tickCount={6} />
                  <Tooltip
                    contentStyle={{ background: '#1c1c24', border: '1px solid #2a2a38', borderRadius: 8, fontSize: 11 }}
                    itemStyle={{ color: '#a78bfa' }}
                    formatter={(v) => v.toFixed(3)}
                    labelFormatter={() => ''}
                  />
                  <ReferenceLine
                    y={earThreshold ?? 0.20}
                    stroke="#fbbf24"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: `thr ${(earThreshold ?? 0.20).toFixed(3)}`, position: 'right', fontSize: 9, fill: '#fbbf24' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ear"
                    stroke="#a78bfa"
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-neutral-600">Violet line = smoothed EAR · Amber dashed = adaptive threshold · Blinks appear as downward spikes</p>
        </div>

      </div>

      {/* Calibration panel */}
      <div className="bg-surface-1 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">Calibration</p>
          <div className="flex items-center gap-3">
            {calibrated && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                ✓ Calibrated
              </span>
            )}
            <button
              onClick={handleRecalibrate}
              disabled={!eyeTrackingActive}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Recalibrate
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${calibrationProgress}%` }}
            />
          </div>
          <span className="text-xs text-neutral-400 w-20 text-right shrink-0">
            {calibrationProgress >= 100 ? 'Complete' : `${calibrationProgress}%  (${(calibrationProgress / 10).toFixed(1)} / 10.0 s)`}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
          <div className="flex justify-between text-neutral-400">
            <span>Samples collected</span>
            <span className="text-neutral-200 font-mono">{calibrationSampleCount}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Open-eye 75th pct EAR</span>
            <span className="text-neutral-200 font-mono">{calMeanEar ?? '—'}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Adaptive threshold</span>
            <span className="text-violet-300 font-mono">{earThreshold !== null ? earThreshold.toFixed(3) : '—'}<span className="text-neutral-600 ml-1">(p75 × {EAR_THRESHOLD_RATIO})</span></span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Static fallback</span>
            <span className="text-neutral-400 font-mono">0.200</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Background recal</span>
            <span className="text-neutral-200 font-mono">
              {lastRecalAt ? new Date(lastRecalAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Live debug stats row */}
      <div className="flex gap-2">
        {/* EAR box — color reflects quality zone */}
        <div className={`flex-1 rounded-xl p-3 flex flex-col gap-1 border ${earZone ? earZone.bg : 'bg-surface-2 border-transparent'}`}>
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">EAR</span>
          <span className={`text-lg font-mono font-semibold ${earZone ? earZone.text : 'text-neutral-100'}`}>
            {liveEar !== null ? liveEar.toFixed(3) : '—'}
          </span>
        </div>
        <StatBox label="Threshold" value={earThreshold?.toFixed(3)} />
        <StatBox label="Yaw"   value={liveYaw?.toFixed(2)}    highlight={yawSuppressed} />
        <StatBox label="Pitch" value={livePitch?.toFixed(2)}  highlight={pitchSuppressed} />
        <StatBox label="Gaze"  value={liveGaze?.toFixed(3)} />
        <StatBox label="Phone" value={phoneScorePct > 0 ? `${phoneScorePct}%` : '—'} warning={phoneScorePct > 0} />
        <StatBox label="Input" value={inputIdleMs === null ? '—' : (typingActive ? 'typing' : `${(inputIdleMs / 1000).toFixed(1)}s`)} warning={typingActive} />
        <StatBox label="Jaw"   value={liveJawOpen?.toFixed(2)} warning={jawSuppressed} />
        <StatBox label="BPM"   value={blinkRate || '—'} />
        <div className="flex-1 rounded-xl p-3 flex flex-col gap-1 bg-surface-2">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Rhythm</span>
          <span className={`text-lg font-semibold ${rhythmColor(blinkVariability)}`}>
            {rhythmLabel(blinkVariability)}
          </span>
        </div>
        <StatBox label="Blinks" value={blinkCount || '—'} />
      </div>

      {/* Fatigue + personalized-baseline row */}
      <div className="flex gap-2">
        <StatBox label="PERCLOS"  value={livePerclos}    unit="%"  warning={livePerclos !== null && livePerclos > 15} />
        <StatBox label="Closure"  value={liveBlinkDurMs} unit="ms" warning={liveBlinkDurMs !== null && liveBlinkDurMs > 400} />
        <StatBox label="Baseline" value={baselineBpm}    unit="bpm" />
        <StatBox label="Base conf" value={baselineBpmConfidence || '—'} />
        <div className="flex-[2] rounded-xl p-3 flex flex-col gap-1 bg-surface-2">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Scoring mode</span>
          <span className={`text-lg font-semibold ${
            baselineBpmConfidence >= SCORE_CONFIG.BASELINE_MIN_CONF && baselineBpm ? 'text-emerald-400' : 'text-neutral-400'
          }`}>
            {baselineBpmConfidence >= SCORE_CONFIG.BASELINE_MIN_CONF && baselineBpm
              ? 'Personalized (vs your baseline)'
              : `Brackets (learning ${baselineBpmConfidence}/${SCORE_CONFIG.BASELINE_MIN_CONF})`}
          </span>
        </div>
      </div>

      {yawSuppressed && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          Yaw exceeded 0.55 — blink detection is paused. Turn your face toward the camera.
        </p>
      )}
      {pitchSuppressed && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          Pitch out of range ({livePitch?.toFixed(2)}) — blink detection is paused. Face the camera more directly.
        </p>
      )}
      {jawSuppressed && (
        <p className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
          Jaw open detected (ratio {liveJawOpen?.toFixed(2)}) — blink detection paused while talking or yawning.
        </p>
      )}

      {/* EAR Quality Reference table */}
      <div className="bg-surface-1 rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">EAR Quality Reference</p>
        <div className="overflow-hidden rounded-xl border border-surface-3">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr className="text-neutral-500 text-left">
                <th className="px-3 py-2 font-medium">EAR Range</th>
                <th className="px-3 py-2 font-medium">Quality</th>
                <th className="px-3 py-2 font-medium">Est. Success</th>
                <th className="px-3 py-2 font-medium">What to do</th>
              </tr>
            </thead>
            <tbody>
              {EAR_ZONES.map((z) => (
                <tr
                  key={z.label}
                  className={`border-t border-surface-3 ${earZone === z ? z.bg : ''}`}
                >
                  <td className={`px-3 py-2 font-mono font-semibold ${z.text}`}>{z.label}</td>
                  <td className={`px-3 py-2 font-medium ${z.text}`}>{z.quality}</td>
                  <td className="px-3 py-2 text-neutral-300">{z.success}</td>
                  <td className="px-3 py-2 text-neutral-400">{z.tip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-neutral-600 leading-relaxed">
          The row matching your current EAR is highlighted. The dashed amber line on the graph shows your calibrated threshold — the further your resting EAR sits above it, the more reliable blink detection will be.
        </p>
      </div>

      {/* Concept explanations */}
      <div>
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest mb-3">How It Works — Concepts</p>
        <div className="grid grid-cols-2 gap-4">
          {concepts.map((c) => (
            <ConceptCard key={c.title} {...c} />
          ))}
        </div>
      </div>

    </div>
  )
}
