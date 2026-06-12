import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function useAppTracker() {
  const lastPollTimeRef = useRef(null)
  const storedDateRef = useRef(new Date().toLocaleDateString('en-CA'))

  useEffect(() => {
    const poll = async () => {
      const now = Date.now()
      // Destructure only stable action refs before the async call
      const { setActiveApp, recordAppUsage } = useStore.getState()

      // Midnight reset — if the calendar date changed, wipe all today-scoped metrics
      const today = new Date().toLocaleDateString('en-CA')
      if (today !== storedDateRef.current) {
        storedDateRef.current = today
        useStore.getState().resetDailyMetrics()
        window.api?.data.saveAppUsage({ focus: {}, break: {} }).catch(() => {})
      }

      const app = await window.api?.system.getActiveApp()
      if (app && app !== 'Unknown') setActiveApp(app)

      // Read pomodoroState AFTER the await — the PowerShell call takes 2-3s
      // and the state can change (e.g. work → break) during that time
      const { pomodoroState, phoneDetected } = useStore.getState()
      const isActive = pomodoroState === 'work' || pomodoroState === 'break'
      // Phone-paused time counts against the focus session as its own "Phone" entry —
      // the desktop foreground app is irrelevant while the user is on the phone
      const isPhonePause = pomodoroState === 'paused' && phoneDetected

      if (lastPollTimeRef.current !== null) {
        const elapsed = Math.min((now - lastPollTimeRef.current) / 1000, 4)
        if (isPhonePause) {
          recordAppUsage('Phone', 'focus', elapsed)
        } else if (isActive && app && app !== 'Unknown') {
          recordAppUsage(app, pomodoroState === 'work' ? 'focus' : 'break', elapsed)
        }
      }

      lastPollTimeRef.current = (isActive || isPhonePause) ? now : null
    }

    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [])
}
