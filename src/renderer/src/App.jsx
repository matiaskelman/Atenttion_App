// Copyright (c) 2026 Matias Kelman. All rights reserved.
import { useEffect, useRef, useCallback } from 'react'
import { useStore } from './store'
import { usePomodoro } from './hooks/usePomodoro'
import { useEyeTracker } from './hooks/useEyeTracker'
import { useAppTracker } from './hooks/useAppTracker'
import { useAudio } from './hooks/useAudio'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import FocusPage from './components/pages/FocusPage'
import StatsPage from './components/pages/StatsPage'
import SystemPage from './components/pages/SystemPage'
import AudiosPage from './components/pages/AudiosPage'
import EyeDebugPage from './components/pages/EyeDebugPage'
import RitualModal from './components/RitualModal'

export default function App() {
  const page = useStore((s) => s.page)
  const applyPreferences = useStore((s) => s.applyPreferences)
  const pomodoroState = useStore((s) => s.pomodoroState)
  const focusWallpaperEnabled = useStore((s) => s.focusWallpaperEnabled)
  const showRitualModal = useStore((s) => s.showRitualModal)
  const ritualPhase = useStore((s) => s.ritualPhase)
  const ritualGoal = useStore((s) => s.ritualGoal)
  const pomodoroControls = usePomodoro()
  const audioControls = useAudio()
  useAppTracker()

  const overlayFeedbackActiveRef = useRef(false)

  // Mirror post-ritual modal state into the overlay feedback card
  useEffect(() => {
    if (showRitualModal && ritualPhase === 'post') {
      overlayFeedbackActiveRef.current = true
      window.api?.overlay.showFeedback(ritualGoal)
    } else if (!showRitualModal && overlayFeedbackActiveRef.current) {
      overlayFeedbackActiveRef.current = false
      window.api?.overlay.dismissFeedback()
    }
  }, [showRitualModal, ritualPhase, ritualGoal])

  // Auto-dismiss post-ritual modal after 10 s with no response
  useEffect(() => {
    if (!showRitualModal || ritualPhase !== 'post') return
    const timer = setTimeout(() => pomodoroControls.confirmPostRitual(null), 10000)
    return () => clearTimeout(timer)
  }, [showRitualModal, ritualPhase, pomodoroControls.confirmPostRitual])

  // Rating submitted from the overlay — same path as in-app modal
  useEffect(() => {
    return window.api?.overlay?.onRating?.((rating) => {
      pomodoroControls.confirmPostRitual(rating)
    })
  }, [pomodoroControls.confirmPostRitual])

  // Persistent video element ref — lives here so camera survives page navigation
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const { loadModels, startTracking, stopTracking, recalibrate } = useEyeTracker(videoRef)

  // Wallpaper refs — save original once, restore when focus ends
  const originalWallpaperRef = useRef(null)
  const focusWallpaperPathRef = useRef(null)
  const wallpaperActiveRef = useRef(false)

  useEffect(() => {
    window.api?.data.loadPreferences().then((res) => {
      if (res?.success && res.prefs) applyPreferences(res.prefs)
    })
    window.api?.data.loadSessions().then((res) => {
      if (res?.success && res.sessions?.length) {
        useStore.getState().applySessionHistory(res.sessions)
      }
    })
    window.api?.data.loadAppUsage().then((res) => {
      if (res?.success && res.usage) {
        useStore.getState().setAppUsage(res.usage.focus, res.usage.break)
      }
    })
    window.api?.system.getCurrentWallpaper().then((p) => {
      if (p) {
        originalWallpaperRef.current = p
        useStore.getState().setOriginalWallpaper(p)
      }
    })
    // Delay model preload so startup rendering finishes first
    const preloadTimer = setTimeout(() => loadModels(), 2000)
    return () => clearTimeout(preloadTimer)
  }, [])

  // Persist app usage every 60s so it survives app restarts
  useEffect(() => {
    const id = setInterval(() => {
      const { appUsageFocus, appUsageBreak } = useStore.getState()
      window.api?.data.saveAppUsage({ focus: appUsageFocus, break: appUsageBreak }).catch(() => {})
    }, 60000)
    return () => clearInterval(id)
  }, [])

  // Poll system info every 5s — lives here so it runs regardless of which page is active
  useEffect(() => {
    const poll = async () => {
      const info = await window.api?.system.getInfo()
      if (info) useStore.getState().setSystemInfo(info)
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  // Keep overlay circle in sync whenever timer or eye status changes
  useEffect(() => {
    return useStore.subscribe(
      (state) => ({ timeLeft: state.timeLeft, eyeStatus: state.eyeStatus, pomodoroState: state.pomodoroState }),
      ({ timeLeft, eyeStatus, pomodoroState }) => {
        window.api?.overlay?.update({ timeLeft, eyeStatus, pomodoroState })
      }
    )
  }, [])

  const restoreWallpaper = useCallback(async () => {
    if (!wallpaperActiveRef.current || !originalWallpaperRef.current) return
    await window.api?.system.setWallpaper(originalWallpaperRef.current)
    wallpaperActiveRef.current = false
  }, [])

  useEffect(() => {
    if (pomodoroState !== 'work' || !focusWallpaperEnabled) {
      if (wallpaperActiveRef.current) restoreWallpaper()
      return
    }
    ;(async () => {
      if (!originalWallpaperRef.current) {
        const orig = useStore.getState().originalWallpaper || await window.api?.system.getCurrentWallpaper()
        if (orig) {
          originalWallpaperRef.current = orig
          useStore.getState().setOriginalWallpaper(orig)
        }
      }
      if (!focusWallpaperPathRef.current) {
        const res = await window.api?.system.createFocusWallpaper()
        if (res?.success) focusWallpaperPathRef.current = res.path
      }
      if (focusWallpaperPathRef.current) {
        await window.api?.system.setWallpaper(focusWallpaperPathRef.current)
        wallpaperActiveRef.current = true
      }
    })()
  }, [pomodoroState, focusWallpaperEnabled, restoreWallpaper])

  useEffect(() => () => { restoreWallpaper() }, [restoreWallpaper])

  const startCam = async () => {
    useStore.getState().setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user', frameRate: 15 }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      await startTracking()
    } catch (e) {
      useStore.getState().setCamError(e.message || 'Camera access denied')
    }
  }

  const stopCam = () => {
    stopTracking()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const eyeTrackerControls = { startCam, stopCam }

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-neutral-100 select-none overflow-hidden">
      {/* Persistent hidden video — must not use display:none (blocks canvas reads in Chromium) */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, top: -9999 }}
        muted
        playsInline
        width={640}
        height={480}
      />
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {page === 'focus'  && <FocusPage pomodoroControls={pomodoroControls} eyeTrackerControls={eyeTrackerControls} />}
          {page === 'stats'  && <StatsPage />}
          {page === 'system' && <SystemPage />}
          {page === 'audios'    && <AudiosPage audioControls={audioControls} />}
          {page === 'eyedebug' && <EyeDebugPage videoRef={videoRef} recalibrate={recalibrate} />}
        </main>
      </div>
      {showRitualModal && (
        <RitualModal
          onConfirmPre={pomodoroControls.confirmPreRitual}
          onConfirmPost={pomodoroControls.confirmPostRitual}
        />
      )}
    </div>
  )
}
