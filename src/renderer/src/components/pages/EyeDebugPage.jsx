import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts'
import { useStore } from '../../store'
import { registerDebugCanvas } from '../../hooks/useEyeTracker'

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
    body: 'A fixed threshold fails for many people — someone with naturally narrower eyes might have a resting EAR of 0.24, making 0.20 nearly useless for them. During the first 10 seconds, the app collects your open-eye EAR readings. The threshold is set to 70% of the 75th percentile of those readings (not the mean), which represents your "comfortably open" eye regardless of whether you have wide or narrow eyes.',
    code: 'Threshold = 75th_percentile(open-eye EAR) × 0.70\n\nCalibration window: first 10 seconds\nMinimum samples needed: 30\nSample filter: EAR > 0.15 (covers all eye sizes)\nFallback if not enough data: 0.20 (static default)'
  },
  {
    title: 'Blink Detection Window (MIN / MAX Frames)',
    body: 'Not every EAR dip is a real blink. A single frame below threshold (~33 ms) is almost certainly noise. A real voluntary blink lasts 150–400 ms. To filter noise, a minimum of 3 consecutive frames below threshold (~100 ms) are required before a blink is registered. Conversely, if your eyes stay closed for more than 15 frames (~500 ms), that is a deliberate squint or intentional closure — it is excluded. A small dead zone (hysteresis) above the threshold prevents the detector from flickering between open/closed on the same frame.',
    code: 'BLINK_MIN_FRAMES = 3   (~100 ms at 30 fps)\nBLINK_MAX_FRAMES = 15  (~500 ms at 30 fps)\nEAR_HYSTERESIS   = 0.02  (dead zone above threshold)\n\nBlink is counted on the RISING EDGE (when eye reopens)\nso the full closure duration is known before deciding.\nEAR buffer is cleared after each blink so rapid\nconsecutive blinks each get a fresh baseline.'
  },
  {
    title: 'Head Pose: Yaw & Pitch',
    body: 'Turning your head left/right (yaw) or tilting it up/down (pitch) moves your eyelids in ways completely unrelated to blinking, producing large EAR changes that would register as false blinks. The app measures both angles every frame using the nose tip position relative to the eye midpoint, normalised by inter-ocular distance. Suppression activates only after 3 consecutive bad-pose frames — so a brief head turn during speech does not interrupt detection.',
    code: 'Yaw  = |noseTipX − eyeMidpointX| / eyeSpan\nPitch = (noseTipY − eyeMidpointY)  / eyeSpan\n\nYAW_THRESHOLD:   > 0.55  → suppressed\nPITCH_DOWN_MIN: < 0.50  → suppressed (looking down)\nPITCH_UP_MAX:   > 2.50  → suppressed (looking up)\n\nPOSE_GUARD_FRAMES = 3  (require 3 consecutive bad frames)\nYellow dot = nose tip (yaw/pitch anchor)'
  },
  {
    title: 'Jaw Open / Talking Detection',
    body: 'When your mouth is open (talking, yawning, laughing), jaw movement can slightly tension the muscles around the eyes, causing small EAR dips that register as false blinks. The app measures how far apart your upper and lower inner lips are, normalised by eye span. If that ratio exceeds 0.15, blink detection is paused — the same 3-frame hysteresis applies so brief mouth movements do not interrupt. The Jaw stat box turns orange when this guard is active.',
    code: 'jawOpenRatio = |upperLipY − lowerLipY| / eyeSpan\n\nLandmarks: lm[13] = upper inner lip\n           lm[14] = lower inner lip\n\nTALK_THRESHOLD = 0.15\nSuppression requires POSE_GUARD_FRAMES = 3 sustained frames'
  },
  {
    title: 'Blink Rate (BPM) & Focus Brackets',
    body: 'BPM = blinks per minute, calculated over a rolling 60-second window. Normal spontaneous blink rate at a computer screen is 12–25 BPM. Below 12 suggests deep focus or dry-eye risk (the brain suppresses blinking to keep visual input uninterrupted). Above 25 suggests fatigue, cognitive friction, or mind-wandering. Six neurocognitive brackets (A–F) map BPM ranges to specific cognitive states and contribute to the focus score.',
    code: 'A  <  6 BPM  — Hyper-focus / dry-eye risk   (violet)\nB   6–11 BPM  — High executive function        (cyan)\nC  12–25 BPM  — Optimal baseline (target)      (emerald)\nD  26–45 BPM  — Task friction / early fatigue  (amber)\nE  46–65 BPM  — Attentional drift              (orange)\nF  > 65 BPM  — Mind wandering / zoning out    (red)\n\n60-second rolling window, clamped to [20s, 60s] until\nenough data accumulates to avoid early spikes.'
  },
  {
    title: 'Blink Rhythm (Coefficient of Variation)',
    body: 'Even at the same BPM, the pattern of your blinks matters. CV (Coefficient of Variation) measures how consistent the time gaps between blinks are. A focused person blinks at a steady, almost metronomic rhythm (low CV). A distracted or fatigued person has erratic, clustered blinks with long irregular gaps (high CV). CV is computed from the last 20 inter-blink intervals.',
    code: 'CV = std_dev(inter-blink intervals) / mean(inter-blink intervals)\n\nCV < 0.40  → Regular   (consistent rhythm, focused)\n0.40–0.69  → Variable  (some attentional fluctuation)\nCV ≥ 0.70  → Irregular (erratic, distracted/fatigued)\n\nNeeds at least 3 blinks to start computing.'
  },
  {
    title: 'Focus Score Formula',
    body: 'The focus score combines BPM bracket and blink rhythm into a single 0–100 number. BPM contributes 55% of the score (what you are cognitively doing matters most) and rhythm contributes 45% (how consistently you are doing it). A score of 100 requires both optimal BPM (12–25 BPM, Bracket C) and perfectly regular rhythm. Neither alone is sufficient — you can be in the right BPM bracket but still score poorly if your rhythm is chaotic.',
    code: 'focusScore = rateScore × 0.55 + rhythmScore × 0.45\n\nrateScore   → from BPM bracket table (0–100)\nrhythmScore → from CV: 100 at CV=0, 0 at CV≥0.70\n\nScore is null until the first blink is detected.\nUpdated on every blink (rising edge).'
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
  const blinkRate              = useStore((s) => s.blinkRate)
  const blinkVariability       = useStore((s) => s.blinkVariability)
  const blinkCount             = useStore((s) => s.blinkCount)

  const canvasRef    = useRef(null)
  const earHistoryRef = useRef([])
  const renderTimer  = useRef(null)
  const [chartData, setChartData] = useState([])

  // Register / unregister the debug canvas
  useEffect(() => {
    registerDebugCanvas(canvasRef.current)
    return () => registerDebugCanvas(null)
  }, [])

  // Keep EAR history up to date and throttle chart re-renders
  useEffect(() => {
    if (liveEar === null) return
    earHistoryRef.current.push({ t: earHistoryRef.current.length, ear: liveEar, threshold: earThreshold ?? 0.20 })
    if (earHistoryRef.current.length > MAX_HISTORY) earHistoryRef.current.shift()
    // Reassign t so indices stay contiguous after trimming
    if (!renderTimer.current) {
      renderTimer.current = setTimeout(() => {
        setChartData(earHistoryRef.current.map((d, i) => ({ ...d, t: i })))
        renderTimer.current = null
      }, RENDER_INTERVAL)
    }
  }, [liveEar, earThreshold])

  useEffect(() => () => { if (renderTimer.current) clearTimeout(renderTimer.current) }, [])

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
  const jawSuppressed = liveJawOpen !== null && liveJawOpen > 0.15

  const calMeanEar = earThreshold !== null ? (earThreshold / 0.70).toFixed(3) : null
  const calibrated = calibrationProgress >= 100 && earThreshold !== null && earThreshold !== 0.20

  const earZone = getEarZone(liveEar)

  const handleRecalibrate = useCallback(() => {
    earHistoryRef.current = []
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
            <span className="text-violet-300 font-mono">{earThreshold !== null ? earThreshold.toFixed(3) : '—'}<span className="text-neutral-600 ml-1">(p75 × 0.70)</span></span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Static fallback</span>
            <span className="text-neutral-400 font-mono">0.200</span>
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
