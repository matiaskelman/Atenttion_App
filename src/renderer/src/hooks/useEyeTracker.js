import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { computeFocusScore } from '../utils/focusScore'
import { playBeep } from '../utils/audio'

const EAR_THRESHOLD = 0.20
const BLINK_MIN_FRAMES = 1
const YAW_THRESHOLD = 0.55

// MediaPipe 478-point mesh — 6 EAR landmarks per eye
const L_EYE = [362, 385, 387, 263, 373, 380]
const R_EYE = [33,  160, 158, 133, 153, 144]

const WASM_PATH  = import.meta.env.PROD ? 'models://root/mediapipe'          : '/models/mediapipe'
const MODEL_PATH = import.meta.env.PROD ? 'models://root/face_landmarker.task' : '/models/face_landmarker.task'

// Module-level singleton: survives hook remounts so the landmarker is never lost.
const landmarkerRef = { current: null }

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function getEAR(lm, indices, w, h) {
  const p = indices.map((i) => ({ x: lm[i].x * w, y: lm[i].y * h }))
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]))
}

export function useEyeTracker(videoRef) {
  const activeRef             = useRef(false)
  const rafRef                = useRef(null)
  const blinkFramesRef        = useRef(0)
  const isBlinkingRef         = useRef(false)
  const blinkCountRef         = useRef(useStore.getState().blinkCount)
  const awayStartRef          = useRef(null)
  const autoPausedRef         = useRef(false)
  const blinkTimesRef         = useRef([])
  const blinkIntervalsRef     = useRef([])
  const trackingStartTimeRef  = useRef(null)

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

        // Yaw: nose tip offset from eye midpoint, normalised by eye span
        const noseTipX    = lm[4].x
        const leftEyeCX   = (lm[362].x + lm[263].x) / 2
        const rightEyeCX  = (lm[33].x  + lm[133].x) / 2
        const eyeSpan     = Math.abs(leftEyeCX - rightEyeCX)
        const yawRatio    = eyeSpan > 0 ? Math.abs(noseTipX - (leftEyeCX + rightEyeCX) / 2) / eyeSpan : 0

        if (yawRatio > YAW_THRESHOLD) {
          blinkFramesRef.current = 0
          s.setEyeStatus('not-tracking')
        } else {
          const ear = (getEAR(lm, L_EYE, w, h) + getEAR(lm, R_EYE, w, h)) / 2

          if (ear < EAR_THRESHOLD) {
            blinkFramesRef.current++
            if (blinkFramesRef.current >= BLINK_MIN_FRAMES && !isBlinkingRef.current) {
              isBlinkingRef.current = true
              blinkCountRef.current++
              s.setBlinkCount(blinkCountRef.current)
              s.setEyeStatus('blinking')

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
          } else {
            blinkFramesRef.current = 0
            if (isBlinkingRef.current) isBlinkingRef.current = false
            const currentStatus = useStore.getState().eyeStatus
            if (currentStatus !== 'looking') s.setEyeStatus('looking')
          }
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
    blinkCountRef.current = 0
    blinkFramesRef.current = 0
    isBlinkingRef.current = false
    blinkTimesRef.current = []
    blinkIntervalsRef.current = []
    trackingStartTimeRef.current = Date.now()
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
    blinkCountRef.current = 0
    blinkFramesRef.current = 0
    isBlinkingRef.current = false
    blinkTimesRef.current = []
    blinkIntervalsRef.current = []
    trackingStartTimeRef.current = null

    const s = useStore.getState()
    s.setEyeTrackingActive(false)
    s.setEyeStatus('unknown')
    s.setBlinkCount(0)
    s.setBlinkRate(0)
    s.setBlinkVariability(null)
    s.setLiveFocusScore(null)
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [])

  return { loadModels, startTracking, stopTracking }
}
