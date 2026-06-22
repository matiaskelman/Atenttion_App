import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { computeSessionScore } from '../utils/focusScore'
import { SCORE_CONFIG } from '../constants/blinksConfig'
import { buildPrefs } from '../utils/prefs'
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
  const phonePickupsStartRef = useRef(0)
  const scoreAccumStartRef = useRef({ weightedSum: 0, presentMs: 0, sampleIndex: 0 })
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

  // Snapshot the running counters at the start of a work session; deltas at completion give
  // per-session values. Call at EVERY work-session start — missing one corrupts that session's score.
  const snapshotSessionStart = (s) => {
    sessionStartBlinkRef.current = s.blinkCount
    awayStartRef.current = s.totalLookingAwaySeconds
    phonePickupsStartRef.current = s.phonePickupsTotal
    scoreAccumStartRef.current = {
      weightedSum: s.cogScoreWeightedSum,
      presentMs: s.cogScorePresentMs,
      sampleIndex: s.cogScoreSamples.length,
      eyeClosedMs: s.eyeClosedMs,
      eyeValidMs: s.eyeValidMs,
      blinkDurSumMs: s.blinkDurSumMs,
      blinkDurCount: s.blinkDurCount
    }
  }

  // Build { focusScore, scoreConfidence } for a completed work session from the accumulator deltas.
  const buildSessionScore = (s, duration, blinkCount, awaySeconds, phonePickups) => {
    const start = scoreAccumStartRef.current
    const presentMs = Math.max(0, s.cogScorePresentMs - start.presentMs)
    const cognitiveAvg = presentMs > 0 ? (s.cogScoreWeightedSum - start.weightedSum) / presentMs : null
    const cogSamples = s.cogScoreSamples.slice(start.sampleIndex).map((x) => x.v)
    // Fatigue inputs from the session's PERCLOS + mean blink-closure accumulators (deltas).
    const validMs = Math.max(0, s.eyeValidMs - start.eyeValidMs)
    const closedMs = Math.max(0, s.eyeClosedMs - start.eyeClosedMs)
    const perclos = validMs > 0 ? closedMs / validMs : 0
    const durCount = Math.max(0, s.blinkDurCount - start.blinkDurCount)
    const durSum = Math.max(0, s.blinkDurSumMs - start.blinkDurSumMs)
    const meanClosureMs = durCount > 0 ? durSum / durCount : 0
    const { score, confidence } = computeSessionScore({
      cognitiveAvg, cogSamples, awaySeconds, phonePickups,
      duration, presentSeconds: presentMs / 1000, blinkCount, perclos, meanClosureMs
    })
    return { focusScore: score, scoreConfidence: confidence }
  }

  // Learn the user's own engaged blink baseline from a completed session and persist it (EMA across
  // sessions). The session's mean BPM = blinks / on-task minutes (on-task time excludes away/phone
  // pauses, so this approximates "blink rate while focused"). Qualifying sessions only; implausible
  // rates are ignored. Updates the store and returns the prefs override to persist, or null.
  const learnBaseline = (s, duration, blinkCount) => {
    if (duration < 120 || blinkCount < 8) return null
    const sessionMeanBpm = blinkCount / (duration / 60)
    if (sessionMeanBpm < 3 || sessionMeanBpm > 60) return null
    const prev = s.baselineBpm
    const a = SCORE_CONFIG.BASELINE_ALPHA
    const next = prev == null ? sessionMeanBpm : prev * (1 - a) + sessionMeanBpm * a
    const conf = (s.baselineBpmConfidence || 0) + 1
    const baselineBpm = Math.round(next * 10) / 10
    s.setBaselineBpm(baselineBpm, conf)
    return { baselineBpm, baselineBpmConfidence: conf }
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
          const blinkCount = s.blinkCount - sessionStartBlinkRef.current
          const awaySeconds = s.totalLookingAwaySeconds - awayStartRef.current
          const phonePickups = s.phonePickupsTotal - phonePickupsStartRef.current
          const { focusScore, scoreConfidence } = buildSessionScore(s, s.workDuration, blinkCount, awaySeconds, phonePickups)
          const sessionData = {
            date: new Date().toISOString(),
            duration: s.workDuration,
            blinkCount,
            blinkRate: sessionBPM,
            blinkVariability: cv,
            focusScore,
            scoreConfidence,
            awaySeconds,
            phonePickups,
            dailyGoalSeconds: s.dailyGoalSeconds, // snapshot the goal in effect, so history isn't rescored when it changes
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
            const learned1 = learnBaseline(s, s.workDuration, blinkCount)
            const { streak: newStreak1, bestStreak: newBest1, lastSessionDate: today1 } = useStore.getState().updateStreak()
            window.api?.data.savePreferences(
              buildPrefs(s, { streak: newStreak1, bestStreak: newBest1, lastSessionDate: today1, ...(learned1 || {}) })
            ).catch(() => {})
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
          snapshotSessionStart(s)
          s.setPomodoroState('work')
          setTimeout(() => startTimer(), 50)
        } else {
          // Long break ends — return to idle, let user start manually
          notify('Atenttion', 'Long break over! Ready when you are.')
          s.setPomodoroMode('work')
          s.setTimeLeft(s.workDuration)
          s.setPomodoroState('idle')
          snapshotSessionStart(s)
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
    snapshotSessionStart(s)
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
    const learned2 = learnBaseline(s, finalSession.duration, finalSession.blinkCount)
    const { streak: newStreak2, bestStreak: newBest2, lastSessionDate: today2 } = useStore.getState().updateStreak()
    window.api?.data.savePreferences(
      buildPrefs(s, { streak: newStreak2, bestStreak: newBest2, lastSessionDate: today2, ...(learned2 || {}) })
    ).catch(() => {})
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
        snapshotSessionStart(s)
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
        const blinkCount = s.blinkCount - sessionStartBlinkRef.current
        const awaySeconds = s.totalLookingAwaySeconds - awayStartRef.current
        const phonePickups = s.phonePickupsTotal - phonePickupsStartRef.current
        const { focusScore, scoreConfidence } = buildSessionScore(s, elapsed, blinkCount, awaySeconds, phonePickups)
        const sessionData = {
          date: new Date().toISOString(),
          duration: elapsed,
          blinkCount,
          blinkRate: s.blinkRate,
          blinkVariability: cv,
          focusScore,
          scoreConfidence,
          awaySeconds,
          phonePickups,
          dailyGoalSeconds: s.dailyGoalSeconds, // snapshot the goal in effect, so history isn't rescored when it changes
          appUsage: { ...s.appUsageFocus },
          ...(rd ? { ritual: true, goal: rd.goal, moodBefore: rd.moodBefore } : {})
        }
        s.addSession(sessionData)
        saveSession(sessionData)
        s.incrementSessions()
        const learned3 = learnBaseline(s, elapsed, blinkCount)
        const { streak: newStreak3, bestStreak: newBest3, lastSessionDate: today3 } = useStore.getState().updateStreak()
        window.api?.data.savePreferences(
          buildPrefs(s, { streak: newStreak3, bestStreak: newBest3, lastSessionDate: today3, ...(learned3 || {}) })
        ).catch(() => {})
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
      snapshotSessionStart(s)
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
