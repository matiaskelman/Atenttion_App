export const createPomodoroSlice = (set) => ({
  // Preferences
  eyeAwayThresholdMs: 5000,
  notifyOnAutoPause: true,
  soundOnAutoPause: false,
  dailyGoalSeconds: 4 * 3600,
  ritualEnabled: true,
  focusWallpaperEnabled: false,
  setWorkDuration: (v) => set({ workDuration: v, timeLeft: v }),
  setShortBreakDuration: (v) => set({ shortBreakDuration: v }),
  setLongBreakDuration: (v) => set({ longBreakDuration: v }),
  setEyeAwayThreshold: (v) => set({ eyeAwayThresholdMs: v }),
  setNotifyOnAutoPause: (v) => set({ notifyOnAutoPause: v }),
  setSoundOnAutoPause: (v) => set({ soundOnAutoPause: v }),
  setDailyGoalSeconds: (v) => set({ dailyGoalSeconds: v }),
  setRitualEnabled: (v) => set({ ritualEnabled: v }),
  setFocusWallpaperEnabled: (v) => set({ focusWallpaperEnabled: v }),
  applyPreferences: (prefs) => set((s) => ({
    workDuration: prefs.workDuration ?? 25 * 60,
    shortBreakDuration: prefs.shortBreakDuration ?? 5 * 60,
    longBreakDuration: prefs.longBreakDuration ?? 15 * 60,
    eyeAwayThresholdMs: prefs.eyeAwayThresholdMs ?? 5000,
    notifyOnAutoPause: prefs.notifyOnAutoPause ?? true,
    soundOnAutoPause: prefs.soundOnAutoPause ?? false,
    dailyGoalSeconds: prefs.dailyGoalSeconds ?? 4 * 3600,
    ritualEnabled: prefs.ritualEnabled ?? true,
    focusWallpaperEnabled: prefs.focusWallpaperEnabled ?? false,
    streak: prefs.streak ?? 0,
    lastSessionDate: prefs.lastSessionDate ?? null,
    ...(s.pomodoroState === 'idle' ? { timeLeft: prefs.workDuration ?? 25 * 60 } : {})
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
  setShowRitualModal: (v) => set(v
    ? { showRitualModal: true, phoneUseExpected: null, phoneDetected: false }
    : { showRitualModal: false }),
  setRitualPhase: (v) => set({ ritualPhase: v }),
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
