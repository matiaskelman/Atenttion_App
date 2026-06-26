// First-run onboarding state.
//
// `onboardingCompleted` is PERSISTED (hydrated in pomodoroSlice.applyPreferences,
// serialized in utils/prefs.buildPrefs) so the spotlight tour only auto-shows once.
// `showTour` is EPHEMERAL — it gates the OnboardingTour mount and is flipped on
// first launch (App.jsx) or via the "Replay tour" button in Settings.
export const createOnboardingSlice = (set) => ({
  onboardingCompleted: false,
  setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),

  showTour: false,
  setShowTour: (v) => set({ showTour: v })
})
