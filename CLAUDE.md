# Atenttion App — Claude Code Context

## Pre-Release Checklist

Run `/devList` to see everything worth fixing or being aware of before making the app public — security items, UX polish, stability, and known intentional trade-offs.

---

## Session Memory

**Read [`MEMORY.md`](MEMORY.md) at the start of every session.** It contains the running log of decisions made, known issues, pending tasks, and environment notes that aren't derivable from the code alone. Add an entry whenever you make a non-obvious decision or discover something worth preserving.

---

## What This Is

A cross-platform (Windows/Mac) Electron desktop app for attention-aware focus tracking. It combines a Pomodoro timer with real-time eye tracking via webcam, system monitoring, and a document ingestion pipeline.

**Stack:** Electron 33 · React 18 · Vite 5 · electron-vite 2 · Tailwind CSS 3 · Zustand 5

---

## ⚠️ Critical: ELECTRON_RUN_AS_NODE

**The most important thing to know about running this project.**

The Claude Code Bash tool has `ELECTRON_RUN_AS_NODE=1` set in its environment. This makes Electron behave as a plain Node.js runtime — `require('electron')` returns the npm package path string instead of the Electron API, `process.type` is `undefined`, and no window opens.

**Fix already baked in:** `npm run dev` calls `scripts/dev.js` which does `delete process.env.ELECTRON_RUN_AS_NODE` before spawning electron-vite.

For one-off bash commands against the electron binary, prefix with `env -u ELECTRON_RUN_AS_NODE`:
```bash
env -u ELECTRON_RUN_AS_NODE npx electron-vite build
env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron.exe .
```

Never use `@electron-toolkit/utils` or `@electron-toolkit/preload` in this project — they access `electron.app` at module load time which breaks under this environment variable.

---

## Running the App

```bash
npm install        # also downloads MediaPipe models via postinstall (face_landmarker.task + WASM)
npm run dev        # start with hot reload (uses scripts/dev.js to clear env var)
npm run build      # production build to out/
npm run dist:win   # package as Windows NSIS installer
npm run dist:mac   # package as macOS DMG
```

---

## File Structure

```
src/
├── main/
│   ├── index.js          Main process entry — BrowserWindow, IPC wiring, custom protocol
│   └── systemInfo.js     CPU/memory stats, active window (PowerShell/osascript), wallpaper API
├── preload/
│   └── index.js          Context bridge — exposes api.window, api.system, api.data
└── renderer/
    ├── index.html
    └── src/
        ├── App.jsx                   Page shell (Focus/Stats/Milestones/System/Audio + Settings/EyeDebug) — hooks hoisted here; debounced prefs autosave; goal-reached toast; keyed page transitions
        ├── store/index.js            Zustand store — all app state
        ├── hooks/
        │   ├── usePomodoro.js        Timer logic, session completion, notifications
        │   ├── useEyeTracker.js      MediaPipe face-mesh, EAR blink detection
        │   └── useAudio.js           Web Audio API — 7 synthesised ambient sounds
        └── components/
            ├── TitleBar.jsx          Custom frameless window chrome
            ├── Sidebar.jsx           Nav + status dots (pomodoro, audio playing); Settings pinned bottom
            ├── Pomodoro.jsx          SVG ring timer + controls (reset is 2-step confirm mid-session)
            ├── EyeTracker.jsx        Camera start/stop + status display (secondary indicators behind a Details expander)
            ├── GoalToast.jsx         Trophy toast shown when daily focus goal is crossed
            └── pages/
                ├── FocusPage.jsx     Main view: Pomodoro + EyeTracker + daily stats
                ├── StatsPage.jsx     recharts dashboard — Weekly Recap, Consistency heatmap, Optimal Duration, Focus Stamina, Deep Work, Focus Trend, Records, Apps-vs-Focus, Recurring Intentions, Distractions, Best Hours, app activity, XLSX export
                ├── MilestonesPage.jsx  "Goals" — Getting Started discovery checklist + 12 milestone tracks (progress bars + badge chips) + 15 Achievement badges
                ├── SettingsPage.jsx  Dedicated settings page (moved out of FocusPage); grouped cards; autosave indicator
                ├── SystemPage.jsx    CPU/mem bars, active app, wallpaper changer
                ├── AudiosPage.jsx    7 ambient sound cards + volume slider (receives audioControls prop)
                └── EyeDebugPage.jsx  Live camera + tracker debug (dev surface — still in prod nav)

scripts/
├── dev.js            Clears ELECTRON_RUN_AS_NODE then runs electron-vite dev
└── setup-models.js   Copies MediaPipe WASM from node_modules + downloads face_landmarker.task

src/renderer/public/models/   MediaPipe files (gitignored, created by setup-models.js):
                               models/mediapipe/  — WASM runtime files
                               models/face_landmarker.task  — ~2.3 MB float16 model
out/                          Build output (gitignored)
```

