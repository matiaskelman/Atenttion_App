# Atenttion — Scientific Theory & Design Logic

This document synthesizes the research that grounds the app's eye-tracking and attention features.
All product decisions in the codebase should trace back to a finding here.

---

## Sources

| ID | Paper | Key Contribution |
|---|---|---|
| **[EMH]** | Wu & Liu (2022). *Refined use of the eye-mind hypothesis for scientific argumentation using multiple representations.* Instructional Science. | Gaze aversion norms, fixation duration as cognitive effort proxy, limits of EMH |
| **[BRV]** | Ballard et al. (2017 / PMC5742176). *Blink rate variability and cognitive performance.* | Blink interval variability (CV) predicts cognitive state; raw blink count alone is insufficient |

---

## Core Findings

### 1. Blink Rate — Healthy Ranges

**Source: [BRV]**

- Resting baseline: **18.27 ± 10.44 blinks/min**
- During cognitive tasks: **19.14 ± 11.1 blinks/min** (slightly higher, not lower, than rest in the study)
- Screen work reality (corroborated by digital eye strain literature): computer users blink **60–70% less** than their resting rate — commonly dropping to **6–8 BPM**
- Below **8 BPM** during screen work = significant **digital eye strain risk**
- Below **12 BPM** = caution zone

**App implementation:**
- BPM < 8 → "Eye strain risk" warning (red)
- BPM 8–12 → "Low blinks" caution (amber)
- BPM 12–20 → healthy range (green)
- BPM > 20 → normal / slightly elevated (no warning)

---

### 2. Blink Rate Variability (CV) — The Real Signal

**Source: [BRV]**

Raw blink count does NOT reliably differentiate between high and low cognitive performers
(simple blink count r = not significant). What matters is the **temporal variability** of blink intervals.

Key finding:
- The **coefficient of variation (CV)** of inter-blink intervals (std / mean) predicts cognitive state
- During cognitive tasks, blinks become **more regular** (lower CV, lower alpha exponent: 0.80 rest → 0.62 task)
- High cognitive performers: alpha = 0.94 (very regular baseline); low performers: 0.72
- More regular blinks = higher focus / cognitive capacity

**CV interpretation:**
| CV range | Label | Meaning |
|---|---|---|
| < 0.40 | Regular | High focus state — consistent blink pattern |
| 0.40–0.70 | Variable | Moderate — some attentional fluctuation |
| > 0.70 | Irregular | Distracted or fatigued — erratic blink pattern |

**App implementation:**
- Compute CV from the last 20 inter-blink intervals
- Display as "Blink Rhythm" indicator with three states
- Save CV per session as `blinkVariability`
- Contribute to session focus quality score

---

### 3. Gaze Aversion Is Normal During Focused Work

**Source: [EMH]**

A critical finding from Wu & Liu (2022): in their study of cognitively engaged students,
**~37% of response time was spent NOT looking at the screen** (gaze aversion = RT − TFD),
even while actively performing argumentation tasks.

> "All participants lingered somewhat on blank areas (approximately 40% of the response time),
> particularly when dealing with tasks requiring a wider scope of interpretation."

This means: **looking away ≠ being distracted.** Brief gaze aversion often accompanies:
- Retrieving information from long-term memory
- Mental calculation
- Planning a response

**App implementation:**
- Default away threshold: **5 seconds** (not 3 — research shows frequent brief look-aways are normal)
- The "away" label can be softened; a 1–4 second look-away does not warrant auto-pause
- Auto-pause should only trigger after sustained absence (> 5s default, user-configurable 1–10s)

---

### 4. The Eye-Mind Hypothesis Has Limits

**Source: [EMH]**

The EMH (Just & Carpenter, 1980) assumes: where the eyes fixate = where the mind is engaged.
Wu & Liu found this is frequently false in complex cognitive tasks:

- Correlation between fixation duration and verbal mentions of representations: **r = 0.27–0.75** (highly variable)
- Equations showed highest consistency (r = 0.75); tables and figures much lower (r = 0.27–0.40)

**Implication for the app:**
- Face NOT detected ≠ user is definitely not focused
- The "away" detection is a proxy, not a perfect signal
- Always present absence-detection as contextual, not absolute

---

### 5. Fixation Duration as Cognitive Effort

**Source: [EMH]**

Total Fixation Duration (TFD) on a stimulus is the best proxy for cognitive effort:
- Longer fixation = more cognitive processing required
- High-prior-knowledge users showed **larger interaction effects** between task and fixation
- Tables: TFD ranged 19–70s; equations: 8–33s in this study

**App note:**
Face-api (webcam-based) cannot reliably compute fixation duration or saccades — these require
a dedicated eye tracker (Tobii, etc.). The app tracks **presence vs. absence** as a coarser proxy.
Do not overstate what webcam EAR detection can tell us about fixation.

---

## Focus Quality Score

Computed per session (0–100):

```
blinkRateScore = score based on average session BPM:
  BPM < 8:   score = 0        (strain risk)
  BPM 8–12:  score = lerp(20, 70, (BPM-8)/4)
  BPM 12–20: score = 100      (optimal)
  BPM > 20:  score = 80       (elevated but acceptable)

blinkRegularityScore = score based on session average CV:
  CV < 0.40:  score = 100     (highly regular = focused)
  CV 0.40–0.70: score = lerp(50, 100, (0.70-CV)/0.30)
  CV > 0.70:  score = lerp(0, 50, (1.0-CV)/0.30)

focusScore = round(blinkRateScore * 0.55 + blinkRegularityScore * 0.45)
```

The score is displayed per session in the Stats page and saved to `atenttion-sessions.md`.

---

## What the App Can and Cannot Measure

| Signal | Can detect? | Method | Limitation |
|---|---|---|---|
| Blink events | ✓ | EAR < 0.21 for ≥ 2 frames | May miss fast blinks; false positives in low light |
| Blink rate (BPM) | ✓ | Count in sliding 60s window | Coarse; needs 60s of data to stabilize |
| Blink interval variability (CV) | ✓ | Std/mean of inter-blink intervals | Needs ≥ 3 blinks; may lag at session start |
| Face presence / absence | ✓ | Face detection confidence | Not the same as attention (gaze aversion is normal) |
| Fixation duration | ✗ | Requires dedicated eye tracker | Webcam cannot resolve fixation reliably |
| Gaze direction / saccades | ✗ | Requires dedicated eye tracker | Not possible with face landmarks only |
| Cognitive load (direct) | ✗ | Not detectable from face | Pupil dilation requires IR tracker |

---

## Design Rules (Traceable to Research)

1. **Never equate "face not detected" with "not focused"** — gaze aversion is normal [EMH]
2. **Default away threshold = 5s**, not 3s — brief look-aways are cognitively normal [EMH]
3. **Track blink intervals, not just blink count** — variability is the real signal [BRV]
4. **Healthy BPM range = 12–20** for screen work; danger below 8 [BRV + digital eye strain literature]
5. **Blink regularity (low CV) = focused state** during cognitive work [BRV]
6. **Be transparent about limitations** — this is a proxy system, not a medical device [EMH + BRV]
