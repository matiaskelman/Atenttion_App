import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createPomodoroSlice } from './slices/pomodoroSlice'
import { createEyeTrackerSlice } from './slices/eyeTrackerSlice'
import { createSessionSlice } from './slices/sessionSlice'
import { createSystemSlice } from './slices/systemSlice'
import { createAudioSlice } from './slices/audioSlice'

export const useStore = create(subscribeWithSelector((set, get) => ({
  // Navigation
  page: 'focus',
  setPage: (p) => set({ page: p }),

  // Preferences autosave — timestamp of the last successful write to disk,
  // used by the Settings page to flash passive "Saved" feedback.
  prefsSavedAt: 0,
  markPrefsSaved: () => set({ prefsSavedAt: Date.now() }),

  ...createPomodoroSlice(set, get),
  ...createEyeTrackerSlice(set, get),
  ...createSessionSlice(set, get),
  ...createSystemSlice(set, get),
  ...createAudioSlice(set, get)
})))
