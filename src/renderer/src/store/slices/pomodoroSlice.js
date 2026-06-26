export const createPomodoroSlice = (set) => ({
  // Preferences
  eyeAwayThresholdMs: 5000,
  notifyOnAutoPause: true,
  soundOnAutoPause: false,
  dailyGoalSeconds: 4 * 3600,
  ritualEnabled: true,
  focusWallpaperEnabled: false,
  autoStartEyeTracking: true,
  overlayEnabled: true,
  baselineBpm: null,          // learned personal engaged blink rate (persisted); null until learned
  baselineBpmConfidence: 0,   // qualifying sessions folded in — relative scoring engages past BASELINE_MIN_CONF
  freeRiderEnabled: false,    // "Free rider" — work session counts UP indefinitely (no countdown / auto-complete)
  setBaselineBpm: (bpm, conf) => set({ baselineBpm: bpm, baselineBpmConfidence: conf }),
  // Toggling Free rider while idle resets the displayed timer: count-up starts at 0, countdown at workDuration.
  setFreeRiderEnabled: (v) => set((s) => ({
    freeRiderEnabled: v,
    ...(s.pomodoroState === 'idle' ? { timeLeft: v ? 0 : s.workDuration } : {})
  })),
  // Setting a work duration implies a timed (non-Free-rider) session.
  setWorkDuration: (v) => set({ workDuration: v, freeRiderEnabled: false, timeLeft: v }),
  // The long break can never be shorter than the short break: raising the short break drags the
  // long break up with it, and the long break clamps to at least the short break.
  setShortBreakDuration: (v) => set((s) => ({ shortBreakDuration: v, longBreakDuration: Math.max(s.longBreakDuration, v) })),
  setLongBreakDuration: (v) => set((s) => ({ longBreakDuration: Math.max(v, s.shortBreakDuration) })),
  setEyeAwayThreshold: (v) => set({ eyeAwayThresholdMs: v }),
  setNotifyOnAutoPause: (v) => set({ notifyOnAutoPause: v }),
  setSoundOnAutoPause: (v) => set({ soundOnAutoPause: v }),
  setDailyGoalSeconds: (v) => set({ dailyGoalSeconds: v }),
  setRitualEnabled: (v) => set({ ritualEnabled: v }),
  setFocusWallpaperEnabled: (v) => set({ focusWallpaperEnabled: v }),
  setAutoStartEyeTracking: (v) => set({ autoStartEyeTracking: v }),
  setOverlayEnabled: (v) => set({ overlayEnabled: v }),
  applyPreferences: (prefs) => set((s) => ({
    workDuration: prefs.workDuration ?? 25 * 60,
    shortBreakDuration: prefs.shortBreakDuration ?? 5 * 60,
    // Long break is always at least the short break (clamp legacy prefs that predate this rule).
    longBreakDuration: Math.max(prefs.longBreakDuration ?? 15 * 60, prefs.shortBreakDuration ?? 5 * 60),
    eyeAwayThresholdMs: prefs.eyeAwayThresholdMs ?? 5000,
    notifyOnAutoPause: prefs.notifyOnAutoPause ?? true,
    soundOnAutoPause: prefs.soundOnAutoPause ?? false,
    dailyGoalSeconds: prefs.dailyGoalSeconds ?? 4 * 3600,
    ritualEnabled: prefs.ritualEnabled ?? true,
    focusWallpaperEnabled: prefs.focusWallpaperEnabled ?? false,
    autoStartEyeTracking: prefs.autoStartEyeTracking ?? true,
    overlayEnabled: prefs.overlayEnabled ?? true,
    baselineBpm: prefs.baselineBpm ?? null,
    baselineBpmConfidence: prefs.baselineBpmConfidence ?? 0,
    freeRiderEnabled: prefs.freeRiderEnabled ?? false,
    streak: prefs.streak ?? 0,
    bestStreak: prefs.bestStreak ?? 0,
    lastSessionDate: prefs.lastSessionDate ?? null,
    featuresUsed: prefs.featuresUsed ?? {},
    tasks: prefs.tasks ?? [],
    tasksCompletedTotal: prefs.tasksCompletedTotal ?? 0,
    tasksCompletedOnTime: prefs.tasksCompletedOnTime ?? 0,
    onboardingCompleted: prefs.onboardingCompleted ?? false,
    ...(s.pomodoroState === 'idle' ? { timeLeft: (prefs.freeRiderEnabled ?? false) ? 0 : (prefs.workDuration ?? 25 * 60) } : {})
  })),

  // Timer
  pomodoroState: 'idle', // 'idle' | 'work' | 'break' | 'paused'
  pomodoroMode: 'work',  // 'work' | 'short-break' | 'long-break'
  timeLeft: 25 * 60,
  workDuration: 25 * 60,
  shortBreakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  sessionsCompleted: 0,
  setPomodoroState: (s) => set({ pomodoroState: s }),
  setPomodoroMode: (m) => set({ pomodoroMode: m }),
  setTimeLeft: (t) => set({ timeLeft: t }),
  incrementSessions: () => set((s) => ({ sessionsCompleted: s.sessionsCompleted + 1 })),

  // Ritual modal
  showRitualModal: false,
  ritualPhase: 'pre', // 'pre' | 'post'
  ritualGoal: '',
  ritualMoodBefore: null,
  // Frozen Focus Score of the just-completed session, shown in the Eye Tracking card while the
  // post-session survey is open so the user sees the result they earned (not the still-moving live
  // score). null at all other times.
  pendingSessionScore: null,
  setShowRitualModal: (v) => set(v
    ? { showRitualModal: true, phoneUseExpected: null, phoneDetected: false }
    : { showRitualModal: false }),
  setRitualPhase: (v) => set({ ritualPhase: v }),
  setPendingSessionScore: (v) => set({ pendingSessionScore: v }),
  setRitualGoal: (v) => set({ ritualGoal: v }),
  setRitualMoodBefore: (v) => set({ ritualMoodBefore: v }),

  // Phone detection
  phoneUseExpected: null, // null = not set, true = will use phone, false = won't use phone
  phoneDetected: false,   // true while a phone-gaze pause is active
  phonePickupsTotal: 0,   // cumulative pickups since app start — sessions snapshot deltas, like totalLookingAwaySeconds
  setPhoneUseExpected: (v) => set({ phoneUseExpected: v }),
  setPhoneDetected: (v) => set({ phoneDetected: v }),
  incrementPhonePickups: () => set((s) => ({ phonePickupsTotal: s.phonePickupsTotal + 1 }))
})
