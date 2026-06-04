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
threshold = P75(samples) × 0.75
openEyeEMA = P75(samples)
```

The **75th percentile** is used instead of the mean. This is robust to the user blinking a few times during calibration — those low-EAR frames do not drag the estimate down. Multiplying by 0.75 places the threshold 25% below the typical open-eye EAR, giving a comfortable margin above the blink-closed range.

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
| ALPHA_SLOW | 0.008 | ~86 frames, 2.8 s |
| ALPHA_FAST | 0.030 | ~23 frames, 0.8 s |

`ALPHA_SLOW` is the default — it changes the EMA slowly enough that brief squints and partial blinks do not corrupt the open-eye estimate. `ALPHA_FAST` engages when the eye has been stable for > 30 consecutive frames (~1 s), allowing rapid convergence after a significant head-pose change.

**Threshold update** — every 50 post-calibration frames:

```
adaptiveThreshold = openEyeEMA × 0.75
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
    if isBlinking && blinkFrames <= BLINK_MAX_FRAMES (15):
        COUNT BLINK
        earBuffer = []          // reset smoothing buffer
    blinkFrames = 0
    isBlinking = false
    eyeStatus = 'looking'
```

**Dead zone** — when `adaptiveThreshold ≤ ear < openThreshold` (a 0.02 EAR band), neither the closing nor the opening branch fires. This prevents rapid oscillation at the threshold boundary when EAR is noisy.

**BLINK_MAX_FRAMES = 15** — corresponds to ~500 ms at 30 fps. Closures longer than this are classified as deliberate squints, prolonged rubbing, or micro-sleeps and are not counted as blinks.

---

## 7. Blink Rate and Variability

### 7.1 Blink Rate (BPM)

A timestamp is pushed to `blinkTimesRef` on every confirmed blink. At the end of each blink:

```
blinkTimesRef = blinkTimesRef.filter(t => now − t < 60000)   // keep last 60 s
elapsed = now − trackingStartTime
denominator = clamp(elapsed, 20000, 60000)                   // ms
liveBPM = round(blinkTimesRef.length × 60000 / denominator)
```

Clamping the denominator to a minimum of 20 s prevents wild BPM spikes in the first few seconds. Before 20 s of data, BPM is reported as if 20 s had elapsed, which under-reports the rate slightly but avoids misleading values (e.g., 3 blinks in 5 s would otherwise show 36 BPM).

### 7.2 Blink Variability (CV)

Inter-blink intervals are computed between consecutive blinks and stored in `blinkIntervalsRef` (ring buffer, max 20 entries). Intervals > 30 s are excluded (they represent away-from-camera gaps, not natural rhythm variation).

```
mean = average(blinkIntervalsRef)
std  = sqrt(mean of (interval − mean)²)
CV   = std / mean
```

At least 3 intervals are required before CV is reported. CV is dimensionless — it normalises rhythm irregularity to rate, so a slow blinker and a fast blinker with the same degree of rhythm irregularity get the same CV.

| CV | Rhythm label | Interpretation |
|---|---|---|
| < 0.40 | Regular | Consistent, focused |
| 0.40 – 0.70 | Variable | Some attentional fluctuation |
| ≥ 0.70 | Irregular | Erratic — distracted or fatigued |

---

## 8. Focus Score

Computed on every confirmed blink via `computeFocusScore(bpm, cv)` in `src/renderer/src/utils/focusScore.js`.

### 8.1 Rate Score

The current BPM is looked up in `BPM_BRACKETS` (`src/renderer/src/constants/blinksConfig.js`). Each bracket defines `scoreAtMin` and `scoreAtMax`; the rate score is linearly interpolated across the bracket's BPM range:

```
rateScore = round(scoreAtMin + (bpm − min) / (max − min) × (scoreAtMax − scoreAtMin))
```

Brackets with flat scores (A and F) have `scoreAtMin == scoreAtMax`.

| Bracket | BPM range | scoreAtMin | scoreAtMax |
|---|---|---|---|
| A | 0 – 5 | 45 | 45 |
| B | 6 – 11 | 70 | 85 |
| C | 12 – 25 | 100 | 100 |
| D | 26 – 45 | 65 | 45 |
| E | 46 – 65 | 40 | 20 |
| F | 66+ | 10 | 10 |

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

The 55/45 weighting gives blink rate slightly more influence than rhythm. If CV is not yet available (< 3 intervals), `focusScore = rateScore` (unweighted).

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
| `ALPHA_SLOW` | 0.008 | EMA rate during normal tracking (~2.8 s half-life) |
| `ALPHA_FAST` | 0.030 | EMA rate when eye is stably open for > 30 frames (~0.8 s half-life) |

---

## 10. Away Detection and Auto-Pause

When `landmarker.detectForVideo` returns no face landmarks:

```
awayStartRef = awayStartRef ?? Date.now()
awayMs = Date.now() − awayStartRef
eyeStatus = awayMs > eyeAwayThresholdMs ? 'away' : (unchanged)
```

`eyeAwayThresholdMs` is a user preference (default 3000 ms, persisted to `atenttion-preferences.md`).

When the threshold is exceeded and the Pomodoro is in `'work'` state, the timer is automatically paused (`pomodoroState → 'paused'`) and `autoPausedRef = true` is set.

When the face reappears:

```
awayStartRef = null
if autoPausedRef && pomodoroState === 'paused':
    pomodoroState → 'work'    // resume
    autoPausedRef = false
```

The `autoPausedRef` flag ensures the auto-resume only fires if the pause was triggered by the eye tracker, not by the user manually pausing.
