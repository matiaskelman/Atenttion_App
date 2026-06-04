# Eye Tracking — Neuroscience & Psychophysiology Reference

The theoretical foundation behind the blink-based attention model used in Atenttion. This document covers the neurobiology, the psychophysiology of spontaneous blink rate, the six cognitive-state brackets, and how they map to the focus score model.

---

## 1. Why Blink Rate Reveals Cognitive State

The human spontaneous blink rate (SBR) is not random. It is tightly regulated by the **trigeminal-dopaminergic system** — an interaction between the trigeminal brainstem reflex arc (which controls lid closure) and the mesocortical and mesolimbic dopamine pathways (which modulate arousal, attention, and reward salience).

**Dopamine as the primary regulator**

Central dopamine activity has a direct, well-documented effect on SBR. Higher striatal dopamine → higher blink rate. This relationship is so reliable it is used clinically: Parkinson's patients (severe dopamine depletion) blink far less frequently than healthy controls; schizophrenia patients (dopamine excess in some pathways) often exhibit elevated SBR.

During focused cognitive work, dopamine is selectively allocated to the prefrontal cortex and the task-relevant circuits. The striatum — which would otherwise promote spontaneous blinking — is partially suppressed. The result: SBR drops significantly below the resting baseline of 15–20 BPM.

**Visual fixation suppression**

A secondary mechanism amplifies this effect during screen work (VDT — Visual Display Terminal tasks). The trigeminal blink reflex is suppressed by a separate cortical pathway whenever the visual system is engaged in sustained fixation. This is the brain actively preventing perceptual blackouts during dense information intake. Under combined dopamine suppression and fixation suppression, SBR can fall below 5 BPM in deeply focused individuals.

**Why rhythm matters too**

It is not just how often someone blinks — it is how *regularly* they blink. A consistent inter-blink rhythm indicates that the Central Executive Network (CEN) is stably in control of attentional resources. An irregular rhythm (high CV of inter-blink intervals) signals that the CEN is competing with intrusive mind-wandering episodes, fatigue-driven micro-arousals, or attentional switching. Two users with identical BPM but different rhythm variability are in meaningfully different cognitive states.

---

## 2. Eye Aspect Ratio as a Biometric

The **Eye Aspect Ratio (EAR)** was introduced by Soukupová & Čech (2016) as a simple, real-time blink detector for facial action unit research. It measures the ratio of vertical to horizontal palpebral fissure extent using 6 points on the eye contour.

**Palpebral fissure geometry**

The palpebral fissure is the opening between the upper and lower eyelids. During voluntary and involuntary blinks, the orbicularis oculi muscle contracts, reducing the vertical extent of the fissure to near zero while the horizontal extent (medial to lateral canthus) remains unchanged. EAR captures this by dividing the mean vertical distance by the horizontal distance:

```
EAR = (|p2 − p6| + |p3 − p5|) / (2 × |p1 − p4|)
```

When eyes are fully open, EAR is ~0.30–0.40. During a full blink, it drops to ~0.05–0.15. The two vertical measurements (`p2/p6` and `p3/p5`) at slightly different horizontal positions average out asymmetries from oblique camera angles.

**Why EAR works under partial occlusion**

Glasses, partial side-lighting, and slight head tilts all distort the absolute pixel positions of landmarks but affect the numerator and denominator similarly. Because EAR is a ratio, these distortions partly cancel. Severe yaw (> 55% of inter-ocular span) does break the assumption — the near eye's horizontal span compresses faster than its vertical span, inflating its EAR. The tracker corrects for this via per-eye yaw weighting, biasing the blend toward the geometrically unforeshortened far eye.

**Landmark source**

MediaPipe FaceLandmarker produces a 478-point mesh from a single webcam frame using a lightweight MobileNet-based model (~2.3 MB float16). The EAR landmarks are a subset of the periorbital region: indices 362, 385, 387, 263, 373, 380 (left eye) and 33, 160, 158, 133, 153, 144 (right eye).

