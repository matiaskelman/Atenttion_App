import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { computeFocusScore } from '../utils/focusScore'
import { playBeep } from '../utils/audio'

const EAR_THRESHOLD         = 0.20
const BLINK_MIN_FRAMES      = 3
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
const TALK_THRESHOLD        = 0.15   // jaw-open ratio (lip gap / eye span) — suppress while talking
const POSE_GUARD_FRAMES     = 3      // consecutive bad-pose frames before suppression kicks in

// MediaPipe 478-point mesh — 6 EAR landmarks per eye
const L_EYE = [362, 385, 387, 263, 373, 380]
const R_EYE = [33,  160, 158, 133, 153, 144]

const WASM_PATH  = import.meta.env.PROD ? 'models://root/mediapipe'          : '/models/mediapipe'
const MODEL_PATH = import.meta.env.PROD ? 'models://root/face_landmarker.task' : '/models/face_landmarker.task'

// Module-level singleton: survives hook remounts so the landmarker is never lost.
const landmarkerRef  = { current: null }
const debugCanvasRef = { current: null }
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
        if (!awayStartRef.current) awayStartRef.current = Date.now()
        const awayMs = Date.now() - awayStartRef.current
        s.setLookingAwaySeconds(Math.round(awayMs / 1000))
        const threshold = useStore.getState().eyeAwayThresholdMs || 3000
        if (awayMs > threshold) {
          s.setEyeStatus('away')
          const current = useStore.getState()
          if (current.pomodoroState === 'work' && !autoPausedRef.current) {
            autoPausedRef.current = true
            current.setPomodoroState('paused')
            const prefs = useStore.getState()
            if (prefs.notifyOnAutoPause && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Atenttion', { body: 'Timer paused — you looked away.', silent: true })
            }
            if (prefs.soundOnAutoPause) playBeep()
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

        // Compute raw EAR
        const rawEar = (getEAR(lm, L_EYE, w, h) + getEAR(lm, R_EYE, w, h)) / 2

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

        // Silent adaptive calibration: build per-user threshold from first 10 s of open-eye readings
        const calElapsed = calibrationStartRef.current ? Date.now() - calibrationStartRef.current : Infinity
        if (calElapsed < CALIBRATION_WINDOW_MS) {
          if (ear > CALIBRATION_OPEN_MIN) calibrationSamplesRef.current.push(ear)
        } else if (calibrationSamplesRef.current.length >= 30) {
          // Use 75th percentile of open-eye readings — robust to any eye size
          const sorted = [...calibrationSamplesRef.current].sort((a, b) => a - b)
          const p75    = sorted[Math.floor(sorted.length * 0.75)]
          adaptiveThresholdRef.current = p75 * 0.70
          calibrationSamplesRef.current = []
        }

        // Debug store updates — always update so the debug page shows live values
        s.setLiveEar(Math.round(ear * 1000) / 1000)
        s.setEarThreshold(Math.round(adaptiveThresholdRef.current * 1000) / 1000)
        s.setLiveYaw(Math.round(yawRatio * 100) / 100)
        s.setLivePitch(Math.round(pitchRatio * 100) / 100)
        s.setLiveJawOpen(Math.round(jawOpenRatio * 100) / 100)
        s.setCalibrationProgress(Math.min(100, Math.round(calElapsed / CALIBRATION_WINDOW_MS * 100)))
        s.setCalibrationSampleCount(calibrationSamplesRef.current.length)

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
