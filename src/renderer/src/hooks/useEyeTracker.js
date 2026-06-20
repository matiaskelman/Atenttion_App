import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { computeFocusScore } from '../utils/focusScore'
import { SCORE_CONFIG } from '../constants/blinksConfig'
import { playBeep, playPhoneAlert } from '../utils/audio'

const EAR_THRESHOLD         = 0.20
// Adaptive blink threshold = restingEAR × EAR_THRESHOLD_RATIO. Higher = threshold line sits closer
// to resting EAR, catching softer/partial blinks; too high and noise/micro-movements register as
// false blinks. 0.85 = line 15% below resting EAR (was 0.80 / 20%) — raised to catch the light,
// partial blinks common at a screen. The blendshape cross-check (BLEND_BLINK_MIN) filters the
// extra noise this lets through. Tune from the Eye Tracker Debug page.
export const EAR_THRESHOLD_RATIO = 0.85
const BLINK_MIN_FRAMES      = 2
const BLINK_MAX_FRAMES      = 15
const YAW_THRESHOLD         = 0.55
const PITCH_DOWN_MIN        = 0.50
const PITCH_UP_MAX          = 2.50
const EAR_SMOOTH_FRAMES     = 3
const CALIBRATION_WINDOW_MS = 10000
const CALIBRATION_OPEN_MIN  = 0.15   // was 0.22 — captures small/tired eyes too
const DOWN_GAZE_OPEN_MIN    = 0.10   // EMA floor while looking down — lets the threshold track gaze-depressed (open) EAR
const EAR_HYSTERESIS        = 0.02   // dead zone above threshold to prevent oscillation
const EAR_SPIKE_LIMIT       = 0.12   // max frame-to-frame EAR delta — clamps occlusion spikes
const EAR_VALID_MIN         = 0.05   // below this = bad frame (hand/occlusion)
const EAR_VALID_MAX         = 0.60   // above this = bad frame
const TALK_THRESHOLD        = 0.22   // jaw-open ratio (lip gap / eye span) — suppress while talking
const POSE_GUARD_FRAMES     = 3      // consecutive bad-pose frames before suppression kicks in
const ALPHA_SLOW            = 0.016  // EMA rate during normal tracking (~43-frame half-life, 1.4s)
const ALPHA_FAST            = 0.060  // EMA rate when eye is clearly stable (~11-frame half-life, 0.4s)
const PHONE_PITCH_DROP      = 0.15   // head-down = pitch below personal baseline by this much
const PHONE_GAZE_DROP       = 0.045  // eyes-down = iris below personal baseline by this much (÷ eyeSpan)
const PHONE_TRIGGER_MS      = 3000   // accumulated down-time that fires detection
const PHONE_DECAY_FACTOR    = 2      // up-frames drain the accumulator 2× faster than down-frames fill it
const PHONE_EAR_RATIO       = 0.88   // EAR booster: depressed EAR lowers the down-bar on borderline frames
const PHONE_RESUME_CANCEL_MS = 500   // sustained down-time / face-loss that erodes the resume accumulator (flicker-proof)
const PHONE_RESUME_MS       = 5000   // accumulated screen-gaze time (leaky) needed to auto-resume after a phone pause
const PHONE_COOLDOWN_MS     = 8000   // after a phone resume, block re-triggering while baselines settle
export const TYPING_VETO_MS = 2500   // recent kb/mouse input within this window vetoes phone-score build (= active user)
const IDLE_POLL_MS          = 500    // cadence for polling system input idle time from main
const RECAL_INTERVAL_MS     = 60000  // background recalibration cadence
const RECAL_WINDOW_MS       = 10000  // background sampling window length
const RECAL_MIN_SAMPLES     = 30     // minimum valid samples to accept a background recalibration
const BASELINE_ALPHA        = 0.005  // slow drift-tracking EMA for pitch/gaze baselines on up-frames
const COG_SAMPLE_INTERVAL_MS = 20000 // cadence for pushing a cognitive-score sample into the drift buffer
const RATE_RECOMPUTE_MS     = 1000   // recompute BPM/score on the loop (not only on blink) so the rate DECAYS
const BLEND_BLINK_MIN       = 0.15   // MediaPipe eyeBlink blendshape must peak above this during a closure
                                     // for it to count. Kept LOW so it only rejects gross non-blinks
                                     // (occlusion/jitter where the trained model sees no eye-closing) and never
                                     // vetoes genuine light/partial blinks that the 0.85 EAR threshold now catches.
const AWAY_PAUSE_GRACE_MS   = 4000   // extra sustained-absence time beyond the away threshold before AUTO-PAUSING;
                                     // lets brief think-glances / reaching for coffee show "away" without killing the timer
const PERCLOS_EMA_ALPHA     = 0.003  // slow EMA for the LIVE PERCLOS readout (~30s window at 30 fps)

// MediaPipe 478-point mesh — 6 EAR landmarks per eye
const L_EYE = [362, 385, 387, 263, 373, 380]
const R_EYE = [33,  160, 158, 133, 153, 144]

const WASM_PATH  = import.meta.env.PROD ? 'models://root/mediapipe'          : '/models/mediapipe'
const MODEL_PATH = import.meta.env.PROD ? 'models://root/face_landmarker.task' : '/models/face_landmarker.task'

// Module-level singleton: survives hook remounts so the landmarker is never lost.
const landmarkerRef    = { current: null }
const debugCanvasRef   = { current: null }
export const earChartBufferRef = { current: [] }   // ring buffer for live EAR chart, decoupled from Zustand
export function registerDebugCanvas(canvas) { debugCanvasRef.current = canvas }

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function getEAR(lm, indices, w, h) {
  const p = indices.map((i) => ({ x: lm[i].x * w, y: lm[i].y * h }))
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]))
}

