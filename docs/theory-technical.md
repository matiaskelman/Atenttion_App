# Eye Tracking — Technical Reference

Developer reference for the blink detection, adaptive calibration, and focus scoring implemented in `useEyeTracker.js`, `focusScore.js`, and `blinksConfig.js`.

---

## 1. System Overview

The tracker runs entirely in the renderer process. No native modules or server calls are involved.

**Camera pipeline**

```
getUserMedia({ video: true })
  → hidden <video> element (videoRef)
  → MediaPipe FaceLandmarker.detectForVideo(video, Date.now())  [synchronous]
  → 478 normalised landmarks  (x, y, z in [0, 1])
```

**Loop timing** — `setTimeout`-based at 33 ms intervals (~30 fps). `requestAnimationFrame` is intentionally avoided: RAF fires only when the tab is visible and compositor-synced. `setTimeout` continues in the background so blink counting is not suspended when the window loses focus.

**MediaPipe model** — `FaceLandmarker` with `runningMode: 'VIDEO'`, `numFaces: 1`, minimum confidence 0.5 on detection, presence, and tracking. WASM runtime and model asset paths are resolved at import time:

| Environment | WASM path | Model path |
|---|---|---|
| Dev (Vite) | `/models/mediapipe` | `/models/face_landmarker.task` |
| Production | `models://root/mediapipe` | `models://root/face_landmarker.task` |

The `models://` scheme is a custom Electron `protocol` handler registered in `src/main/index.js` before `app.whenReady()`. It serves files from `out/renderer/models/` so the production build does not rely on `file://` paths.

**Module-level singleton** — `landmarkerRef` is declared outside the hook body. This means the FaceLandmarker instance survives React re-renders and hook remounts; the expensive ~1 s model load happens only once per app session.

---

## 2. Eye Aspect Ratio (EAR)

EAR is the core signal. It describes the openness of an eye as a ratio of vertical to horizontal extent, using 6 landmarks per eye.

**Formula**

```
EAR = (|p2 − p6| + |p3 − p5|) / (2 × |p1 − p4|)
```

where `p1…p6` are the 6 eye-contour landmarks in pixel space (landmarks are multiplied by `video.videoWidth` / `video.videoHeight` before computing distances).

**Landmark indices**

| Eye | p1 | p2 | p3 | p4 | p5 | p6 |
|---|---|---|---|---|---|---|
| Left | 362 | 385 | 387 | 263 | 373 | 380 |
| Right | 33 | 160 | 158 | 133 | 153 | 144 |

`p1` and `p4` are the medial and lateral corners (horizontal axis). `p2/p3` and `p5/p6` are the upper and lower lid pairs (vertical axis).

**Typical values**

| State | EAR range |
|---|---|
| Eyes fully open | 0.25 – 0.45 |
| Eyes closing (blink onset) | 0.15 – 0.25 |
| Full blink closure | 0.05 – 0.15 |
| Occlusion / bad frame | < 0.05 or > 0.60 |

Both eyes are computed separately each frame and blended into a single `rawEar` — see the yaw weighting section below.

---

## 3. Signal Pre-Processing Pipeline

Applied in order on every frame where a face is detected.

### 3.1 Per-Eye Yaw Weighting

When the head is turned sideways, the near eye (toward the camera centre) is geometrically foreshortened — its horizontal span compresses, inflating its EAR. A naive 50/50 average would pull the blended EAR upward, masking real blinks.

**Direction detection**

```
noseMidOffset = noseTipX − (leftEyeCX + rightEyeCX) / 2
```

- Positive → nose right of eye midpoint → head turned right → right eye is the near (foreshortened) eye → left eye gets `farWeight`
- Negative → head turned left → right eye gets `farWeight`

`noseTipX`, `leftEyeCX`, and `rightEyeCX` are the same values already computed for the yaw ratio, so no extra landmark reads are needed.

**Weight interpolation**

```
yawRatio = |noseTipX − eyeMidX| / eyeSpan

farWeight = yawRatio < 0.20  ? 0.50
          : min(0.80, 0.50 + (yawRatio − 0.20) / (YAW_THRESHOLD − 0.20) × 0.30)

nearWeight = 1 − farWeight
```

At `yawRatio = 0.20` both eyes get equal weight (50/50). At `yawRatio = YAW_THRESHOLD (0.55)` the far eye gets 80% weight. Beyond `YAW_THRESHOLD` the pose guard suppresses detection entirely.

