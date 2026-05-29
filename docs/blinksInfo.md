# Blink Biomarkers — Neurocognitive Bracket Specification

> **Source of truth for feedback logic.**
> `src/renderer/src/components/EyeTracker.jsx` (`getBpmBracket`) and
> `src/renderer/src/utils/focusScore.js` (`computeFocusScore`) are
> derived directly from this document. If you change any bracket boundary,
> label, or message here, update both files to match.

---

## 1. Six-Tier BPM Bracket Matrix

Blink rate is evaluated over a rolling 60-second sliding window during
computer display terminal (VDT) tasks.

### Bracket A — Critical Suppression / Hyper-Focus (`< 6 BPM`)
- **Neurobiology:** Extreme trigeminal reflex inhibition. The brain actively
  prioritises uninterrupted visual data intake to prevent perceptual blackouts
  during dense parsing or high-stakes problem-solving.
- **Cognitive state:** Max Capacity / Flow State. High working-memory
  utilisation; the prefrontal cortex is protecting current cognitive schemas
  from sensory disruption.
- **Ocular risk:** Severe — rapid tear-film evaporation causes Dry Eye Syndrome
  (DES) and Ocular Surface Inflammation.
- **Feedback:** Nudge the user to blink intentionally. Do not interrupt — one
  brief eye-strain warning is enough.
- **Focus score:** ~45 (penalised despite high focus due to ocular risk and
  unsustainability).
- **UI color:** violet

### Bracket B — High-Efficiency Visual Screening (`6 – 11 BPM`)
- **Neurobiology:** Targeted sensory gating. Cortical structures downregulate
  spontaneous blink rate to facilitate steady, active data acquisition.
- **Cognitive state:** High Executive Function & Task Engagement. Active
  information ingestion (reading complex docs, scanning log files, analysing
  structural patterns).
- **Feedback:** Silent — no banner. The state is healthy and should not be
  interrupted.
- **Focus score:** 70 → 85 (linear across the bracket).
- **UI color:** cyan

### Bracket C — Steady-State Baseline / Cruise Focus (`12 – 25 BPM`)
- **Neurobiology:** Homeostatic striatal dopamine baseline — peak of the
  inverted-U performance curve. Motor execution and sustained attention are
  perfectly balanced.
- **Cognitive state:** Task-Related Thought (TRT). Actively working, writing,
  or designing at a sustainable pace.
- **Feedback:** Silent. This is the target state; no interruption.
- **Focus score:** 100 (optimal).
- **UI color:** emerald

### Bracket D — Transitory Acceleration / Pre-Fatigue (`26 – 45 BPM`)
- **Neurobiology:** Fluctuating dopamine depletion. The basal ganglia control
  loop begins to falter as compensatory mechanisms attempt to maintain
  wakefulness and ocular lubrication.
- **Cognitive state:** Task Friction / Processing Hurdles. Often spike-triggered
  by a confusing bug, cognitive friction, or early Time-on-Task (TOT) weariness.
  The brain is working harder to maintain the same attention level.
- **Feedback:** Gentle encouragement — *"Getting tough? Take a breath — you've
  got this."*
- **Focus score:** 65 → 45 (linear across the bracket).
- **UI color:** amber

### Bracket E — Attentional Decoupling / DMN Priming (`46 – 65 BPM`)
- **Neurobiology:** Passive network shifting. The Central Executive Network
  (CEN) begins yielding control to the Default Mode Network (DMN).
- **Cognitive state:** Boredom or Impending Distraction. The mind is preparing
  to detach from the visual terminal; attention is transitioning from the screen
  to internal processing or background environments.
- **Feedback:** Gentle nudge — *"Mind drifting? Let's bring it back to the
  screen."*
- **Focus score:** 40 → 20 (linear across the bracket).
- **UI color:** orange

### Bracket F — Full Cognitive Dropout / Mind-Wandering Overdrive (`> 65 BPM`)
- **Neurobiology:** Hyper-dopaminergic internal musing or severe physiological
  micro-arousals. Neural resources have been diverted inward; Blink-Related
  Oscillations (BROs) confirm full decoupling.
- **Cognitive state:** Task-Unrelated Thought (TUT) / "Zoning Out." The user is
  physically looking at the monitor but mentally processing an entirely separate
  internal narrative.
- **Feedback:** Stronger nudge — *"Looks like you're zoning out — try a short
  visual reset."*
- **Focus score:** 10.
- **UI color:** red

---

## 2. Auxiliary Biometric Co-Factors

These are cross-referenced against BPM; never analyse BPM in isolation.

### Blink Rhythm (Coefficient of Variation of inter-blink intervals)
| CV range | Label | Interpretation |
|---|---|---|
| < 0.40 | Regular | Consistent rhythm — focused state |
| 0.40 – 0.69 | Variable | Some attentional fluctuation |
| ≥ 0.70 | Irregular | Erratic pattern — distracted or fatigued |

### Blink Duration (not yet tracked by the app — future metric)
- **< 200 ms (short, crisp):** Confirms high executive engagement even if BPM
  fluctuates.
- **> 400 ms (slow closure):** Definitively indicates physical exhaustion or
  oncoming micro-sleeps, regardless of BPM.

### Blink Rebound (not yet tracked)
A sudden isolated spike in blink rate immediately after a long low-BPM period
is a *positive* indicator — it signals a cognitive boundary or task-completion
endpoint (e.g., a successful compilation, end of a reading block).

### Attentional Bursting Spikes (not yet tracked)
Localised clusters of rapid blinking (> 3 blinks in < 2 seconds) indicate
sudden sensory micro-arousals, physical distraction shifts, or sharp visual
resetting due to unexpected frustration.

---

## 3. Focus Score Formula

```
focusScore = rateScore × 0.55 + rhythmScore × 0.45
```

`rateScore` is read from the bracket table above. `rhythmScore` is derived from
the blink-rhythm CV thresholds in section 2.

---

## 4. Real-Time Feedback Rules

| Bracket | Show message? | Content |
|---|---|---|
| A | Yes — eye-strain nudge | *"Blink intentionally — eye strain risk at this intensity."* |
| B | No | — |
| C | No | — |
| D | Yes — gentle encouragement | *"Getting tough? Take a breath — you've got this."* |
| E | Yes — soft nudge | *"Mind drifting? Let's bring it back to the screen."* |
| F | Yes — stronger nudge | *"Looks like you're zoning out — try a short visual reset."* |

Extended Bracket A rule (not yet implemented): if the user has been in Bracket
A for more than 10 consecutive minutes, suggest a deliberate deep blink to
preserve the ocular tear film.