---

## 3. The Six BPM Brackets

The app classifies the live blink rate into six brackets (A–F), each corresponding to a distinct neurocognitive state. Boundaries were drawn at physiologically meaningful transitions, not arbitrary quantiles. All rates refer to the rolling 60-second window measured during screen-based (VDT) work.

---

### Bracket A — Critical Suppression / Hyper-Focus (`< 6 BPM`)

**Neurobiology** — Extreme trigeminal reflex inhibition. The brain is actively prioritising uninterrupted visual data intake to prevent perceptual blackouts during dense parsing or high-stakes problem-solving. The prefrontal cortex is in a high-allocation state: working memory schemas are being actively protected from sensory disruption. Dopamine is being maximally channelled into the task-relevant circuits at the cost of all non-essential reflexes.

**Cognitive state** — Maximum Capacity / Flow State. High working-memory utilisation. Typical triggers: reading dense technical documentation, debugging a complex system failure, writing a proof, or any task with a high penalty for losing context.

**Ocular risk** — Severe. At < 6 BPM, tear-film renewal is drastically insufficient. The lipid layer of the tear film evaporates in approximately 10–15 seconds; without a blink to replenish it, the ocular surface becomes exposed, leading to Dry Eye Syndrome (DES) and Ocular Surface Inflammation (OSI). Sustained periods (> 10 minutes) at this rate increase the risk of corneal micro-abrasions.

**App response** — Nudge to blink intentionally (`"Blink intentionally — eye strain risk at this intensity."`). The message is shown but not modal — the work must not be interrupted. UI color: violet.

**Focus score** — 45 (penalised despite high cognitive engagement due to ocular risk and the unsustainability of the state over a full Pomodoro session).

---

### Bracket B — High-Efficiency Visual Screening (`6 – 11 BPM`)

**Neurobiology** — Targeted sensory gating. Cortical structures are downregulating spontaneous blink rate to facilitate steady, active data acquisition, but not to the pathological extreme of Bracket A. The dopaminergic suppression is strong but controlled.

**Cognitive state** — High Executive Function & Task Engagement. Active information ingestion: reading complex documents, scanning logs, analysing structural patterns. The user is working hard and productively.

**Ocular risk** — Mild to moderate. Tear film is stressed but recovers between blinks. No intervention needed.

**App response** — Silent. This state is healthy and productive; any notification would be counterproductive. UI color: cyan.

**Focus score** — 70 → 85, linear across the bracket. Higher BPM within B indicates slightly less suppression and is marginally better for ocular health.

---

### Bracket C — Steady-State Baseline / Cruise Focus (`12 – 25 BPM`)

**Neurobiology** — Homeostatic striatal dopamine baseline. This is the peak of the inverted-U performance curve (Yerkes–Dodson): arousal is optimal, dopamine signalling is balanced, motor execution and sustained attention are perfectly synchronised. The brain is not over-suppressing (risking fatigue) or under-suppressing (risking distraction).

**Cognitive state** — Task-Related Thought (TRT). Actively working, writing, or designing at a sustainable and comfortable pace. This is the target state for a full Pomodoro session.

**Ocular risk** — None. Tear film is being adequately renewed.

**App response** — Silent. UI color: emerald.

**Focus score** — 100 (optimal).

---

### Bracket D — Transitory Acceleration / Pre-Fatigue (`26 – 45 BPM`)

**Neurobiology** — Fluctuating dopamine depletion. The basal ganglia control loop begins to falter as compensatory mechanisms attempt to maintain wakefulness and ocular lubrication. The prefrontal cortex is working harder to sustain the same level of task engagement — the efficiency of the dopaminergic signal is declining.

**Cognitive state** — Task Friction / Processing Hurdles. Elevated blink rate in this range is often spike-triggered: a confusing bug, a conceptual block, early Time-on-Task (TOT) weariness, or a moment of frustration. The brain is working harder to maintain the same attention level.

