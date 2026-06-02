# Atenttion App — Landing Page Reference

Everything you need to design and build the landing page. Self-contained; no need to read the source code.

---

## Product Summary

**Atenttion** is a cross-platform desktop app (Windows + macOS) that combines a Pomodoro timer with real-time attention tracking via webcam. It uses computer vision to measure your blink rate and infer your cognitive state — telling you when you're hyper-focused, in flow, drifting, or zoning out. All processing is local; no cloud, no account, no subscription.

**App name:** Atenttion (double T is intentional — part of the brand)  
**Tagline candidates:**
- "Focus deeper. Know when your mind drifts."
- "The Pomodoro timer that watches your eyes, not your clock."
- "Attention-aware focus sessions for serious work."
- "Your webcam knows when you've lost focus. Now you do too."

---

## Core Features (copy-ready)

### 1. Pomodoro Timer
An SVG ring timer with configurable work/break durations. Defaults: 20 min work, 5 min short break, 15 min long break. Tracks streaks, daily focus time, and session count. Auto-pauses when you leave the desk (eye tracking triggers it).

### 2. Real-Time Eye Tracking
Uses the webcam to run MediaPipe's 478-point face mesh entirely on-device. Calculates your Eye Aspect Ratio (EAR) frame by frame to detect blinks and measure blink rate (BPM). No data leaves your machine.

**The six cognitive states (BPM brackets):**

| Grade | State | BPM Range | Color | What it means |
|-------|-------|-----------|-------|---------------|
| A | Hyper-focus | 0–5 | Violet | Intense concentration — eye strain risk |
| B | High focus | 6–11 | Cyan | Sharp, engaged |
| C | Cruise focus | 12–25 | Emerald | Optimal zone — sustainable peak performance |
| D | Task friction | 26–45 | Amber | Starting to struggle — take a breath |
| E | Mind drifting | 46–65 | Orange | Attention wandering off-screen |
| F | Zoning out | 66+ | Red | Fully disengaged — try a visual reset |

**Focus Score:** Each session is scored 0–100 based on the time spent in each BPM bracket. Cruise focus (C) gives 100 pts/min; zoning out (F) gives 10 pts/min.

**Auto-pause:** If no face is detected for more than 3 seconds, the Pomodoro pauses automatically. Resumes when you return.

### 3. Pre/Post Session Ritual
Optional but powerful. Before a session starts:
- Write a goal for the session
- Select your current mood: Tired / Bored / Neutral / Motivated / Energized
- A guided breathing exercise with an animated pulsing orb (8-second breathe cycle, auto-starts the session after 32s)

After the session ends, a card appears asking how it went: **Scattered / Focused / Flow**. Your goal is shown back to you.

The Stats page tracks the measurable impact: sessions with rituals vs. without, comparing average focus scores.

### 4. Ambient Sounds (7 tracks)
All copyright-free, synthesized in real time via the Web Audio API. No external files, works offline. Music studied to be effective for concentration.

### 5. Statistics Dashboard
Charts and data persisted across app restarts:
- **Weekly bar chart** — focus minutes per day for the last 7 days
- **Session history chart** — focus duration per session (last 10)
- **Blink rate chart** — BPM trend across sessions (line chart)
- **Session table** — time, duration, BPM, blink rhythm (Regular / Variable / Irregular), focus score, away time, mood before, goal
- **Ritual Impact card** — avg focus score with ritual vs. without (appears after 5+ ritual sessions)
- **App activity** — which apps you used during focus time vs. breaks
- **Streak counter** — consecutive days with at least one completed session
- **CSV export** — download full session history

### 6. System Monitor
- Desktop wallpaper changer — set a path to any image; restore original with one click
- Focus wallpaper mode: automatically swaps your wallpaper to a minimal dark image when a focus session starts in order for your focus to be optimal, restores on break

---

## Design System

### Colors

**Backgrounds (dark theme only):**
```
surface-0  #0a0a0a   — app background, deepest
surface-1  #111111   — cards, sidebars
surface-2  #1a1a1a   — nested elements
surface-3  #222222   — borders, hover states
```

**Text:**
```
Primary    #e5e5e5   (neutral-200)
Secondary  #a3a3a3   (neutral-400)
Muted      #525252   (neutral-600)
Faint      #404040   (neutral-700)
```

**Accent / Brand:**
```
Violet 400  #a78bfa   — slider thumbs, active dots, headings
Violet 500  #8b5cf6   — progress rings, active state
Violet 600  #7c3aed   — primary buttons, today's bar in charts
```

**Semantic:**
```
Emerald 400  #34d399   — eye tracking "looking" state, success, C-bracket
Emerald 500  #10b981   — blink rate chart line, goal-reached
Amber 400    #fbbf24   — D-bracket, sessions stat icon, warning
Orange 400   #fb923c   — E-bracket
Red 400      #f87171   — F-bracket, close button hover, danger
Cyan 400     #22d3ee   — B-bracket, streak icon, classical sound
Violet 400   #a78bfa   — A-bracket, LoFi beats
```