### 3.2 Spike Clamp

Single-frame EAR spikes — caused by hand occlusion, motion blur, or landmark jitter — can corrupt the 3-frame smoothing buffer.

```
bufferMean = mean(earBufferRef)     // mean of the previous ≤3 frames
clampedEar = clamp(rawEar, bufferMean − EAR_SPIKE_LIMIT, bufferMean + EAR_SPIKE_LIMIT)
```

`EAR_SPIKE_LIMIT = 0.12`. A legitimate blink drops EAR by ~0.15–0.30 over ~3 frames, so clamping at 0.12 per frame still allows blinks to reach the threshold within 2 frames.

### 3.3 3-Frame Rolling Average

```
earBuffer.push(clampedEar)
if earBuffer.length > EAR_SMOOTH_FRAMES: earBuffer.shift()
ear = mean(earBuffer)
```

`EAR_SMOOTH_FRAMES = 3`. Reduces per-frame noise while introducing only ~66 ms of lag (2 frames at 30 fps) — imperceptible for blink detection.

The buffer is **reset on every confirmed blink** (`earBufferRef.current = []`). This ensures the next blink evaluation starts from a fresh baseline rather than inheriting values from the previous closure.

---

## 4. Head Pose Guard

Blink detection is suspended when head pose or jaw state is unreliable. Four independent conditions are checked each frame:

| Condition | Signal | Threshold |
|---|---|---|
| Yaw (horizontal rotation) | `\|noseTipX − eyeMidX\| / eyeSpan` | > `YAW_THRESHOLD` = 0.55 |
| Pitch down | `(noseTipY − midEyeY) / eyeSpan` | < `PITCH_DOWN_MIN` = 0.50 |
| Pitch up | same | > `PITCH_UP_MAX` = 2.50 |
| Jaw open / talking | `\|lm[13].y − lm[14].y\| / eyeSpan` | > `TALK_THRESHOLD` = 0.22 |

`lm[13]` is the upper inner lip, `lm[14]` the lower inner lip. All ratios are normalised by `eyeSpan` (inter-ocular distance) so they are scale-invariant.

**Hysteresis** — a single bad frame is not enough to trigger suppression. `poseGuardFramesRef` increments each consecutive bad frame and decrements (resets to 0) on the first clean frame:

```
if poseViolation:
    poseGuardFrames++
    if poseGuardFrames >= POSE_GUARD_FRAMES (3):
        suppress (status = 'not-tracking')
else:
    poseGuardFrames = 0
    // proceed with blink logic
```

This means a mouth twitch or brief head turn (< 3 frames, ~100 ms) does not interrupt blink counting.

---

## 5. Adaptive Calibration

A fixed EAR threshold fails across users because resting open-eye EAR varies significantly (e.g., 0.28 for deep-set eyes, 0.42 for wide eyes). Calibration runs automatically during the first 10 seconds of tracking.

### 5.1 Phase 1 — Initial Threshold (0–10 s)

Every frame where `ear > CALIBRATION_OPEN_MIN (0.15)` is recorded as an open-eye sample. After `CALIBRATION_WINDOW_MS = 10000` ms, if at least 30 samples were collected:

```
threshold = P75(samples) × EAR_THRESHOLD_RATIO (0.85)
openEyeEMA = P75(samples)
```

The **75th percentile** is used instead of the mean. This is robust to the user blinking a few times during calibration — those low-EAR frames do not drag the estimate down. Multiplying by `EAR_THRESHOLD_RATIO` (0.85) places the threshold 15% below the typical open-eye EAR — close enough to catch the light, partial blinks common at a screen, with the blendshape cross-check rejecting the extra noise.

If fewer than 30 samples are collected (e.g., user looked away for most of the window), the fallback is the static `EAR_THRESHOLD = 0.20`.

### 5.2 Phase 2 — Post-Calibration EMA

After calibration, the threshold continues to track the user's resting EAR using an exponential moving average. This handles head-tilt drift: when someone tilts their head down, eye geometry changes and the open-eye EAR shifts.

**Update guard** — `ear > CALIBRATION_OPEN_MIN (0.15)`. This is an absolute floor (not the adaptive threshold). Using the adaptive threshold as the guard creates a stuck-state bug: if resting EAR drifts below the threshold, every frame triggers `isBlinking`, the `!isBlinking` guard prevents EMA updates, and the threshold can never self-correct. The 0.15 floor excludes fully-closed eyes (EAR < 0.15) while allowing EMA updates even when resting EAR is temporarily below the current threshold.

