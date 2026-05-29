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

  ...createPomodoroSlice(set, get),
  ...createEyeTrackerSlice(set, get),
  ...createSessionSlice(set, get),
  ...createSystemSlice(set, get),
  ...createAudioSlice(set, get)
})))
