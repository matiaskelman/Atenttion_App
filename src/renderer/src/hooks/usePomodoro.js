import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { computeFocusScore } from '../utils/focusScore'
import { playBeep, playFocusEndTick, playBreakEndTick } from '../utils/audio'

// Sessions within this window are considered the same block — ritual shown only once per block
const BLOCK_GAP_MS = 40 * 60 * 1000

export function usePomodoro() {
  const pomodoroState = useStore((s) => s.pomodoroState)
  const intervalRef = useRef(null)
  const timerStartedAtRef = useRef(null)
  const timeLeftAtStartRef = useRef(null)
  const awayStartRef = useRef(0)
  const sessionStartBlinkRef = useRef(0)
  const lastSessionEndedAtRef = useRef(0)
  const ritualDataRef = useRef(null)   // goal+mood captured at confirmPreRitual; lives for the whole block
  // Holds completed session data between work-end and post-ritual confirmation
  const pendingSessionRef = useRef(null)

  const saveSession = (session) => {
    window.api?.data.saveSession(session)
      .then((res) => {
        if (!res?.success) {
          console.error('[saveSession] failed:', res?.error)
          notify('Atenttion', 'Session could not be saved. Check available disk space.')
        }
      })
      .catch((e) => console.error('[saveSession] IPC error:', e))
    const { appUsageFocus, appUsageBreak } = useStore.getState()
    window.api?.data.saveAppUsage({ focus: appUsageFocus, break: appUsageBreak })
      .catch((e) => console.error('[saveAppUsage] IPC error:', e))
  }

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const notify = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, silent: false })
    }
  }

  const startTimer = useCallback(() => {
    clearTimer()
    timerStartedAtRef.current = Date.now()
    timeLeftAtStartRef.current = useStore.getState().timeLeft
    intervalRef.current = setInterval(() => {
      const s = useStore.getState()
      if (s.pomodoroState !== 'work' && s.pomodoroState !== 'break') {
        clearInterval(intervalRef.current)
        return
      }
      const elapsed = (Date.now() - timerStartedAtRef.current) / 1000
      const next = Math.max(0, Math.round(timeLeftAtStartRef.current - elapsed))
      if (next > 0 && next <= 10) {
        if (s.pomodoroMode === 'work') playFocusEndTick()
        else playBreakEndTick()
      }
      if (next <= 0) {
        clearTimer()
        if (s.pomodoroMode === 'work') {
          const sessionBPM = s.blinkRate
          const cv = s.blinkVariability
          const focusScore = computeFocusScore(sessionBPM, cv)
          const sessionData = {
            date: new Date().toISOString(),
            duration: s.workDuration,
            blinkCount: s.blinkCount - sessionStartBlinkRef.current,
            blinkRate: sessionBPM,
            blinkVariability: cv,
            focusScore,
            awaySeconds: s.totalLookingAwaySeconds - awayStartRef.current,
            appUsage: { ...s.appUsageFocus }
          }

          if (s.ritualEnabled) {
            const rd = ritualDataRef.current
            pendingSessionRef.current = {
              ...sessionData,
              ritual: true,
              goal: rd?.goal ?? s.ritualGoal,
              moodBefore: rd?.moodBefore ?? s.ritualMoodBefore,
            }
            s.setTimeLeft(0)  // Show work is done while feedback modal is open
            s.setRitualPhase('post')
            s.setShowRitualModal(true)
            // Break transition happens in confirmPostRitual
          } else {
            s.addSession(sessionData)
            saveSession(sessionData)
            s.incrementSessions()
            const { streak: newStreak1, lastSessionDate: today1 } = useStore.getState().updateStreak()
            window.api?.data.savePreferences({
              workDuration: s.workDuration,
              shortBreakDuration: s.shortBreakDuration,
              longBreakDuration: s.longBreakDuration,
              eyeAwayThresholdMs: s.eyeAwayThresholdMs,
              notifyOnAutoPause: s.notifyOnAutoPause,
              soundOnAutoPause: s.soundOnAutoPause,
              dailyGoalSeconds: s.dailyGoalSeconds,
              ritualEnabled: s.ritualEnabled,
              focusWallpaperEnabled: s.focusWallpaperEnabled,
              streak: newStreak1,
              lastSessionDate: today1
            }).catch(() => {})
            lastSessionEndedAtRef.current = Date.now()
            notify('Atenttion', 'Work session complete! Take a break.')
            const nextCount = s.sessionsCompleted + 1
            if (nextCount % 4 === 0) {
              s.setPomodoroMode('long-break')
              s.setTimeLeft(s.longBreakDuration)
            } else {
              s.setPomodoroMode('short-break')
              s.setTimeLeft(s.shortBreakDuration)
            }
            s.setPomodoroState('break')
            setTimeout(() => startTimer(), 50)
          }
        } else if (s.pomodoroMode === 'short-break') {
          notify('Atenttion', 'Break over! Starting focus session.')
          playBeep()
          s.setPomodoroMode('work')
          s.setTimeLeft(s.workDuration)
          sessionStartBlinkRef.current = s.blinkCount
          awayStartRef.current = s.totalLookingAwaySeconds
          s.setPomodoroState('work')
          setTimeout(() => startTimer(), 50)
        } else {
          // Long break ends — return to idle, let user start manually
          notify('Atenttion', 'Long break over! Ready when you are.')
          s.setPomodoroMode('work')
          s.setTimeLeft(s.workDuration)
          s.setPomodoroState('idle')
          sessionStartBlinkRef.current = s.blinkCount
        }
      } else {
        s.setTimeLeft(next)
      }
    }, 1000)
  }, [clearTimer])

  // Called when user confirms the pre-session ritual modal
  const confirmPreRitual = useCallback(() => {
    const s = useStore.getState()
    ritualDataRef.current = { goal: s.ritualGoal, moodBefore: s.ritualMoodBefore }
    s.setShowRitualModal(false)
    sessionStartBlinkRef.current = s.blinkCount
    awayStartRef.current = s.totalLookingAwaySeconds
    s.setPomodoroState('work')
    startTimer()
  }, [startTimer])

  // Called when user confirms the post-session ritual modal
  const confirmPostRitual = useCallback((outcomeRating) => {
    const session = pendingSessionRef.current
    if (!session) return
    const finalSession = outcomeRating != null
      ? { ...session, outcomeRating }
      : session
    pendingSessionRef.current = null

    const s = useStore.getState()
    s.addSession(finalSession)
    saveSession(finalSession)
    s.incrementSessions()
    const { streak: newStreak2, lastSessionDate: today2 } = useStore.getState().updateStreak()
    window.api?.data.savePreferences({
      workDuration: s.workDuration,
      shortBreakDuration: s.shortBreakDuration,
      longBreakDuration: s.longBreakDuration,
      eyeAwayThresholdMs: s.eyeAwayThresholdMs,
      notifyOnAutoPause: s.notifyOnAutoPause,
      soundOnAutoPause: s.soundOnAutoPause,
      dailyGoalSeconds: s.dailyGoalSeconds,
      ritualEnabled: s.ritualEnabled,
      focusWallpaperEnabled: false,
      streak: newStreak2,
      lastSessionDate: today2
    }).catch(() => {})
    lastSessionEndedAtRef.current = Date.now()
    s.setShowRitualModal(false)
    // ritualDataRef kept alive so consecutive block sessions inherit the same goal+mood

    notify('Atenttion', 'Work session complete! Take a break.')
    const nextCount = s.sessionsCompleted + 1
    if (nextCount % 4 === 0) {
      s.setPomodoroMode('long-break')
      s.setTimeLeft(s.longBreakDuration)
    } else {
      s.setPomodoroMode('short-break')
      s.setTimeLeft(s.shortBreakDuration)
    }
    s.setPomodoroState('break')
    setTimeout(() => startTimer(), 50)
  }, [startTimer])

  const start = useCallback(() => {
    const s = useStore.getState()
    if (s.pomodoroState === 'idle' || s.pomodoroState === 'paused') {
      if (s.pomodoroState === 'idle') {
        const isNewBlock = lastSessionEndedAtRef.current === 0
          || Date.now() - lastSessionEndedAtRef.current > BLOCK_GAP_MS
        if (s.ritualEnabled && s.pomodoroMode === 'work' && isNewBlock) {
          // Show pre-ritual modal; timer starts only after user confirms
          s.setRitualGoal('')
          s.setRitualMoodBefore(null)
          s.setRitualPhase('pre')
          s.setShowRitualModal(true)
          return
        }
        sessionStartBlinkRef.current = s.blinkCount
        awayStartRef.current = s.totalLookingAwaySeconds
      }
      s.setPomodoroState('work')
      startTimer()
    }
  }, [startTimer])

  const pause = useCallback(() => {
    const s = useStore.getState()
    if (s.pomodoroState === 'work' || s.pomodoroState === 'break') {
      clearTimer()
      s.setPomodoroState('paused')
    }
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    ritualDataRef.current = null
    const s = useStore.getState()
    s.setPomodoroState('idle')
    s.setPomodoroMode('work')
    s.setTimeLeft(s.workDuration)
  }, [clearTimer])

  const skip = useCallback(() => {
    clearTimer()
    const s = useStore.getState()
    if (s.pomodoroMode === 'work') {
      const elapsed = s.workDuration - s.timeLeft
      if (elapsed > 60) {
        const cv = s.blinkVariability
        const rd = ritualDataRef.current
        const sessionData = {
          date: new Date().toISOString(),
          duration: elapsed,
          blinkCount: s.blinkCount - sessionStartBlinkRef.current,
          blinkRate: s.blinkRate,
          blinkVariability: cv,
          focusScore: computeFocusScore(s.blinkRate, cv),
          awaySeconds: s.totalLookingAwaySeconds - awayStartRef.current,
          appUsage: { ...s.appUsageFocus },
          ...(rd ? { ritual: true, goal: rd.goal, moodBefore: rd.moodBefore } : {})
        }
        s.addSession(sessionData)
        saveSession(sessionData)
        s.incrementSessions()
        const { streak: newStreak3, lastSessionDate: today3 } = useStore.getState().updateStreak()
        window.api?.data.savePreferences({
          workDuration: s.workDuration,
          shortBreakDuration: s.shortBreakDuration,
          longBreakDuration: s.longBreakDuration,
          eyeAwayThresholdMs: s.eyeAwayThresholdMs,
          notifyOnAutoPause: s.notifyOnAutoPause,
          soundOnAutoPause: s.soundOnAutoPause,
          dailyGoalSeconds: s.dailyGoalSeconds,
          ritualEnabled: s.ritualEnabled,
          focusWallpaperEnabled: false,
          streak: newStreak3,
          lastSessionDate: today3
        }).catch(() => {})
      }
      const nextCount = s.sessionsCompleted + 1
      if (nextCount % 4 === 0) {
        s.setPomodoroMode('long-break')
        s.setTimeLeft(s.longBreakDuration)
      } else {
        s.setPomodoroMode('short-break')
        s.setTimeLeft(s.shortBreakDuration)
      }
    } else {
      s.setPomodoroMode('work')
      s.setTimeLeft(s.workDuration)
      sessionStartBlinkRef.current = s.blinkCount
    }
    s.setPomodoroState('idle')
  }, [clearTimer])

  // External pause/resume trigger (from eye tracker via pomodoroState changes)
  useEffect(() => {
    if (pomodoroState === 'paused' && intervalRef.current) {
      clearTimer()
    }
    if (pomodoroState === 'work' && !intervalRef.current) {
      startTimer()
    }
  }, [pomodoroState, clearTimer, startTimer])

  useEffect(() => clearTimer, [clearTimer])

  return { start, pause, reset, skip, confirmPreRitual, confirmPostRitual }
}
