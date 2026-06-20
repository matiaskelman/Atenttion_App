# Blink Feedback & Focus Scoring — Specification

> **Source of truth for feedback logic.**
> `src/renderer/src/constants/blinksConfig.js` (`BPM_BRACKETS`, `REL_RATE_CURVE`,
> `getRelativeState`, `SCORE_CONFIG`), `src/renderer/src/components/EyeTracker.jsx`
> (live label), and `src/renderer/src/utils/focusScore.js` (`computeFocusScore` +
> `computeSessionScore`) are derived directly from this document. If you change a
> boundary, curve point, label, or weight here, update those files to match.

---

## 0. Honesty Statement (read first)

Blink rate is a **weak, indirect** proxy for attention, and this app treats it as an
**estimate, not a measurement.** The scientifically defensible facts we rely on are
narrow:

- **Within one person**, spontaneous blink rate **drops during intent visual work**
  (reading, close screen tasks) and tends to **rise with fatigue / mind-wandering.**
  This within-subject relationship is real and replicated.
- **PERCLOS** (the fraction of time the eyes are closed) and **long, slow blink
  closures** are **validated drowsiness markers** (driving-safety research).

What is **not** scientifically solid — and is therefore deliberately downplayed in the
UI — is mapping an **absolute** blink-rate number to a precise cognitive/neuro state.
Resting blink rate varies enormously between people and conditions (dry eyes, contact
lenses, lighting, screen distance, humidity, caffeine, time of day). Earlier versions of
this document asserted dopamine / Default-Mode-Network states per BPM band as fact; those
claims were **removed** because they aren't supportable. We keep the bracket *shape* only
as a rough fallback for brand-new users, and switch to **personalized, baseline-relative**
scoring as soon as we've learned the individual's own norm.

**Rule of thumb for copy:** describe what the user is doing relative to their own usual
("blinking more than your usual — may be tiring"), never assert an internal brain
mechanism as fact.

---

## 1. Personalized baseline (primary path)

Once the app has observed a few of the user's sessions it learns their **engaged baseline
blink rate** and scores the *deviation* from it. This is the defensible core of the system.

**Learning** (`usePomodoro.js`, on each qualifying completed session):

```
sessionMeanBpm = blinkCount / (onTaskSeconds / 60)      // on-task time excludes away/phone pauses
baselineBpm    = baselineBpm·(1 − α) + sessionMeanBpm·α  // EMA, α = BASELINE_ALPHA = 0.25
baselineBpmConfidence += 1
```

Qualifying session: `duration ≥ 120 s`, `blinkCount ≥ 8`, and `3 ≤ sessionMeanBpm ≤ 60`
(implausible rates are ignored). `baselineBpm` + `baselineBpmConfidence` persist in
`atenttion-preferences.json`.

**Relative rate score** (`computeRelativeRateScore`), once
`baselineBpmConfidence ≥ BASELINE_MIN_CONF (2)`. Let `r = currentBPM / baselineBpm`:

| r (current ÷ your baseline) | Meaning | Score |
|---|---|---|
| ≤ 0.4 | Eyes very quiet — deep visual focus, slight strain risk | 60 |
| 0.7 | A bit quieter than usual — strong focus | 100 |
| 0.7 – 1.3 | Around your own engaged norm — ideal | 100 |
| 1.8 | Busier than usual — friction / early tiring | 72 |
| 2.6 | Well above usual — likely drifting / fatigued | 35 |
| ≥ 4.0 | Far above usual | 15 |

(Piecewise-linear between the points above — see `REL_RATE_CURVE`.)

**Live state label** (`getRelativeState`, shown in `EyeTracker.jsx`):

| r | Label | Nudge |
|---|---|---|
| < 0.5 | Quiet eyes | "Blinking well below your usual — looks like deep focus. Remember to blink." |
| 0.5 – 1.45 | In your zone | *(silent)* |
| 1.45 – 2.0 | Busier than usual | "Blinking more than your usual — could be friction or early tiring." |
| ≥ 2.0 | Above your usual | "Blinking well above your usual — you may be drifting or tired. Try a short visual reset." |

---

## 2. Fallback BPM brackets (new users only)

Until a personal baseline exists, `computeFocusScore` falls back to these absolute
brackets. They are a **rough first guess**, not a cognitive readout, and the labels are
intentionally behavioural rather than mechanistic.

