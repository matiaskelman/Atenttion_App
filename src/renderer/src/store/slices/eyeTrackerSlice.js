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
  inputIdleMs: null,   // ms since last system-wide keyboard/mouse input (debug; null until first poll)
  lastRecalAt: null,   // timestamp of last successful background recalibration
  livePerclos: null,   // live PERCLOS (% time eyes closed, rolling) — fatigue marker; null until tracking
  liveBlinkDurMs: null,// live mean blink-closure duration in ms — fatigue marker
  // Session Focus Score accumulators — cumulative since tracking start. usePomodoro snapshots
  // these at session start and diffs at session end (same pattern as blinkCount). DO NOT select
  // these in a component — they update ~30×/s; read only via getState() at session boundaries.
  cogScoreWeightedSum: 0,  // Σ liveFocusScore × dt(ms) over on-screen frames
  cogScorePresentMs: 0,    // Σ dt(ms) over on-screen frames that had a valid live score
  cogScoreSamples: [],     // bounded trend buffer of { t, v } cognitive-score samples (for drift)
  // Fatigue accumulators (cumulative since tracking start; snapshot/diff at session boundaries).
  eyeClosedMs: 0,          // Σ dt(ms) over valid frames where the eye was below the blink threshold
  eyeValidMs: 0,           // Σ dt(ms) over valid (non-suppressed) frames → PERCLOS = closed / valid
  blinkDurSumMs: 0,        // Σ blink-closure durations (ms) for confirmed blinks
  blinkDurCount: 0,        // count of confirmed blinks with a recorded closure duration
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
  setInputIdleMs: (v) => set({ inputIdleMs: v }),
  setLastRecalAt: (v) => set({ lastRecalAt: v }),
  setLivePerclos: (v) => set({ livePerclos: v }),
  setLiveBlinkDurMs: (v) => set({ liveBlinkDurMs: v }),
  addCogScore: (score, dt) => set((s) => ({
    cogScoreWeightedSum: s.cogScoreWeightedSum + score * dt,
    cogScorePresentMs: s.cogScorePresentMs + dt
  })),
  pushCogScoreSample: (v) => set((s) => ({
    cogScoreSamples: [...s.cogScoreSamples.slice(-119), { t: Date.now(), v }]
  })),
  // Fatigue accumulators: validMs is added on every valid frame; closedMs only when the eye
  // was below the blink threshold that frame. Blink durations accumulate on each confirmed blink.
  addFatigueFrame: (closed, dt) => set((s) => ({
    eyeValidMs: s.eyeValidMs + dt,
    eyeClosedMs: s.eyeClosedMs + (closed ? dt : 0)
  })),
  addBlinkDuration: (ms) => set((s) => ({
    blinkDurSumMs: s.blinkDurSumMs + ms,
    blinkDurCount: s.blinkDurCount + 1
  })),
  resetScoreAccum: () => set({
    cogScoreWeightedSum: 0, cogScorePresentMs: 0, cogScoreSamples: [],
    eyeClosedMs: 0, eyeValidMs: 0, blinkDurSumMs: 0, blinkDurCount: 0
  })
})
