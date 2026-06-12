import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { computeFocusScore } from '../utils/focusScore'
import { playBeep, playPhoneAlert } from '../utils/audio'

const EAR_THRESHOLD         = 0.20
const BLINK_MIN_FRAMES      = 2
const BLINK_MAX_FRAMES      = 15
const YAW_THRESHOLD         = 0.55
const PITCH_DOWN_MIN        = 0.50
const PITCH_UP_MAX          = 2.50
const EAR_SMOOTH_FRAMES     = 3
const CALIBRATION_WINDOW_MS = 10000
const CALIBRATION_OPEN_MIN  = 0.15   // was 0.22 — captures small/tired eyes too
const EAR_HYSTERESIS        = 0.02   // dead zone above threshold to prevent oscillation
const EAR_SPIKE_LIMIT       = 0.12   // max frame-to-frame EAR delta — clamps occlusion spikes
const EAR_VALID_MIN         = 0.05   // below this = bad frame (hand/occlusion)
const EAR_VALID_MAX         = 0.60   // above this = bad frame
const TALK_THRESHOLD        = 0.22   // jaw-open ratio (lip gap / eye span) — suppress while talking
const POSE_GUARD_FRAMES     = 3      // consecutive bad-pose frames before suppression kicks in
const ALPHA_SLOW            = 0.008  // EMA rate during normal tracking (~86-frame half-life, 2.8s)
const ALPHA_FAST            = 0.030  // EMA rate when eye is clearly stable (~23-frame half-life, 0.8s)
const PHONE_PITCH_DROP      = 0.15   // head-down = pitch below personal baseline by this much
const PHONE_GAZE_DROP       = 0.045  // eyes-down = iris below personal baseline by this much (÷ eyeSpan)
const PHONE_TRIGGER_MS      = 3000   // accumulated down-time that fires detection
const PHONE_DECAY_FACTOR    = 2      // up-frames drain the accumulator 2× faster than down-frames fill it
const PHONE_EAR_RATIO       = 0.88   // EAR booster: depressed EAR lowers the down-bar on borderline frames
const PHONE_RESUME_CANCEL_MS = 500   // sustained down-time needed to cancel the resume countdown (flicker-proof)
const BASELINE_ALPHA        = 0.005  // slow drift-tracking EMA for pitch/gaze baselines on up-frames

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
  const phoneResumeStartRef    = useRef(null)

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

      if (!lm) {
        // Face not visible — hold the phone score (deep phone gaze often loses the face),
        // but the resume countdown needs continuous visible up-frames, so reset it.
        phoneResumeStartRef.current  = null
        lastFrameTimeRef.current     = null
        phoneDownStreakMsRef.current = 0
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
            } else {
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
          adaptiveThresholdRef.current = p75 * 0.75
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

        const phoneUseExpected = useStore.getState().phoneUseExpected
        if (phoneUseExpected === false) {
          // Frame classifier — relative drops vs calibrated baselines. Head down OR eyes down counts;
          // a depressed EAR lowers the bar on borderline frames. Pre-calibration falls back to the
          // absolute pitch threshold (conservative: may under-detect, never over-detects).
          const earLow = openEyeEmaRef.current !== null && ear < openEyeEmaRef.current * PHONE_EAR_RATIO
          let downFrame
          if (baselinePitchRef.current === null) {
            downFrame = pitchRatio < PITCH_DOWN_MIN
          } else {
            const pitchDrop  = baselinePitchRef.current - pitchRatio
            const gazeDrop   = gazeRatio - baselineGazeRef.current
            const headDown   = pitchDrop > PHONE_PITCH_DROP
            const eyesDown   = gazeDrop  > PHONE_GAZE_DROP
            const borderline = pitchDrop > PHONE_PITCH_DROP * 0.6 || gazeDrop > PHONE_GAZE_DROP * 0.6
            downFrame = headDown || eyesDown || (earLow && borderline)
          }

          if (downFrame) {
            phoneDownStreakMsRef.current += dt
            lastDownFrameAtRef.current = frameNow
            // Only a sustained look-down cancels the resume countdown — a single
            // misclassified flicker frame (~33ms of landmark noise) must not restart the 5s wait
            if (phoneDownStreakMsRef.current > PHONE_RESUME_CANCEL_MS) phoneResumeStartRef.current = null
            phoneScoreRef.current = Math.min(phoneScoreRef.current + dt, PHONE_TRIGGER_MS)
            const freshState = useStore.getState()
            if (phoneScoreRef.current >= PHONE_TRIGGER_MS && freshState.pomodoroState === 'work' && !phoneAutoPausedRef.current) {
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
              phoneResumeStartRef.current = null
              phoneScoreRef.current = 0
              freshState.setPhoneDetected(false)
              window.api?.overlay?.phoneDetected?.(false)
            } else if (phoneAutoPausedRef.current && freshState.pomodoroState === 'paused') {
              // 5-second sustained look-up before resuming
              if (!phoneResumeStartRef.current) phoneResumeStartRef.current = Date.now()
              const resumeMs = Date.now() - phoneResumeStartRef.current
              if (resumeMs >= 5000) {
                phoneAutoPausedRef.current = false
                phoneResumeStartRef.current = null
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
            // Post-calibration EMA: keep threshold aligned with resting EAR as head pose changes.
            // Guard is absolute floor (CALIBRATION_OPEN_MIN) rather than adaptive threshold so the
            // EMA can recover even when resting EAR has drifted below the current threshold.
            if (calElapsed >= CALIBRATION_WINDOW_MS && ear > CALIBRATION_OPEN_MIN) {
              if (openEyeEmaRef.current === null) {
                openEyeEmaRef.current = ear
              } else {
                const nearEma = ear > openEyeEmaRef.current * 0.88
                stableOpenFramesRef.current = nearEma ? stableOpenFramesRef.current + 1 : 0
                const alpha = stableOpenFramesRef.current > 30 ? ALPHA_FAST : ALPHA_SLOW
                openEyeEmaRef.current = openEyeEmaRef.current * (1 - alpha) + ear * alpha
              }
              if (++postCalFramesRef.current % 50 === 0) {
                adaptiveThresholdRef.current = openEyeEmaRef.current * 0.75
                s.setEarThreshold(Math.round(adaptiveThresholdRef.current * 1000) / 1000)
              }
            }

            const openThreshold = adaptiveThresholdRef.current + EAR_HYSTERESIS

            if (ear < adaptiveThresholdRef.current) {
              blinkFramesRef.current++
              if (blinkFramesRef.current === BLINK_MIN_FRAMES) {
                isBlinkingRef.current = true
                s.setEyeStatus('blinking')
              }
            } else if (ear >= openThreshold) {
              // Rising edge: count only if closure lasted between MIN and MAX frames
              if (isBlinkingRef.current && blinkFramesRef.current <= BLINK_MAX_FRAMES) {
                earBufferRef.current = []   // reset buffer so next blink evaluates from fresh baseline

                blinkCountRef.current++
                s.setBlinkCount(blinkCountRef.current)

                const now = Date.now()
                if (blinkTimesRef.current.length > 0) {
                  const interval = now - blinkTimesRef.current[blinkTimesRef.current.length - 1]
                  if (interval < 30000) {
                    blinkIntervalsRef.current.push(interval)
                    if (blinkIntervalsRef.current.length > 20) blinkIntervalsRef.current.shift()
                    if (blinkIntervalsRef.current.length >= 3) {
                      const vals = blinkIntervalsRef.current
                      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
                      const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
                      s.setBlinkVariability(Math.round((std / mean) * 100) / 100)
                    }
                  }
                }
                blinkTimesRef.current = blinkTimesRef.current.filter((t) => now - t < 60000)
                blinkTimesRef.current.push(now)
                const elapsed = trackingStartTimeRef.current ? now - trackingStartTimeRef.current : 60000
                // Clamp denominator to [20s, 60s]: prevents wild spikes on the first few blinks
                // while still normalising correctly once 20s of data have accumulated.
                const denominator = Math.max(Math.min(elapsed, 60000), 20000)
                const liveBPM = Math.round(blinkTimesRef.current.length * 60000 / denominator)
                s.setBlinkRate(liveBPM)
                s.setLiveFocusScore(computeFocusScore(liveBPM, useStore.getState().blinkVariability))
              }
              blinkFramesRef.current = 0
              isBlinkingRef.current  = false
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
  }, [videoRef])

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
    phoneResumeStartRef.current   = null
    s.setPhoneScorePct(0)
    s.setBlinkCount(0)
    s.setBlinkRate(0)
    s.setBlinkVariability(null)
    s.setLiveFocusScore(null)

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
    phoneResumeStartRef.current   = null
    useStore.getState().setPhoneScorePct(0)

    const s = useStore.getState()
    s.setEyeTrackingActive(false)
    s.setEyeStatus('unknown')
    s.setBlinkCount(0)
    s.setBlinkRate(0)
    s.setBlinkVariability(null)
    s.setLiveFocusScore(null)
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
    const s = useStore.getState()
    s.setCalibrationProgress(0)
    s.setCalibrationSampleCount(0)
    s.setEarThreshold(EAR_THRESHOLD)
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [])

  return { loadModels, startTracking, stopTracking, recalibrate }
}