| Bracket | BPM | Label | scoreAtMin → scoreAtMax | UI color |
|---|---|---|---|---|
| A | 0 – 5 | Hyper-focus / strain risk | 45 | violet |
| B | 6 – 11 | High focus | 70 → 85 | cyan |
| C | 12 – 25 | Cruise focus | 100 | emerald |
| D | 26 – 45 | Task friction | 65 → 45 | amber |
| E | 46 – 65 | Mind drifting | 40 → 20 | orange |
| F | 66+ | Zoning out | 10 | red |

Rate score is linearly interpolated within the bracket. These boundaries are heuristic;
do not present them to users as established science.

---

## 3. Fatigue axis (PERCLOS + closure duration)

These are the **validated** markers, tracked independently of rate.

- **PERCLOS** — fraction of valid frames with the eye below the blink threshold (rolling
  live EMA; session value accumulated for scoring). Normal screen PERCLOS is a few %.
- **Mean blink-closure duration** — closures are counted on reopening, so the duration is
  already known. `< 200 ms` = crisp/alert; `> 400 ms` = slow closure, drowsiness.

They apply a **small, capped** multiplicative penalty to the session score so genuine
tiredness lowers it even when blink *rate* looks fine (see §5).

---

## 4. Blink rhythm (CV) — supporting co-factor

Coefficient of variation of inter-blink intervals. Cross-referenced with rate; **never the
sole signal.**

| CV | Label | Interpretation |
|---|---|---|
| < 0.40 | Regular | Consistent rhythm |
| 0.40 – 0.69 | Variable | Some fluctuation |
| ≥ 0.70 | Irregular | Erratic — distracted or fatigued |

CV is **withheld until ≥ `CV_MIN_INTERVALS` (6) intervals** exist — a CV from 2–3 samples
is statistically meaningless and it carries 45 % of the live score.

---

## 5. Focus Score formula

### 5a. Instantaneous estimate (`computeFocusScore`)

```
live = rateScore × 0.55 + rhythmScore × 0.45
```

`rateScore` is baseline-relative (`computeRelativeRateScore`) when a confident baseline
exists, else from the fallback brackets. `rhythmScore` from CV (only once ≥ 6 intervals;
otherwise `live = rateScore`). Recomputed not only on each blink but on a **~1 s loop tick**
so the rate **decays** when blinking slows (previously it froze, hiding blink suppression).

### 5b. Session Focus Score (`computeSessionScore`)

```
finalScore = cognitiveAvg × presenceFactor × phoneFactor × driftFactor × fatigueFactor

cognitiveAvg   = Σ(live × dt) / Σ(dt)            over on-screen frames with a valid score
presenceFactor = (1 − awayFraction) ^ AWAY_EXP   (AWAY_EXP = 1.5)
phoneFactor    = 1 − min(phonePickups × 0.09, 0.40)
driftFactor    = 1 − min(early→late cognitive decline × DRIFT_WEIGHT, DRIFT_CAP=0.15)
fatigueFactor  = 1 − min(perclosPen + closurePen, FATIGUE_CAP = 0.25)
   perclosPen  = clamp((PERCLOS − 0.12) / 0.12, 0, 1) × 0.15
   closurePen  = clamp((meanClosureMs − 350) / 250, 0, 1) × 0.10
```

### 5c. Confidence

`computeSessionScore` returns `{ score, confidence }`:

| Condition | Result |
|---|---|
| on-screen < `MIN_PRESENT` (60 s) **or** blinks < `MIN_BLINKS` (3) | `score: null` → UI shows **"—"** |
| on-screen < `LOWCONF_PRESENT` (180 s) **or** blinks < `LOWCONF_BLINKS` (8) **or** awayFraction > 0.5 | `confidence: 'low'` → faded **"~score"** |
| otherwise | `confidence: 'high'` |

Low-confidence sessions are excluded from the "Best Focus Hours" aggregate.

> **Derived files — keep in sync:** `src/renderer/src/utils/focusScore.js`,
> `src/renderer/src/constants/blinksConfig.js`, and the live label in
> `src/renderer/src/components/EyeTracker.jsx`.

---

## 6. Real-time feedback rules

Show a nudge only for states that warrant one. With a personal baseline, use the
`getRelativeState` nudges (§1). Without one, the fallback brackets drive it: A (gentle
blink/strain reminder), D / E / F (encouragement → drift → reset nudge); B and C are
silent. Always phrase as behaviour relative to the user, plus the standing disclaimer that
the score is an estimate affected by dry eyes, lighting, and screen distance.