**Glow effects:**
```
shadow-violet   box-shadow: 0 0 24px rgba(124, 58, 237, 0.25)
glow-emerald    box-shadow: 0 0 16px rgba(16, 185, 129, 0.2)
```

### Typography
```
Font family:  Inter (sans-serif primary), JetBrains Mono (numbers/mono)
Body:         14px / neutral-200
Label/muted:  10–12px / neutral-500–600 / uppercase + wider tracking
Headings:     16–20px / semibold / neutral-100
```

### Component Language
- **Cards:** `rounded-2xl`, 1px border `#1e1e1e`, bg `#111111`, padding 20px
- **Buttons:** `rounded-xl`, primary = violet-600, secondary = surface-2 with border
- **Inputs:** `rounded-xl`, bg `#161616`, focus ring violet-500
- **Scrollbar:** 4px, thumb `#333`
- **Animations:** `pulse-slow` (3s), `spin-slow` (3s), `animate-eq` (EQ bars, 0.65s)
- **Transitions:** 150ms on interactive elements, 500–1000ms on progress fills
- Icons: Lucide React (Minus, Square, X, Eye, Flame, Clock, Zap, Download, Wind, Waves, etc.)

---

## Pages / Navigation

The sidebar has 4 pages. Nav uses colored dots as status indicators.

| Page | Icon | Purpose |
|------|------|---------|
| Focus | (default) | Pomodoro timer + eye tracker side by side + daily stats |
| Stats | chart | All session data, charts, app usage |
| System | cpu | Hardware monitor + wallpaper |
| Audios | headphones | 7 ambient sound cards + volume |

---

## Technical (for landing page "how it works" section)

- **Platform:** Windows 10+ and macOS 10.14+ — native desktop app
- **Eye tracking:** MediaPipe FaceLandmarker (478 landmarks), runs at ~30 fps entirely in the app. No cloud API, no camera feed ever leaves the device.
- **Blink detection:** Eye Aspect Ratio (EAR) algorithm. EAR < 0.20 = blink. Head yaw compensation above 0.55 radians.
- **Audio synthesis:** Web Audio API — procedural oscillators, no downloaded audio files.
- **Data storage:** All session data stored locally in plain Markdown files in the OS user data folder. No server, no sync, no account.
- **App size:** ~130 MB installed (includes Chromium runtime + MediaPipe WASM models)
- **Camera permission:** Required for eye tracking. Optional — app works as a plain Pomodoro if denied.

---

## Tone & Voice

- **Direct, cerebral, slightly poetic.** Not corporate, not gamified.
- Speaks to knowledge workers, developers, students, researchers.
- Avoids hustle-culture framing. Emphasizes *awareness* over productivity metrics.
- The word "Atenttion" is always capitalized as a proper noun.
- Avoid: "boost your productivity", "hack your brain", "level up"
- Prefer: "understand your attention", "recognize when your mind drifts", "build a ritual"

---

## Possible Landing Page Sections

1. **Hero** — App name + one-line value prop + CTA (Download for Windows / Download for Mac) + screenshot or animated preview of the timer + eye status ring
2. **Problem** — "You sit down to work. An hour passes. How much of it was real focus?"
3. **Feature: Eye Tracking** — the BPM bracket table, what it means to be in each state
4. **Feature: Pomodoro + auto-pause** — rhythm of work, the auto-pause on look-away
5. **Feature: Ritual** — breathing, goal-setting, outcome tracking
6. **Feature: Sounds** — the 7 tracks, offline, synthesized
7. **Feature: Stats** — the charts, focus score, ritual impact
8. **Privacy** — everything local, no account, no data collection
9. **Download CTA** — Windows `.exe` + macOS `.dmg` (via GitHub Actions artifact)

---

## Download Links (as of 2026-05-29)

- **Windows:** Built locally — `npm run dist:win` → `dist/Atenttion Setup 1.0.0.exe`
- **macOS:** Built via GitHub Actions on every push to main branch
  - Repo: https://github.com/matiaskelman/Atenttion_App
  - Actions page: https://github.com/matiaskelman/Atenttion_App/actions
  - Artifact name: `Atenttion-mac` (download → unzip → share `.dmg`)
  - macOS note: First launch requires right-click → Open (unsigned app, Gatekeeper)

---

## Assets You'll Likely Need

- App icon (doesn't exist yet — currently uses default Electron icon)
- Screenshots / screen recordings of:
  - Focus page with timer running and eye status showing "Cruise focus"
  - The breathing ritual animation
  - Stats page with charts
  - Audio page with EQ bars animating
- A short GIF or video of the eye tracker detecting blink state changes in real time