**Two-speed α**

```
nearEma = ear > openEyeEMA × 0.88      // within 12% of current EMA
stableOpenFrames = nearEma ? stableOpenFrames + 1 : 0

alpha = stableOpenFrames > 30 ? ALPHA_FAST (0.030) : ALPHA_SLOW (0.008)
openEyeEMA = openEyeEMA × (1 − alpha) + ear × alpha
```

| Mode | Alpha | Approx. half-life |
|---|---|---|
| ALPHA_SLOW | 0.016 | ~43 frames, 1.4 s |
| ALPHA_FAST | 0.060 | ~11 frames, 0.4 s |

`ALPHA_SLOW` is the default — it changes the EMA slowly enough that brief squints and partial blinks do not corrupt the open-eye estimate. `ALPHA_FAST` engages when the eye has been stable for > 30 consecutive frames (~1 s), allowing rapid convergence after a significant head-pose change.

**Threshold update** — every 50 post-calibration frames:

```
adaptiveThreshold = openEyeEMA × EAR_THRESHOLD_RATIO (0.85)
```

---

## 6. Blink State Machine

After the signal pipeline and calibration, the blink detector is a simple two-state machine with hysteresis.

```
States: OPEN | CLOSING | BLINKING
```

**Transition OPEN → CLOSING / BLINKING**

```
if ear < adaptiveThreshold:
    blinkFrames++
    if blinkFrames == BLINK_MIN_FRAMES (2):
        isBlinking = true
        eyeStatus = 'blinking'
```

**Transition BLINKING → OPEN (rising edge = confirmed blink)**

```
openThreshold = adaptiveThreshold + EAR_HYSTERESIS (0.02)

if ear >= openThreshold:
    blendOk = blendBlink === null OR maxBlendDuringClosure >= BLEND_BLINK_MIN (0.15)
    if isBlinking && blinkFrames <= BLINK_MAX_FRAMES (15) && blendOk:
        COUNT BLINK
        record closure duration = now − blinkOnsetAt   // feeds fatigue (mean closure)
        earBuffer = []          // reset smoothing buffer
    blinkFrames = 0
    isBlinking = false
    eyeStatus = 'looking'
```

**Blendshape cross-check** — `FaceLandmarker` is created with `outputFaceBlendshapes: true`,
exposing trained `eyeBlinkLeft` / `eyeBlinkRight` (0 = open, 1 = closed). During a closure the
peak mean blink blendshape is tracked; a blink is only counted if that peak cleared
`BLEND_BLINK_MIN`. This rejects EAR false positives (jitter, partial occlusion, lighting) that
the geometric ratio alone would miscount. If blendshapes are unavailable (`blendBlink === null`),
the gate is skipped — pure-EAR fallback, no behaviour change.

**Blink duration** — closure onset is timestamped when EAR first drops below threshold; at the
rising edge the duration is recorded. The session mean feeds the fatigue factor (long, slow
closures indicate drowsiness).

**Dead zone** — when `adaptiveThreshold ≤ ear < openThreshold` (a 0.02 EAR band), neither the closing nor the opening branch fires. This prevents rapid oscillation at the threshold boundary when EAR is noisy.

**BLINK_MAX_FRAMES = 15** — corresponds to ~500 ms at 30 fps. Closures longer than this are classified as deliberate squints, prolonged rubbing, or micro-sleeps and are not counted as blinks.

---

## 7. Blink Rate and Variability

### 7.1 Blink Rate (BPM)

A timestamp is pushed to `blinkTimesRef` on every confirmed blink. The rate is computed by
`recomputeRate(now)`:

```
blinkTimesRef = blinkTimesRef.filter(t => now − t < 60000)   // keep last 60 s
elapsed = now − trackingStartTime
denominator = clamp(elapsed, 20000, 60000)                   // ms
liveBPM = round(blinkTimesRef.length × 60000 / denominator)
```

**Decay (important):** `recomputeRate` runs both on each confirmed blink **and on a ~1 s loop
tick** (`RATE_RECOMPUTE_MS`). Previously BPM and the live score were only recomputed *on a blink*,
so when blinking slowed or stopped (deep focus / blink suppression) they froze at the last value —
hiding the very state the app cares about and letting the time-weighted cognitive accumulator
compound a stale score. Recomputing on the loop makes the rate fall as old timestamps age out.

