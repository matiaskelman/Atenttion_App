export const createEyeTrackerSlice = (set) => ({
  eyeTrackingActive: false,
  eyeStatus: 'unknown', // 'looking' | 'away' | 'blinking' | 'not-tracking' | 'unknown'
  blinkCount: 0,
  blinkRate: 0,           // blinks per minute (last 60s window)
  blinkVariability: null, // CV of inter-blink intervals — null until 3+ blinks recorded
  liveFocusScore: null,   // 0-100, updated on every blink while tracking
  lookingAwaySeconds: 0,
  totalLookingAwaySeconds: 0,
  modelLoaded: false,
  modelLoading: false,
  camError: null,
  modelError: null,
  liveEar: null,
  earThreshold: null,
  calibrationProgress: 0,
  calibrationSampleCount: 0,
  liveYaw: null,
  livePitch: null,
  liveJawOpen: null,
  liveGaze: null,      // iris vertical position vs eye-corner line, ÷ eyeSpan — higher = eyes cast lower
  phoneScorePct: 0,    // phone-detection accumulator as % of trigger threshold
  lastRecalAt: null,   // timestamp of last successful background recalibration
  setEyeTrackingActive: (v) => set({ eyeTrackingActive: v }),
  setEyeStatus: (s) => set({ eyeStatus: s }),
  setBlinkCount: (c) => set({ blinkCount: c }),
  setBlinkRate: (r) => set({ blinkRate: r }),
  setBlinkVariability: (v) => set({ blinkVariability: v }),
  setLiveFocusScore: (v) => set({ liveFocusScore: v }),
  setLookingAwaySeconds: (d) => set({ lookingAwaySeconds: d }),
  addLookingAway: (d) => set((s) => ({ totalLookingAwaySeconds: s.totalLookingAwaySeconds + d })),
  setModelLoaded: (v) => set({ modelLoaded: v }),
  setModelLoading: (v) => set({ modelLoading: v }),
  setModelError: (e) => set({ modelError: e }),
  setCamError: (e) => set({ camError: e }),
  setLiveEar: (v) => set({ liveEar: v }),
  setEarThreshold: (v) => set({ earThreshold: v }),
  setCalibrationProgress: (v) => set({ calibrationProgress: v }),
  setCalibrationSampleCount: (v) => set({ calibrationSampleCount: v }),
  setLiveYaw: (v) => set({ liveYaw: v }),
  setLivePitch: (v) => set({ livePitch: v }),
  setLiveJawOpen: (v) => set({ liveJawOpen: v }),
  setLiveGaze: (v) => set({ liveGaze: v }),
  setPhoneScorePct: (v) => set({ phoneScorePct: v }),
  setLastRecalAt: (v) => set({ lastRecalAt: v })
})