---

## Architecture

### IPC Channels
All communication goes through `contextBridge` → `window.api`:

| Channel | Direction | Purpose |
|---|---|---|
| `window:minimize/maximize/close` | renderer→main | Frameless window controls |
| `system:getInfo` | renderer→main | CPU%, memory%, platform |
| `system:getActiveApp` | renderer→main | Foreground process name |
| `system:getIdleMs` | renderer→main | ms since last system-wide keyboard/mouse input (phone typing-veto) |
| `system:setWallpaper` | renderer→main | Set desktop wallpaper path |
| `data:saveSession` | renderer→main | Append session to userData markdown |
| `data:saveSessionSync` | renderer→main (sendSync) | Synchronous session append — flushes a running Free rider session from the renderer's `beforeunload` (async IPC can't finish during window close) |
| `data:savePreferences` | renderer→main | Write preferences to userData markdown |
| `data:loadPreferences` | renderer→main | Read preferences from userData on startup |

### State (Zustand store — `src/renderer/src/store/index.js`)
Single flat store (uses `subscribeWithSelector` middleware). Key slices:
- **Navigation:** `page` ('focus'|'stats'|'milestones'|'system'|'audios'|'settings'|'eyedebug'); `prefsSavedAt`/`markPrefsSaved` (autosave feedback); `featuresUsed`/`markFeatureUsed(name)` (persisted feature-discovery flags for the Getting Started checklist — e.g. 'audio', 'export')
- **Pomodoro:** `pomodoroState` ('idle'|'work'|'break'|'paused'), `timeLeft`, `sessionsCompleted`, `freeRiderEnabled`. **Free rider** = indefinite work: when enabled, the work session counts UP (`timeLeft` holds *elapsed* seconds, the tick adds instead of subtracts) and never auto-completes. Selected via the far-right notch of the work-session slider (steps 1–24 = 5–120 min, notch 25 = Free rider). It's saved only on Skip/Stop (→ idle, not a break) or on app close (`usePomodoro.js` `beforeunload` → `saveSessionSync`).
- **Eye tracking:** `eyeStatus` ('looking'|'away'|'blinking'|'unknown'), `blinkCount`, `blinkRate`
- **Sessions:** `sessions[]` (capped at last 1000, aligned with the on-disk cap), `todayFocusSeconds`, `streak`/`bestStreak`. Each session snapshots the `dailyGoalSeconds` in effect when it completed, so goal-based history (Consistency calendar, Goal-Hit Streak, Perfect Day, Goal Crusher) is measured against the goal active *that day*, not the current one. Per-day aggregation: `utils/sessionStats.js` `buildDailyMap(sessions, currentGoal)` (last goal-bearing session of a day wins; legacy sessions without the snapshot fall back to the current goal).
- **Audio:** `audioPlaying` (null | 'white'|'brown'|'pink'|'lofi'|'lofi2'|'classical'|'classical2')

### Eye Tracking Pipeline
1. `getUserMedia({ video: true })` → hidden `<video>` element
2. `setTimeout`-based loop at ~30fps calls `landmarker.detectForVideo(video, Date.now())` (synchronous)
3. **Library / models:** `@mediapipe/tasks-vision` — `FaceLandmarker` with 478-point mesh. WASM runtime at `public/models/mediapipe/`, model file at `public/models/face_landmarker.task` (~2.3 MB float16).
4. **Blink detection:** Eye Aspect Ratio (EAR) = `(|p2-p6| + |p3-p5|) / (2·|p1-p4|)` using 6 landmarks per eye (L: 362/385/387/263/373/380, R: 33/160/158/133/153/144). Adaptive threshold = restingEAR × `EAR_THRESHOLD_RATIO` (0.85, calibrated per-user); a blink needs ≥`BLINK_MIN_FRAMES` (2) sub-threshold frames AND is cross-checked against MediaPipe's trained `eyeBlink` blendshape. Head yaw > 0.55 suppresses detection. Blink **closure duration** + **PERCLOS** are tracked as a fatigue signal.
5. **Attention:** No face detected past the away threshold (default 5s, configurable) → `eyeStatus = 'away'`; ordinary auto-pause waits an extra `AWAY_PAUSE_GRACE_MS` (4s) so brief think-glances don't kill the timer (phone-branded pause stays responsive).
6. **Resume:** Face reappears → auto-resume if the pause was auto-triggered