**Ocular risk** — None (blinking is adequate).

**App response** — Gentle encouragement: `"Getting tough? Take a breath — you've got this."` The message acknowledges the friction without alarming. UI color: amber.

**Focus score** — 65 → 45, linear (declining with BPM). Higher rates within D indicate more severe friction.

---

### Bracket E — Attentional Decoupling / DMN Priming (`46 – 65 BPM`)

**Neurobiology** — Passive network shifting. The Central Executive Network (CEN), which governs goal-directed attention, begins yielding control to the Default Mode Network (DMN). The DMN is associated with self-referential thought, episodic memory retrieval, and mind-wandering. Its activation is incompatible with tight external-task focus.

**Cognitive state** — Boredom or Impending Distraction. The mind is preparing to detach from the visual terminal; attention is transitioning from the screen to internal processing or environmental stimuli. The user may still be physically present but is mentally drifting.

**App response** — Soft nudge: `"Mind drifting? Let's bring it back to the screen."` UI color: orange.

**Focus score** — 40 → 20, linear (declining with BPM).

---

### Bracket F — Full Cognitive Dropout / Mind-Wandering Overdrive (`> 65 BPM`)

**Neurobiology** — Two possible underlying states, both producing the same high-BPM signature:

1. **Hyper-dopaminergic internal musing** — Dopamine release in DMN circuits drives internal narrative processing. Neural resources have been diverted inward; the visual cortex is still receiving input from the screen but the associative cortex is not processing it meaningfully.
2. **Physiological micro-arousals** — Fatigue-induced micro-sleep onset causes brief involuntary blink bursts. Blink-Related Oscillations (BROs) — gamma-band oscillations phase-locked to blinks — are a marker of this full-decoupling state.

**Cognitive state** — Task-Unrelated Thought (TUT) / "Zoning Out". The user is physically looking at the monitor but mentally processing an entirely separate internal narrative. This is the most common form of mind-wandering and is strongly correlated with reduced task performance.

**App response** — Stronger nudge: `"Looks like you're zoning out — try a short visual reset."` UI color: red.

**Focus score** — 10 (flat).

---

## 4. Blink Rhythm as a Co-Factor

Blink rate and rhythm are independent dimensions. Two users can have identical BPM but very different rhythms.

The **Coefficient of Variation (CV)** of inter-blink intervals captures rhythm irregularity in a rate-normalised way:

```
CV = standard deviation of intervals / mean of intervals
```

| CV | Label | Cognitive correlate |
|---|---|---|
| < 0.40 | Regular | Stable CEN dominance; consistent focused state |
| 0.40 – 0.70 | Variable | CEN/DMN competition; some attentional fluctuation |
| ≥ 0.70 | Irregular | Erratic attentional switching; distraction or fatigue |

A user in Bracket C (optimal BPM) with irregular rhythm (CV ≥ 0.70) may appear focused by rate alone but is showing signs of attentional instability — perhaps working through distracting thoughts while maintaining an adequate average blink rate. The focus score accounts for this by weighting rhythm (45%) alongside rate (55%).

---

## 5. Future Metrics (Not Yet Tracked)

### Blink Duration

Individual blink duration (time from lid closure to reopening) carries its own cognitive signal:

- **< 200 ms (short, crisp)** — Confirms high executive engagement regardless of BPM fluctuations. The orbicularis oculi and levator palpebrae are in a high-tone state, producing fast, precise closures.
- **> 400 ms (slow, heavy)** — Definitively indicates physical exhaustion or oncoming micro-sleeps, regardless of BPM. The levator palpebrae tone is declining, producing prolonged closures consistent with Stage 1 sleep onset.

### Blink Rebound