// Mean of MediaPipe's trained eyeBlink blendshapes (0 = open, 1 = fully closed). Returns null
// when blendshapes are unavailable so blink logic falls back to EAR-only (no behaviour change).
function getBlinkBlend(result) {
  const cats = result.faceBlendshapes?.[0]?.categories
  if (!cats) return null
  let l = null, r = null
  for (const c of cats) {
    if (c.categoryName === 'eyeBlinkLeft') l = c.score
    else if (c.categoryName === 'eyeBlinkRight') r = c.score
  }
  if (l === null && r === null) return null
  return ((l ?? r) + (r ?? l)) / 2
}

export function useEyeTracker(videoRef) {
  const activeRef              = useRef(false)
  const rafRef                 = useRef(null)
  const blinkFramesRef         = useRef(0)
  const isBlinkingRef          = useRef(false)
  const blinkCountRef          = useRef(useStore.getState().blinkCount)
  const awayStartRef           = useRef(null)
  const autoPausedRef          = useRef(false)
  const blinkTimesRef          = useRef([])
  const blinkIntervalsRef      = useRef([])
  const trackingStartTimeRef   = useRef(null)
  const earBufferRef           = useRef([])
  const calibrationSamplesRef  = useRef([])
  const adaptiveThresholdRef   = useRef(EAR_THRESHOLD)
  const calibrationStartRef    = useRef(null)
  const poseGuardFramesRef     = useRef(0)
  const openEyeEmaRef          = useRef(null)
  const postCalFramesRef       = useRef(0)
  const stableOpenFramesRef    = useRef(0)
  const phoneScoreRef          = useRef(0)      // accumulated "down" milliseconds (leaky)
  const lastFrameTimeRef       = useRef(null)   // for per-frame dt in the accumulator
  const phoneDownStreakMsRef   = useRef(0)      // consecutive down-time — gates resume-countdown cancellation
  const lastDownFrameAtRef     = useRef(0)      // timestamp of last down-frame — gates away-pause phone-branding
  const baselinePitchRef       = useRef(null)   // median resting pitch from calibration
  const baselineGazeRef        = useRef(null)   // median resting iris-gaze from calibration
  const pitchSamplesRef        = useRef([])
  const gazeSamplesRef         = useRef([])
  const phoneAutoPausedRef     = useRef(false)
  const phoneResumeMsRef       = useRef(0)      // accumulated screen-gaze ms toward auto-resume (leaky)
  const faceLostAtRef          = useRef(null)   // when the face went continuously missing — flicker-tolerant resume
  const phoneCooldownUntilRef  = useRef(0)      // post-resume window where re-triggering is blocked
  const resumePitchBufRef      = useRef([])     // confirmed screen-gaze samples during the 5s countdown
  const resumeGazeBufRef       = useRef([])
  const recalNextAtRef         = useRef(0)      // when the next background recal window opens (0 = not armed)
  const recalWindowEndRef      = useRef(null)   // non-null while a 10s sampling window is open
  const recalEarSamplesRef     = useRef([])
  const recalPitchSamplesRef   = useRef([])
  const recalGazeSamplesRef    = useRef([])
  const cogSampleAccumMsRef    = useRef(0)      // on-screen ms since the last cognitive-score sample
  const blinkOnsetAtRef        = useRef(null)   // timestamp the current closure began — for blink duration
  const maxBlendRef            = useRef(0)       // peak eyeBlink blendshape seen during the current closure
  const perclosEmaRef          = useRef(null)    // live PERCLOS EMA (fraction of frames eyes-closed)
  const lastRateComputeAtRef   = useRef(0)       // throttle for the on-loop BPM/score recompute (decay)
  const idleMsRef              = useRef(null)    // last polled system input-idle ms (null until first poll)
  const idlePolledAtRef        = useRef(0)       // wall-clock time idleMsRef was set (for extrapolation)
  const idlePollRef            = useRef(null)    // setInterval id for the idle poll

  const loadModels = useCallback(async () => {
    const s = useStore.getState()
    if (landmarkerRef.current || s.modelLoaded || s.modelLoading) return
    s.setModelLoading(true)
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,   // trained eyeBlinkLeft/Right — pose-robust cross-check for EAR
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      s.setModelLoaded(true)
    } catch (e) {
      console.error('[EyeTracker] Model load failed:', e)
      useStore.getState().setModelError(e?.message || String(e))
    } finally {
      useStore.getState().setModelLoading(false)
    }
  }, [])

  // Recompute live BPM + focus score from the trailing-60s blink window. Called on every confirmed
  // blink AND on a ~1s loop tick so the rate DECAYS when blinking slows/stops. Previously the rate
  // and score only updated ON a blink, so during blink-suppression (deep focus) they froze at the
  // last value — hiding the very state the app cares about and over-weighting a stale score.
  const recomputeRate = useCallback((now) => {
    blinkTimesRef.current = blinkTimesRef.current.filter((t) => now - t < 60000)
    const elapsed = trackingStartTimeRef.current ? now - trackingStartTimeRef.current : 60000
    const denominator = Math.max(Math.min(elapsed, 60000), 20000)
    const liveBPM = Math.round(blinkTimesRef.current.length * 60000 / denominator)
    const st = useStore.getState()
    if (liveBPM !== st.blinkRate) st.setBlinkRate(liveBPM)
    // Personalized scoring once the baseline is confident; otherwise absolute-bracket fallback (null).
    const baseline = st.baselineBpmConfidence >= SCORE_CONFIG.BASELINE_MIN_CONF ? st.baselineBpm : null
    const score = computeFocusScore(liveBPM, st.blinkVariability, baseline)
    if (score !== st.liveFocusScore) st.setLiveFocusScore(score)
  }, [])

  const runFrame = useCallback(() => {
    if (!activeRef.current) return
    const video     = videoRef.current
    const landmarker = landmarkerRef.current
    const s         = useStore.getState()

    if (!video || video.readyState < 2 || !landmarker || !s.modelLoaded) {
      rafRef.current = setTimeout(runFrame, 66)
      return
    }

    try {
      const result = landmarker.detectForVideo(video, Date.now())
      const lm = result.faceLandmarks?.[0]
      const blendBlink = getBlinkBlend(result)   // null when blendshapes unavailable → EAR-only fallback

      if (!lm) {
        // Face not visible — hold the phone score (deep phone gaze often loses the face).
        // Only a SUSTAINED loss erodes resume progress; a 1-frame detection blip must not, or the
        // leaky resume accumulator can never reach PHONE_RESUME_MS (this was the auto-resume bug).
        if (!faceLostAtRef.current) faceLostAtRef.current = Date.now()
        lastFrameTimeRef.current     = null
        phoneDownStreakMsRef.current = 0
        if (Date.now() - faceLostAtRef.current > PHONE_RESUME_CANCEL_MS) {
          phoneResumeMsRef.current  = 0
          resumePitchBufRef.current = []
          resumeGazeBufRef.current  = []
        }
        if (!awayStartRef.current) awayStartRef.current = Date.now()
        const awayMs = Date.now() - awayStartRef.current
        s.setLookingAwaySeconds(Math.round(awayMs / 1000))
        const threshold = useStore.getState().eyeAwayThresholdMs || 3000
        if (awayMs > threshold) {
          s.setEyeStatus('away')
          const current = useStore.getState()
          if (current.pomodoroState === 'work' && !autoPausedRef.current && !phoneAutoPausedRef.current) {
            if (current.phoneUseExpected === false
                && phoneScoreRef.current >= PHONE_TRIGGER_MS * 0.4
                && Date.now() - lastDownFrameAtRef.current < 5000) {
              // Face lost mid downward-gaze — brand as phone pause so resume goes through the 5-s phone path.
              // The 5s freshness guard prevents a stale score from mislabeling an ordinary walk-away.
              phoneAutoPausedRef.current = true
              current.setPomodoroState('paused')
              current.setPhoneDetected(true)
              current.incrementPhonePickups()
              playPhoneAlert()
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Atenttion', { body: 'Phone detected — timer paused.', silent: true })
              }
              window.api?.overlay?.phoneDetected?.(true)
            } else if (awayMs > threshold + AWAY_PAUSE_GRACE_MS) {
              // Ordinary look-away: only AUTO-PAUSE once absence is sustained past the grace window.
              // Status already flipped to 'away' at the threshold so the user still sees feedback;
              // this avoids killing the timer for a quick reach-for-coffee or lean-back-to-think.
              autoPausedRef.current = true
              current.setPomodoroState('paused')
              const prefs = useStore.getState()
              if (prefs.notifyOnAutoPause && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Atenttion', { body: 'Timer paused — you looked away.', silent: true })
              }
              if (prefs.soundOnAutoPause) playBeep()
            }
          }
        }
      } else {
        faceLostAtRef.current = null   // face is back — reset the continuous-loss streak
        if (awayStartRef.current) {
          const awaySeconds = (Date.now() - awayStartRef.current) / 1000
          s.addLookingAway(awaySeconds)
          awayStartRef.current = null
          s.setLookingAwaySeconds(0)
          const current = useStore.getState()
          if (autoPausedRef.current && current.pomodoroState === 'paused') {
            autoPausedRef.current = false
            current.setPomodoroState('work')
          } else {
            autoPausedRef.current = false
          }
        }

        const w = video.videoWidth  || 640
        const h = video.videoHeight || 480

        // Head pose — yaw (horizontal) and pitch (vertical), normalised by inter-ocular span
        const noseTipX    = lm[4].x
        const leftEyeCX   = (lm[362].x + lm[263].x) / 2
        const rightEyeCX  = (lm[33].x  + lm[133].x) / 2
        const eyeSpan     = Math.abs(leftEyeCX - rightEyeCX)
        const yawRatio    = eyeSpan > 0 ? Math.abs(noseTipX - (leftEyeCX + rightEyeCX) / 2) / eyeSpan : 0

        const noseTipY    = lm[4].y
        const midEyeY     = ((lm[362].y + lm[263].y) / 2 + (lm[33].y + lm[133].y) / 2) / 2
        const pitchRatio  = eyeSpan > 0 ? (noseTipY - midEyeY) / eyeSpan : 1.0

        // Jaw open ratio — lm[13] = upper inner lip, lm[14] = lower inner lip
        const jawOpenRatio = eyeSpan > 0 ? Math.abs(lm[13].y - lm[14].y) / eyeSpan : 0

        // Iris vertical gaze — iris center Y vs eye-corner line, normalised by eye span.
        // lm[473] = left iris center, lm[468] = right iris center. Higher value = eyes cast lower.
        const leftCornerMidY  = (lm[362].y + lm[263].y) / 2
        const rightCornerMidY = (lm[33].y  + lm[133].y) / 2
        const gazeRatio = eyeSpan > 0
          ? ((lm[473].y - leftCornerMidY) + (lm[468].y - rightCornerMidY)) / 2 / eyeSpan
          : 0

        // Compute raw EAR — weight toward the far eye when head is yawed (near eye is foreshortened)
        const leftEAR  = getEAR(lm, L_EYE, w, h)
        const rightEAR = getEAR(lm, R_EYE, w, h)
        const noseMidOffset = noseTipX - (leftEyeCX + rightEyeCX) / 2
        const farWeight = yawRatio < 0.20 ? 0.5
          : Math.min(0.80, 0.5 + (yawRatio - 0.20) / (YAW_THRESHOLD - 0.20) * 0.30)
        const nearWeight = 1 - farWeight
        const rawEar = noseMidOffset >= 0
          ? leftEAR * farWeight  + rightEAR * nearWeight
          : leftEAR * nearWeight + rightEAR * farWeight

        // EAR spike clamp — prevents occlusion-induced spikes from corrupting the buffer
        const bufferMean = earBufferRef.current.length > 0
          ? earBufferRef.current.reduce((a, b) => a + b, 0) / earBufferRef.current.length
          : rawEar
        const clampedEar = earBufferRef.current.length > 0
          ? Math.max(bufferMean - EAR_SPIKE_LIMIT, Math.min(bufferMean + EAR_SPIKE_LIMIT, rawEar))
          : rawEar

        // EAR smoothing — 3-frame rolling average reduces per-frame noise
        earBufferRef.current.push(clampedEar)
        if (earBufferRef.current.length > EAR_SMOOTH_FRAMES) earBufferRef.current.shift()
        const ear = earBufferRef.current.reduce((a, b) => a + b, 0) / earBufferRef.current.length

        // Chart buffer — write every face-detection frame, independent of Zustand subscriptions
        earChartBufferRef.current.push({ ear, threshold: adaptiveThresholdRef.current })
        if (earChartBufferRef.current.length > 300) earChartBufferRef.current.shift()

        // Silent adaptive calibration: build per-user threshold from first 10 s of open-eye readings
        const calElapsed = calibrationStartRef.current ? Date.now() - calibrationStartRef.current : Infinity
        if (calElapsed < CALIBRATION_WINDOW_MS) {
          if (ear > CALIBRATION_OPEN_MIN) calibrationSamplesRef.current.push(ear)
          // Pitch/gaze baselines for phone detection — only frontal-ish frames
          if (yawRatio < YAW_THRESHOLD) {
            pitchSamplesRef.current.push(pitchRatio)
            gazeSamplesRef.current.push(gazeRatio)
          }
        } else if (calibrationSamplesRef.current.length >= 30) {
          // Use 75th percentile of open-eye readings — robust to any eye size
          const sorted = [...calibrationSamplesRef.current].sort((a, b) => a - b)
          const p75    = sorted[Math.floor(sorted.length * 0.75)]
          adaptiveThresholdRef.current = p75 * EAR_THRESHOLD_RATIO
          openEyeEmaRef.current        = p75
          calibrationSamplesRef.current = []
          // Median pitch/gaze = personal "looking at screen" baseline (camera-geometry independent)
          if (pitchSamplesRef.current.length >= 30) {
            const sp = [...pitchSamplesRef.current].sort((a, b) => a - b)
            const sg = [...gazeSamplesRef.current].sort((a, b) => a - b)
            baselinePitchRef.current = sp[Math.floor(sp.length / 2)]
            baselineGazeRef.current  = sg[Math.floor(sg.length / 2)]
          }
          pitchSamplesRef.current = []
          gazeSamplesRef.current  = []
        }

        // Background recalibration — every 60s, a 10s sampling window runs alongside the
        // live tracker (which keeps using the old calibration). The new calibration is
        // swapped in only if the window collected enough quality-gated samples; a window
        // that caught the user away/blinking/on the phone is discarded silently.
        if (calElapsed >= CALIBRATION_WINDOW_MS) {
          const recalNow = Date.now()
          if (recalNextAtRef.current === 0) recalNextAtRef.current = recalNow + RECAL_INTERVAL_MS
          if (recalWindowEndRef.current === null) {
            if (recalNow >= recalNextAtRef.current && !phoneAutoPausedRef.current) {
              recalWindowEndRef.current    = recalNow + RECAL_WINDOW_MS
              recalEarSamplesRef.current   = []
              recalPitchSamplesRef.current = []
              recalGazeSamplesRef.current  = []
            }
          } else if (recalNow < recalWindowEndRef.current) {
            // EAR gate matches the initial calibration; pitch/gaze additionally exclude
            // borderline-down frames so phone glances can't poison the new baselines
            if (ear > CALIBRATION_OPEN_MIN) recalEarSamplesRef.current.push(ear)
            const looksDown = baselinePitchRef.current !== null
              && (baselinePitchRef.current - pitchRatio > PHONE_PITCH_DROP * 0.6
                  || gazeRatio - baselineGazeRef.current > PHONE_GAZE_DROP * 0.6)
            if (yawRatio < YAW_THRESHOLD && !looksDown) {
              recalPitchSamplesRef.current.push(pitchRatio)
              recalGazeSamplesRef.current.push(gazeRatio)
            }
          } else {
            let recalSucceeded = false
            if (recalEarSamplesRef.current.length >= RECAL_MIN_SAMPLES) {
              const sorted = [...recalEarSamplesRef.current].sort((a, b) => a - b)
              const p75    = sorted[Math.floor(sorted.length * 0.75)]
              adaptiveThresholdRef.current = p75 * EAR_THRESHOLD_RATIO
              openEyeEmaRef.current        = p75
              s.setEarThreshold(Math.round(adaptiveThresholdRef.current * 1000) / 1000)
              recalSucceeded = true
            }
            if (recalPitchSamplesRef.current.length >= RECAL_MIN_SAMPLES) {
              const sp = [...recalPitchSamplesRef.current].sort((a, b) => a - b)
              const sg = [...recalGazeSamplesRef.current].sort((a, b) => a - b)
              baselinePitchRef.current = sp[Math.floor(sp.length / 2)]
              baselineGazeRef.current  = sg[Math.floor(sg.length / 2)]
              recalSucceeded = true
            }
            if (recalSucceeded) s.setLastRecalAt(recalNow)
            recalWindowEndRef.current = null
            recalNextAtRef.current    = recalNow + RECAL_INTERVAL_MS
          }
        }

        // Debug store updates — always update so the debug page shows live values
        s.setLiveEar(Math.round(ear * 1000) / 1000)
        s.setEarThreshold(Math.round(adaptiveThresholdRef.current * 1000) / 1000)
        s.setLiveYaw(Math.round(yawRatio * 100) / 100)
        s.setLivePitch(Math.round(pitchRatio * 100) / 100)
        s.setLiveGaze(Math.round(gazeRatio * 1000) / 1000)
        s.setLiveJawOpen(Math.round(jawOpenRatio * 100) / 100)
        s.setCalibrationProgress(Math.min(100, Math.round(calElapsed / CALIBRATION_WINDOW_MS * 100)))
        s.setCalibrationSampleCount(calibrationSamplesRef.current.length)

        // Phone detection — only when user declared no phone use.
        // Leaky accumulator over per-frame down/up classification: tolerates flicker frames
        // (a single stray frame decays the score instead of zeroing a timer).
        const frameNow = Date.now()
        const dt = lastFrameTimeRef.current ? Math.min(frameNow - lastFrameTimeRef.current, 200) : 33
        lastFrameTimeRef.current = frameNow

        // Time-weighted cognitive-score accumulation — drives the whole-session Focus Score.
        // Weights the live (per-blink) cognitive estimate by on-screen frame time; a periodic
        // sample feeds the drift (early-vs-late trend) calculation. Only counts while a face is
        // visible (this branch) and a score exists.
        const liveScoreNow = useStore.getState().liveFocusScore
        if (liveScoreNow != null) {
          s.addCogScore(liveScoreNow, dt)
          cogSampleAccumMsRef.current += dt
          if (cogSampleAccumMsRef.current >= COG_SAMPLE_INTERVAL_MS) {
            cogSampleAccumMsRef.current = 0
            s.pushCogScoreSample(liveScoreNow)
          }
        }

        // Decay tick: recompute BPM/score ~1×/s so the rate falls when blinking slows, and publish
        // the live fatigue readouts (PERCLOS %). Cheap relative to the per-frame debug writes below.
        if (frameNow - lastRateComputeAtRef.current >= RATE_RECOMPUTE_MS) {
          lastRateComputeAtRef.current = frameNow
          recomputeRate(frameNow)
          if (perclosEmaRef.current !== null) s.setLivePerclos(Math.round(perclosEmaRef.current * 1000) / 10)
        }

        const phoneUseExpected = useStore.getState().phoneUseExpected
        if (phoneUseExpected === false) {
          // Recent system-wide keyboard/mouse input → the user is actively at the computer, not on a
          // phone. Vetoes phone-score accumulation while looking down to type / read the keyboard.
          // null idle (no poll yet) → false → no veto (fail-safe).
          const recentInput = idleMsRef.current !== null
            && (idleMsRef.current + (Date.now() - idlePolledAtRef.current)) < TYPING_VETO_MS
          // Frame classifier — relative drops vs calibrated baselines. Head down OR eyes down counts;
          // a depressed EAR lowers the bar on borderline frames. Pre-calibration falls back to the
          // absolute pitch threshold (conservative: may under-detect, never over-detects).
          const earLow = openEyeEmaRef.current !== null && ear < openEyeEmaRef.current * PHONE_EAR_RATIO
          let downFrame, strongDown
          if (baselinePitchRef.current === null) {
            downFrame  = pitchRatio < PITCH_DOWN_MIN
            strongDown = downFrame
          } else {
            const pitchDrop  = baselinePitchRef.current - pitchRatio
            const gazeDrop   = gazeRatio - baselineGazeRef.current
            const headDown   = pitchDrop > PHONE_PITCH_DROP
            const eyesDown   = gazeDrop  > PHONE_GAZE_DROP
            const borderline = pitchDrop > PHONE_PITCH_DROP * 0.6 || gazeDrop > PHONE_GAZE_DROP * 0.6
            strongDown = headDown || eyesDown
            downFrame  = strongDown || (earLow && borderline)
          }

          if (downFrame) {
            // Only strong signals (head/eyes clearly down) build the cancel streak — the noisy
            // EAR-booster path may feed the accumulator but must never cancel a resume countdown
            phoneDownStreakMsRef.current = strongDown ? phoneDownStreakMsRef.current + dt : 0
            lastDownFrameAtRef.current = frameNow
            // Down-time erodes resume progress (net ~5s of look-up over look-down required); a
            // sustained streak clears it outright (user clearly went back to the phone).
            phoneResumeMsRef.current = Math.max(0, phoneResumeMsRef.current - dt)
            if (phoneDownStreakMsRef.current > PHONE_RESUME_CANCEL_MS) {
              phoneResumeMsRef.current  = 0
              resumePitchBufRef.current = []
              resumeGazeBufRef.current  = []
            }
            if (recentInput) {
              // Typing / using the mouse while looking down — not a phone. Drain the score instead of
              // building it (and don't drift baselines here — this is still a down pose).
              phoneScoreRef.current = Math.max(0, phoneScoreRef.current - dt * PHONE_DECAY_FACTOR)
            } else {
              phoneScoreRef.current = Math.min(phoneScoreRef.current + dt, PHONE_TRIGGER_MS)
              const freshState = useStore.getState()
              if (phoneScoreRef.current >= PHONE_TRIGGER_MS && freshState.pomodoroState === 'work'
                  && !phoneAutoPausedRef.current && frameNow >= phoneCooldownUntilRef.current) {
                phoneAutoPausedRef.current = true
                freshState.setPomodoroState('paused')
                freshState.setPhoneDetected(true)
                freshState.incrementPhonePickups()
                playPhoneAlert()
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Atenttion', { body: 'Phone detected — timer paused.', silent: true })
                }
                window.api?.overlay?.phoneDetected?.(true)
              }
            }
          } else {
            phoneDownStreakMsRef.current = 0
            phoneScoreRef.current = Math.max(0, phoneScoreRef.current - dt * PHONE_DECAY_FACTOR)
            // Drift-track baselines on up-frames so slow posture changes don't become false positives
            if (baselinePitchRef.current !== null) {
              baselinePitchRef.current = baselinePitchRef.current * (1 - BASELINE_ALPHA) + pitchRatio * BASELINE_ALPHA
              baselineGazeRef.current  = baselineGazeRef.current  * (1 - BASELINE_ALPHA) + gazeRatio  * BASELINE_ALPHA
            }
            const freshState = useStore.getState()
            if (phoneAutoPausedRef.current && freshState.pomodoroState !== 'paused') {
              // User manually resumed — clean up phone state
              phoneAutoPausedRef.current = false
              phoneResumeMsRef.current = 0
              phoneScoreRef.current = 0
              resumePitchBufRef.current = []
              resumeGazeBufRef.current  = []
              phoneCooldownUntilRef.current = Date.now() + PHONE_COOLDOWN_MS
              freshState.setPhoneDetected(false)
              window.api?.overlay?.phoneDetected?.(false)
            } else if (phoneAutoPausedRef.current && freshState.pomodoroState === 'paused') {
              // Leaky accumulator of confirmed screen-gaze time — tolerant of brief face-loss / glances
              // (those just stop adding; sustained down/loss erodes or zeros it). Resume at PHONE_RESUME_MS.
              phoneResumeMsRef.current += dt
              // These frames are confirmed screen-gaze — collect them to re-anchor baselines
              resumePitchBufRef.current.push(pitchRatio)
              resumeGazeBufRef.current.push(gazeRatio)
              if (phoneResumeMsRef.current >= PHONE_RESUME_MS) {
                // Re-anchor: posture often shifts while handling the phone; without this the
                // stale baselines keep classifying normal screen-gaze as "down" (and the
                // drift EMA can never correct them, since it only runs on up-frames)
                if (resumePitchBufRef.current.length >= 30) {
                  const sp = [...resumePitchBufRef.current].sort((a, b) => a - b)
                  const sg = [...resumeGazeBufRef.current].sort((a, b) => a - b)
                  baselinePitchRef.current = sp[Math.floor(sp.length / 2)]
                  baselineGazeRef.current  = sg[Math.floor(sg.length / 2)]
                }
                resumePitchBufRef.current = []
                resumeGazeBufRef.current  = []
                phoneCooldownUntilRef.current = Date.now() + PHONE_COOLDOWN_MS
                phoneAutoPausedRef.current = false
                phoneResumeMsRef.current = 0
                phoneScoreRef.current = 0
                freshState.setPomodoroState('work')
                freshState.setPhoneDetected(false)
                window.api?.overlay?.phoneDetected?.(false)
              }
            }
          }
        }

        // Debug: phone progress %, bucketed so the store isn't written every frame
        const phonePct = phoneUseExpected === false
          ? Math.min(100, Math.round(phoneScoreRef.current / PHONE_TRIGGER_MS * 100))
          : 0
        if (phonePct !== useStore.getState().phoneScorePct) s.setPhoneScorePct(phonePct)

        // Pose guard with frame-count hysteresis — transient deviations during speech don't suppress
        const poseViolation = yawRatio > YAW_THRESHOLD
          || pitchRatio < PITCH_DOWN_MIN
          || pitchRatio > PITCH_UP_MAX
          || jawOpenRatio > TALK_THRESHOLD

        if (poseViolation) {
          poseGuardFramesRef.current++
          if (poseGuardFramesRef.current >= POSE_GUARD_FRAMES) {
            blinkFramesRef.current = 0
            isBlinkingRef.current  = false
            s.setEyeStatus('not-tracking')
          }
        } else {
          poseGuardFramesRef.current = 0

          // EAR range validation — skip blink logic on bad frames (hand/occlusion)
          const earValid = rawEar >= EAR_VALID_MIN && rawEar <= EAR_VALID_MAX

          if (earValid) {
            // PERCLOS — fraction of valid frames with the eye below the blink threshold. This and
            // long blink closures are the externally validated drowsiness markers; they feed the
            // session score's fatigue factor and the live PERCLOS readout.
            const eyeClosed = ear < adaptiveThresholdRef.current
            s.addFatigueFrame(eyeClosed, dt)
            perclosEmaRef.current = perclosEmaRef.current === null
              ? (eyeClosed ? 1 : 0)
              : perclosEmaRef.current * (1 - PERCLOS_EMA_ALPHA) + (eyeClosed ? 1 : 0) * PERCLOS_EMA_ALPHA

            // Post-calibration EMA: keep threshold aligned with resting EAR as head pose changes.
            // Guard is absolute floor (CALIBRATION_OPEN_MIN) rather than adaptive threshold so the
            // EMA can recover even when resting EAR has drifted below the current threshold.
            // Down-gaze adaptation: a sustained head-down pose (pitch-based, blink-robust) means a low
            // EAR is expected from gaze, not a closed eye. Lower the EMA floor + adapt fast so the
            // threshold tracks the gaze-depressed open EAR instead of freezing above it.
            const pitchDown = baselinePitchRef.current !== null
              && (baselinePitchRef.current - pitchRatio) > PHONE_PITCH_DROP * 0.6
            const emaFloor = pitchDown ? DOWN_GAZE_OPEN_MIN : CALIBRATION_OPEN_MIN
            if (calElapsed >= CALIBRATION_WINDOW_MS && ear > emaFloor) {
              if (openEyeEmaRef.current === null) {
                openEyeEmaRef.current = ear
              } else {
                const nearEma = ear > openEyeEmaRef.current * 0.88
                stableOpenFramesRef.current = nearEma ? stableOpenFramesRef.current + 1 : 0
                const alpha = (pitchDown || stableOpenFramesRef.current > 30) ? ALPHA_FAST : ALPHA_SLOW
                openEyeEmaRef.current = openEyeEmaRef.current * (1 - alpha) + ear * alpha
              }
              if (++postCalFramesRef.current % (pitchDown ? 5 : 25) === 0) {
                adaptiveThresholdRef.current = openEyeEmaRef.current * EAR_THRESHOLD_RATIO
                s.setEarThreshold(Math.round(adaptiveThresholdRef.current * 1000) / 1000)
              }
            }

            const openThreshold = adaptiveThresholdRef.current + EAR_HYSTERESIS

            if (ear < adaptiveThresholdRef.current) {
              if (blinkFramesRef.current === 0) {
                blinkOnsetAtRef.current = Date.now()    // closure onset → blink duration at rising edge
                maxBlendRef.current = blendBlink ?? 0   // start tracking the peak blink blendshape
              } else if (blendBlink !== null && blendBlink > maxBlendRef.current) {
                maxBlendRef.current = blendBlink
              }
              blinkFramesRef.current++
              if (blinkFramesRef.current === BLINK_MIN_FRAMES) {
                isBlinkingRef.current = true
                s.setEyeStatus('blinking')
              }
            } else if (ear >= openThreshold) {
              // Rising edge: count only if closure lasted MIN..MAX frames AND the trained blink
              // blendshape actually fired during it (cross-check rejects EAR jitter/occlusion).
              // blendBlink === null (blendshapes off) → blendOk true → pure EAR fallback.
              const blendOk = blendBlink === null || maxBlendRef.current >= BLEND_BLINK_MIN
              if (isBlinkingRef.current && blinkFramesRef.current <= BLINK_MAX_FRAMES && blendOk) {
                earBufferRef.current = []   // reset buffer so next blink evaluates from fresh baseline

                blinkCountRef.current++
                s.setBlinkCount(blinkCountRef.current)

                const now = Date.now()
                if (blinkTimesRef.current.length > 0) {
                  const interval = now - blinkTimesRef.current[blinkTimesRef.current.length - 1]
                  if (interval < 30000) {
                    blinkIntervalsRef.current.push(interval)
                    if (blinkIntervalsRef.current.length > 20) blinkIntervalsRef.current.shift()
                    // Gate CV behind enough intervals: a CV from <6 samples is statistically
                    // meaningless yet carries 45% of the live score, so it stays null until then.
                    if (blinkIntervalsRef.current.length >= SCORE_CONFIG.CV_MIN_INTERVALS) {
                      const vals = blinkIntervalsRef.current
                      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
                      const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
                      s.setBlinkVariability(Math.round((std / mean) * 100) / 100)
                    }
                  }
                }
                blinkTimesRef.current.push(now)
                // Blink-closure duration (fatigue marker) — onset captured when EAR first dropped
                if (blinkOnsetAtRef.current) {
                  s.addBlinkDuration(now - blinkOnsetAtRef.current)
                  const dc = useStore.getState()
                  if (dc.blinkDurCount > 0) s.setLiveBlinkDurMs(Math.round(dc.blinkDurSumMs / dc.blinkDurCount))
                }
                recomputeRate(now)   // BPM + live focus score (also decays on the ~1s loop tick)
              }
              blinkFramesRef.current = 0
              isBlinkingRef.current  = false
              maxBlendRef.current    = 0
              if (useStore.getState().eyeStatus !== 'looking') s.setEyeStatus('looking')
            }
            // ear between T and T+EAR_HYSTERESIS: dead zone — no state change
          }
        }

        // Debug canvas overlay — draw video + face mesh when debug page is active
        if (debugCanvasRef.current) {
          const dc  = debugCanvasRef.current
          const ctx = dc.getContext('2d')
          ctx.clearRect(0, 0, dc.width, dc.height)
          ctx.drawImage(video, 0, 0, dc.width, dc.height)
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          for (const p of lm) ctx.fillRect(p.x * dc.width - 1, p.y * dc.height - 1, 2, 2)
          ctx.fillStyle = '#22d3ee'
          for (const i of L_EYE) ctx.fillRect(lm[i].x * dc.width - 3, lm[i].y * dc.height - 3, 6, 6)
          ctx.fillStyle = '#34d399'
          for (const i of R_EYE) ctx.fillRect(lm[i].x * dc.width - 3, lm[i].y * dc.height - 3, 6, 6)
          ctx.fillStyle = '#fbbf24'
          ctx.fillRect(lm[4].x * dc.width - 4, lm[4].y * dc.height - 4, 8, 8)
        }
      }
    } catch (e) {
      console.warn('[EyeTracker] Detection error:', e?.message || e)
    }

    if (activeRef.current) {
      rafRef.current = setTimeout(runFrame, 33)
    }
  }, [videoRef, recomputeRate])

  const startTracking = useCallback(async () => {
    const s = useStore.getState()
    if (!s.modelLoaded) await loadModels()

    // Always reset blink state so each activation starts clean
    blinkCountRef.current         = 0
    blinkFramesRef.current        = 0
    isBlinkingRef.current         = false
    blinkTimesRef.current         = []
    blinkIntervalsRef.current     = []
    trackingStartTimeRef.current  = Date.now()
    earBufferRef.current          = []
    calibrationSamplesRef.current = []
    adaptiveThresholdRef.current  = EAR_THRESHOLD
    calibrationStartRef.current   = Date.now()
    poseGuardFramesRef.current    = 0
    openEyeEmaRef.current         = null
    postCalFramesRef.current      = 0
    stableOpenFramesRef.current   = 0
    earChartBufferRef.current     = []
    phoneScoreRef.current         = 0
    lastFrameTimeRef.current      = null
    phoneDownStreakMsRef.current  = 0
    lastDownFrameAtRef.current    = 0
    baselinePitchRef.current      = null
    baselineGazeRef.current       = null
    pitchSamplesRef.current       = []
    gazeSamplesRef.current        = []
    phoneAutoPausedRef.current    = false
    phoneResumeMsRef.current      = 0
    faceLostAtRef.current         = null
    phoneCooldownUntilRef.current = 0
    resumePitchBufRef.current     = []
    resumeGazeBufRef.current      = []
    recalNextAtRef.current        = 0
    recalWindowEndRef.current     = null
    recalEarSamplesRef.current    = []
    recalPitchSamplesRef.current  = []
    recalGazeSamplesRef.current   = []
    cogSampleAccumMsRef.current   = 0
    blinkOnsetAtRef.current       = null
    maxBlendRef.current           = 0
    perclosEmaRef.current         = null
    lastRateComputeAtRef.current  = 0
    s.setPhoneScorePct(0)
    s.setBlinkCount(0)
    s.setBlinkRate(0)
    s.setBlinkVariability(null)
    s.setLiveFocusScore(null)
    s.setLivePerclos(null)
    s.setLiveBlinkDurMs(null)
    s.resetScoreAccum()

    // System input idle poll — feeds the typing/mouse phone veto + the debug "Input" stat
    idleMsRef.current        = null
    idlePolledAtRef.current  = 0
    s.setInputIdleMs(null)
    if (idlePollRef.current) clearInterval(idlePollRef.current)
    idlePollRef.current = setInterval(async () => {
      try {
        const ms = await window.api?.system?.getIdleMs?.()
        if (typeof ms === 'number') {
          idleMsRef.current = ms
          idlePolledAtRef.current = Date.now()
          useStore.getState().setInputIdleMs(Math.round(ms))
        }
      } catch { /* idle source unavailable — leave refs as-is (no veto) */ }
    }, IDLE_POLL_MS)

    activeRef.current = true
    s.setEyeTrackingActive(true)
    rafRef.current = setTimeout(runFrame, 66)
  }, [loadModels, runFrame])

  const stopTracking = useCallback(() => {
    activeRef.current = false
    if (rafRef.current) {
      clearTimeout(rafRef.current)
      rafRef.current = null
    }
    blinkCountRef.current         = 0
    blinkFramesRef.current        = 0
    isBlinkingRef.current         = false
    blinkTimesRef.current         = []
    blinkIntervalsRef.current     = []
    trackingStartTimeRef.current  = null
    earBufferRef.current          = []
    calibrationSamplesRef.current = []
    adaptiveThresholdRef.current  = EAR_THRESHOLD
    calibrationStartRef.current   = null
    poseGuardFramesRef.current    = 0
    openEyeEmaRef.current         = null
    postCalFramesRef.current      = 0
    stableOpenFramesRef.current   = 0
    if (phoneAutoPausedRef.current) {
      useStore.getState().setPhoneDetected(false)
      window.api?.overlay?.phoneDetected?.(false)
    }
    phoneScoreRef.current         = 0
    lastFrameTimeRef.current      = null
    phoneDownStreakMsRef.current  = 0
    lastDownFrameAtRef.current    = 0
    baselinePitchRef.current      = null
    baselineGazeRef.current       = null
    pitchSamplesRef.current       = []
    gazeSamplesRef.current        = []
    phoneAutoPausedRef.current    = false
    phoneResumeMsRef.current      = 0
    faceLostAtRef.current         = null
    phoneCooldownUntilRef.current = 0
    resumePitchBufRef.current     = []
    resumeGazeBufRef.current      = []
    recalNextAtRef.current        = 0
    recalWindowEndRef.current     = null
    recalEarSamplesRef.current    = []
    recalPitchSamplesRef.current  = []
    recalGazeSamplesRef.current   = []
    cogSampleAccumMsRef.current   = 0
    blinkOnsetAtRef.current       = null
    maxBlendRef.current           = 0
    perclosEmaRef.current         = null
    lastRateComputeAtRef.current  = 0
    if (idlePollRef.current) { clearInterval(idlePollRef.current); idlePollRef.current = null }
    idleMsRef.current             = null
    idlePolledAtRef.current       = 0
    useStore.getState().setPhoneScorePct(0)
    useStore.getState().setInputIdleMs(null)

    const s = useStore.getState()
    s.setEyeTrackingActive(false)
    s.setEyeStatus('unknown')
    s.setBlinkCount(0)
    s.setBlinkRate(0)
    s.setBlinkVariability(null)
    s.setLiveFocusScore(null)
    s.setLivePerclos(null)
    s.setLiveBlinkDurMs(null)
    s.resetScoreAccum()
  }, [])

  const recalibrate = useCallback(() => {
    if (!activeRef.current) return
    calibrationSamplesRef.current = []
    adaptiveThresholdRef.current  = EAR_THRESHOLD
    calibrationStartRef.current   = Date.now()
    openEyeEmaRef.current         = null
    postCalFramesRef.current      = 0
    stableOpenFramesRef.current   = 0
    earChartBufferRef.current     = []
    pitchSamplesRef.current       = []
    gazeSamplesRef.current        = []
    baselinePitchRef.current      = null
    baselineGazeRef.current       = null
    phoneScoreRef.current         = 0
    blinkOnsetAtRef.current       = null
    maxBlendRef.current           = 0
    recalNextAtRef.current        = 0
    recalWindowEndRef.current     = null
    recalEarSamplesRef.current    = []
    recalPitchSamplesRef.current  = []
    recalGazeSamplesRef.current   = []
    const s = useStore.getState()
    s.setCalibrationProgress(0)
    s.setCalibrationSampleCount(0)
    s.setEarThreshold(EAR_THRESHOLD)
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) clearTimeout(rafRef.current)
      if (idlePollRef.current) clearInterval(idlePollRef.current)
    }
  }, [])

  return { loadModels, startTracking, stopTracking, recalibrate }
}