### Blink Feedback & Focus Scoring
**[`docs/blinksInfo.md`](docs/blinksInfo.md) is the single source of truth for all blink-based feedback** (see also `docs/theory-technical.md`).
The score is presented as an **estimate**, and is **personalized**: once a per-user blink baseline is learned (persisted in prefs), `computeRelativeRateScore` scores the current rate *relative to that baseline*. The absolute A–F BPM brackets are only the **fallback** for new users. The session score also applies a **fatigue factor** (PERCLOS + blink-closure duration). Earlier "dopamine/DMN" neuro claims were removed as unsupported — keep copy honest (relative-to-the-user, not asserted brain mechanisms). **Three** derived files — keep all in sync whenever `blinksInfo.md` changes:
- `src/renderer/src/constants/blinksConfig.js` — `BPM_BRACKETS`, `REL_RATE_CURVE`, `getRelativeState`, `SCORE_CONFIG`
- `src/renderer/src/utils/focusScore.js` — `computeFocusScore()` + `computeSessionScore()`
- `src/renderer/src/components/EyeTracker.jsx` — live state label (`getRelativeState` / fallback bracket) + the "estimate" disclaimer

### Model Loading (Production)
Models are at `src/renderer/public/models/` (gitignored, generated by `npm install`).
- **Dev:** Vite serves them at `/models/` from public/
- **Production:** Custom `models://` Electron protocol handler serves them from `out/renderer/models/`
  - Registered in `src/main/index.js` via `protocol.registerSchemesAsPrivileged` (before `app.whenReady()`)


## User Data Files
Persisted to Electron's `app.getPath('userData')`:
- `atenttion-sessions.md` — Human-readable session log (Markdown table); `atenttion-sessions.json` — full-fidelity machine log (capped at last **1000** sessions; the store mirrors this cap so Stats/Milestones/export see the full history)
- `atenttion-preferences.json` — User preferences (JSON; legacy `atenttion-preferences.md` YAML is auto-migrated on first load). `writePreferences` **merges** over the existing file, so a save that omits a field can't reset it (the personal `baselineBpm` relies on this). Build payloads via `buildPrefs(s, extra)` — see [`src/renderer/src/utils/prefs.js`](src/renderer/src/utils/prefs.js). The payload also carries `featuresUsed` (the Getting Started discovery flags), so they persist with prefs.

On startup, preferences are loaded and applied to the Zustand store. **Preferences autosave:** changing any setting only mutates the store; App.jsx holds a debounced (`subscribeWithSelector` + `shallow`) subscription that persists the full `buildPrefs` payload ~600ms after any change (skipping the initial hydration). Session completion (`usePomodoro.js`) also persists prefs as a side effect. There is no manual Save button — SettingsPage shows a passive "Saved" indicator driven by `prefsSavedAt`.

---

## Known Issues / Gotchas

1. **GPU cache errors on startup** — `Unable to move the cache: Acceso denegado` — These are benign Windows permission warnings about Electron's GPU disk cache. The app works fine.

2. **MediaPipe model files** — `face_landmarker.task` (~2.3 MB) and WASM runtime files are gitignored. Running `npm install` downloads and copies them via `scripts/setup-models.js`. If models are missing the eye tracker shows "Models not ready".

3. **PowerShell active window detection** — The PowerShell command to get the foreground window process is slow (~2-3s) and is called every 5s. It can return "Unknown" on permission-restricted processes (e.g., UAC dialogs).

4. **Wallpaper change on Windows** — Uses `SystemParametersInfo(SPI_SETDESKWALLPAPER, ...)` via PowerShell. Requires a full path to an image file. The app stores the original path on first load and can restore it.

---

## Preferences That Persist
- Work duration (default 25 min; slider 5–120 min in 5-min steps)
- `freeRiderEnabled` — "Free rider" indefinite count-up work mode (far-right slider notch)
- Short break duration (default 5 min)
- Long break duration (default 15 min)
- Eye tracking: away threshold, blink threshold
- `baselineBpm` / `baselineBpmConfidence` — learned per-user engaged blink rate (drives personalized focus scoring)
- Streak fields, daily goal (15 min–8h in 15-min steps), ritual/overlay/wallpaper/auto-start toggles

These are written to `atenttion-preferences.json` (merge-on-write) on every change and read on startup.
