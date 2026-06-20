// Canonical preferences payload.
//
// Every `savePreferences` call must send the FULL object — a partial save
// silently resets the omitted fields to their defaults on the next load
// (see the `feedback_prefs_completeness` memory note). Building the payload in
// one place means the field set can never drift between the four call sites.
//
// Pass `extra` to override fields the caller has fresher values for (e.g. the
// streak fields returned by `updateStreak()`, which the captured store snapshot
// won't yet reflect).
export const buildPrefs = (s, extra = {}) => ({
  workDuration: s.workDuration,
  shortBreakDuration: s.shortBreakDuration,
  longBreakDuration: s.longBreakDuration,
  eyeAwayThresholdMs: s.eyeAwayThresholdMs,
  notifyOnAutoPause: s.notifyOnAutoPause,
  soundOnAutoPause: s.soundOnAutoPause,
  dailyGoalSeconds: s.dailyGoalSeconds,
  ritualEnabled: s.ritualEnabled,
  focusWallpaperEnabled: s.focusWallpaperEnabled,
  autoStartEyeTracking: s.autoStartEyeTracking,
  overlayEnabled: s.overlayEnabled,
  baselineBpm: s.baselineBpm,
  baselineBpmConfidence: s.baselineBpmConfidence,
  streak: s.streak,
  bestStreak: s.bestStreak,
  lastSessionDate: s.lastSessionDate,
  ...extra,
})