A sudden isolated spike in blink rate immediately after a prolonged low-BPM period is a *positive* cognitive indicator. It signals a task-completion boundary — a cognitive endpoint (successful compilation, end of a reading block, solution found) that releases the trigeminal suppression. Detecting these rebounds could provide insight into task pacing and cognitive rhythm independent of explicit user input.

### Attentional Bursting Spikes

Localised clusters of rapid blinking (> 3 blinks in < 2 seconds) indicate sudden sensory micro-arousals, physical distraction shifts, or sharp visual resetting driven by unexpected frustration or context switching. These are distinct from sustained Bracket E/F states and represent acute attentional events rather than gradual drift.

---

## 6. The Focus Score Model

The focus score condenses the two primary biometric signals (BPM and CV) into a single 0–100 number, updated on every confirmed blink.

### Why two signals?

BPM measures the *level* of engagement. CV measures the *stability* of engagement. A high but erratic BPM could indicate a user who is mostly disengaged but occasionally engaged (Variable–Irregular). A low, consistent BPM indicates deep, sustained engagement (Regular). The two signals are complementary and partially independent.

### Rate score

Each bracket's rate score reflects the neurocognitive value of that state for productive, sustainable work:

- **Bracket C (100)** — inverted-U peak; the ideal state. Dopamine balance, adequate ocular health, sustainable pace.
- **Bracket B (70–85)** — high performance but approaching DES risk territory. Productive but slightly costly.
- **Bracket A (45)** — maximum cognitive engagement but unsustainable and causing ocular damage. Penalised to reflect the trade-off.
- **Bracket D (65–45)** — increasing friction; still engaged but efficiency is declining.
- **Bracket E (40–20)** — significant mind-wandering; low task engagement.
- **Bracket F (10)** — full cognitive dropout; work is not proceeding.

### Rhythm score

The rhythm score is a linear transformation of CV:

- CV < 0.40 → 100 (regular rhythm)
- CV 0.40–0.70 → 100 down to 50 (linear)
- CV ≥ 0.70 → 50 down to 0 (linear, floor at 0)

### Weighted blend

```
focusScore = round(rateScore × 0.55 + rhythmScore × 0.45)
```

The 55/45 weighting acknowledges that rate carries slightly more information about current cognitive state than rhythm, while still giving rhythm enough weight to differentiate stable focus from erratic focus within the same BPM bracket. If CV is not yet available (fewer than 3 inter-blink intervals recorded), only the rate score is returned.

---

## 7. Head Pose and Jaw Suppression

### Yaw (horizontal head rotation)

During yaw, one eye rotates toward the camera centre (near eye) and the other rotates away (far eye). The near eye's horizontal inter-canthus distance compresses due to perspective foreshortening. Because EAR divides by the horizontal span, a compressed span inflates the near eye's EAR — making it appear more open than it actually is. If the blended EAR is biased toward the near eye during yaw, the inflated value raises the apparent resting EAR above the adaptive threshold, masking real blink closures.

The correction weights the blend toward the far eye proportionally to yaw severity. Beyond a yaw ratio of 0.55 (inter-ocular span), the asymmetry is too severe to correct reliably and blink detection is suspended entirely.

### Pitch (vertical head tilt)

Extreme downward pitch (reading from a low surface) and upward pitch (looking up) both alter the relationship between lid landmarks and the facial mesh, producing unreliable EAR readings. Suppression thresholds are asymmetric: a wider range is allowed for downward pitch (common for reading) than upward.

### Jaw open / talking

Active speech involves voluntary motor programs in the orbicularis oris (lip muscles) that partially suppress the spontaneous blink reflex through shared premotor cortex circuits. Measured blink rate during active speech is not representative of resting cognitive state. The jaw-open ratio (`|lm[13].y − lm[14].y| / eyeSpan`) detects wide mouth openings; at a threshold of 0.22 (casual speech and partial yawning pass through; sustained speech and wide yawning are suppressed). The 3-frame hysteresis ensures brief mouth movements (a single word, a brief exhale) do not interrupt blink counting.