Clamping the denominator to a minimum of 20 s prevents wild BPM spikes in the first few seconds.

### 7.2 Blink Variability (CV)

Inter-blink intervals are computed between consecutive blinks and stored in `blinkIntervalsRef` (ring buffer, max 20 entries). Intervals > 30 s are excluded (they represent away-from-camera gaps, not natural rhythm variation).

```
mean = average(blinkIntervalsRef)
std  = sqrt(mean of (interval − mean)²)
CV   = std / mean
```

At least `CV_MIN_INTERVALS` (6) intervals are required before CV is reported and allowed to
influence the score — a CV from 2–3 samples is statistically meaningless yet it carries 45 % of
the live estimate. CV is dimensionless — it normalises rhythm irregularity to rate, so a slow
blinker and a fast blinker with the same degree of rhythm irregularity get the same CV.

| CV | Rhythm label | Interpretation |
|---|---|---|
| < 0.40 | Regular | Consistent, focused |
| 0.40 – 0.70 | Variable | Some attentional fluctuation |
| ≥ 0.70 | Irregular | Erratic — distracted or fatigued |

---

## 8. Focus Score

Computed via `computeFocusScore(bpm, cv, baselineBpm)` in `src/renderer/src/utils/focusScore.js`.
See `docs/blinksInfo.md` for the honesty framing — the score is an **estimate**, and the rate axis
is **personalized** (relative to the user's own learned baseline) whenever one is available.

### 8.1 Rate Score

**Primary (personalized).** Once `baselineBpmConfidence ≥ BASELINE_MIN_CONF (2)`, the rate score is
a function of `r = bpm / baselineBpm` via `computeRelativeRateScore` (piecewise-linear over
`REL_RATE_CURVE`): `r ≈ 1` → 100, `r ≪ 1` → high-but-tapered (deep focus, mild strain), `r ≫ 1` →
low (above the user's own norm → tiring / drifting). The baseline is learned per-user in
`usePomodoro` (EMA of `blinks ÷ on-task minutes` across qualifying sessions) and persisted to
`atenttion-preferences.json`.

**Fallback (new users).** Before a confident baseline exists, the absolute `BPM_BRACKETS` are used,
linearly interpolated within the matched bracket:

```
rateScore = round(scoreAtMin + (bpm − min) / (max − min) × (scoreAtMax − scoreAtMin))
```

| Bracket | BPM range | scoreAtMin | scoreAtMax |
|---|---|---|---|
| A | 0 – 5 | 45 | 45 |
| B | 6 – 11 | 70 | 85 |
| C | 12 – 25 | 100 | 100 |
| D | 26 – 45 | 65 | 45 |
| E | 46 – 65 | 40 | 20 |
| F | 66+ | 10 | 10 |

These brackets are heuristic, not validated science — see the honesty statement in `blinksInfo.md`.

### 8.2 Rhythm Score

```
if CV < 0.40:      rhythmScore = 100
elif CV < 0.70:    rhythmScore = round(100 − (CV − 0.40) / 0.30 × 50)   // 100 → 50
else:              rhythmScore = max(0, round(50 − (CV − 0.70) / 0.30 × 50))  // 50 → 0
```

### 8.3 Weighted Blend

```
focusScore = round(rateScore × 0.55 + rhythmScore × 0.45)
```

The 55/45 weighting gives blink rate slightly more influence than rhythm. If CV is not yet available (< 6 intervals), `focusScore = rateScore` (unweighted).

### 8.4 Session score + fatigue

The saved per-session number (`computeSessionScore`) is the time-weighted average of the live
estimate over on-screen frames, scaled by behavioural penalties **and a fatigue factor**:

```
finalScore = cognitiveAvg × presenceFactor × phoneFactor × driftFactor × fatigueFactor
fatigueFactor = 1 − min(perclosPen + closurePen, FATIGUE_CAP = 0.25)
```

`perclosPen` rises once session **PERCLOS** (eyes-closed fraction over valid frames) exceeds
`PERCLOS_FLOOR (0.12)`; `closurePen` rises once **mean blink-closure duration** exceeds
`CLOSURE_FLOOR_MS (350)`. PERCLOS/closure are accumulated in the eye-tracker slice and diffed at
session boundaries (same snapshot pattern as the cognitive accumulator). These are the validated
drowsiness markers, so real fatigue lowers the score even when blink rate looks normal.

---

## 9. Constants Reference

| Constant | Value | Rationale |
|---|---|---|
| `EAR_THRESHOLD` | 0.20 | Fallback static threshold before calibration |
| `BLINK_MIN_FRAMES` | 2 | Minimum consecutive sub-threshold frames to confirm blink onset (~66 ms) |
| `BLINK_MAX_FRAMES` | 15 | Maximum closure frames counted as a blink (~500 ms); longer = squint/micro-sleep |
| `YAW_THRESHOLD` | 0.55 | Maximum yaw ratio before blink detection is suppressed |
| `PITCH_DOWN_MIN` | 0.50 | Minimum pitch ratio (looking too far down) |
| `PITCH_UP_MAX` | 2.50 | Maximum pitch ratio (looking too far up) |
| `EAR_SMOOTH_FRAMES` | 3 | Rolling average window size |
| `CALIBRATION_WINDOW_MS` | 10000 | Duration of Phase 1 calibration (ms) |
| `CALIBRATION_OPEN_MIN` | 0.15 | Absolute EAR floor for EMA updates — excludes fully-closed eyes |
| `EAR_HYSTERESIS` | 0.02 | Dead zone above threshold to prevent oscillation on the rising edge |
| `EAR_SPIKE_LIMIT` | 0.12 | Max frame-to-frame EAR delta before clamping |
| `EAR_VALID_MIN` | 0.05 | Below this = bad frame (occlusion) |
| `EAR_VALID_MAX` | 0.60 | Above this = bad frame |
| `TALK_THRESHOLD` | 0.22 | Jaw-open ratio above which blink detection is suppressed |
| `POSE_GUARD_FRAMES` | 3 | Consecutive bad-pose frames required before suppression fires |
| `ALPHA_SLOW` | 0.016 | EMA rate during normal tracking |
| `ALPHA_FAST` | 0.060 | EMA rate when eye is stably open / head-down adaptation |
| `EAR_THRESHOLD_RATIO` | 0.85 | Adaptive threshold = restingEAR × this (closer to resting catches lighter blinks) |
| `BLEND_BLINK_MIN` | 0.15 | Trained blink blendshape must peak above this for a blink to count (low → only rejects gross non-blinks) |
| `RATE_RECOMPUTE_MS` | 1000 | Loop cadence for recomputing BPM/score (rate decay) |
| `AWAY_PAUSE_GRACE_MS` | 4000 | Extra sustained absence beyond the away threshold before auto-pause |
| `PHONE_STATIONARY_MAX` | 0.025 | Max down-gaze spread (÷ eyeSpan) to treat as a phone (vs scanning notes) |
| `PERCLOS_EMA_ALPHA` | 0.003 | EMA for the live PERCLOS readout (~30 s window) |
| `CV_MIN_INTERVALS` | 6 | Inter-blink intervals required before CV influences the score |
| `BASELINE_MIN_CONF` | 2 | Qualifying sessions before personalized (relative) scoring engages |
| `BASELINE_ALPHA` | 0.25 | EMA weight folding a session's mean BPM into the personal baseline |

---

## 10. Away Detection and Auto-Pause

When `landmarker.detectForVideo` returns no face landmarks:

```
awayStartRef = awayStartRef ?? Date.now()
awayMs = Date.now() − awayStartRef
eyeStatus = awayMs > eyeAwayThresholdMs ? 'away' : (unchanged)
```

`eyeAwayThresholdMs` is a user preference (default 5000 ms, persisted to
`atenttion-preferences.json`).

**Status vs. pause are now separated** (reduces over-pausing on think-glances): `eyeStatus`
flips to `'away'` at the threshold so the user gets feedback, but an **ordinary auto-pause only
fires once absence is sustained past `threshold + AWAY_PAUSE_GRACE_MS (4000)`** — so reaching for
coffee or leaning back to think for a few seconds no longer kills the timer. A face that is
*visible but turned/tilted off-screen* stays `'not-tracking'` (pose-suppressed) and never triggers
an away-pause. Phone-branded pauses (downward-gaze) remain responsive at the threshold.

When the auto-pause fires in `'work'` state, `pomodoroState → 'paused'` and `autoPausedRef = true`.

When the face reappears:

```
awayStartRef = null
if autoPausedRef && pomodoroState === 'paused':
    pomodoroState → 'work'    // resume
    autoPausedRef = false
```

The `autoPausedRef` flag ensures the auto-resume only fires if the pause was triggered by the eye tracker, not by the user manually pausing.
