import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createPomodoroSlice } from './slices/pomodoroSlice'
import { createEyeTrackerSlice } from './slices/eyeTrackerSlice'
import { createSessionSlice } from './slices/sessionSlice'
import { createSystemSlice } from './slices/systemSlice'
import { createAudioSlice } from './slices/audioSlice'
import { createTasksSlice } from './slices/tasksSlice'
import { createOnboardingSlice } from './slices/onboardingSlice'

export const useStore = create(subscribeWithSelector((set, get) => ({
  // Navigation
  page: 'focus',
  setPage: (p) => set({ page: p }),

  // Preferences autosave — timestamp of the last successful write to disk,
  // used by the Settings page to flash passive "Saved" feedback.
  prefsSavedAt: 0,
  markPrefsSaved: () => set({ prefsSavedAt: Date.now() }),

  // Feature-discovery flags (persisted via buildPrefs) — powers the Getting Started
  // checklist for ephemeral actions that aren't otherwise recorded (audio, export).
  featuresUsed: {},
  markFeatureUsed: (name) => {
    const cur = get().featuresUsed || {}
    if (cur[name]) return // no-op if already set, so autosave doesn't re-fire
    set({ featuresUsed: { ...cur, [name]: true } })
  },

  ...createPomodoroSlice(set, get),
  ...createEyeTrackerSlice(set, get),
  ...createSessionSlice(set, get),
  ...createSystemSlice(set, get),
  ...createAudioSlice(set, get),
  ...createTasksSlice(set, get),
  ...createOnboardingSlice(set, get)
})))
