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
│   ├── systemInfo.js     CPU/memory stats, active window (PowerShell/osascript), wallpaper API
│   └── documents.js      File/URL → Markdown conversion via markitdown or JS fallback
├── preload/
│   └── index.js          Context bridge — exposes api.window, api.system, api.docs, api.data
└── renderer/
    ├── index.html
    └── src/
        ├── App.jsx                   5-page shell (Focus / Stats / System / Audios) — hooks hoisted here
        ├── store/index.js            Zustand store — all app state
        ├── hooks/
        │   ├── usePomodoro.js        Timer logic, session completion, notifications
        │   ├── useEyeTracker.js      MediaPipe face-mesh, EAR blink detection
        │   └── useAudio.js           Web Audio API — 7 synthesised ambient sounds
        └── components/
            ├── TitleBar.jsx          Custom frameless window chrome
            ├── Sidebar.jsx           Nav + status dots (pomodoro, audio playing)
            ├── Pomodoro.jsx          SVG ring timer + controls
            ├── EyeTracker.jsx        Camera start/stop + status display
            └── pages/
                ├── FocusPage.jsx     Main view: Pomodoro + EyeTracker + daily stats
                ├── StatsPage.jsx     recharts: session bar chart + blink rate line chart
                ├── SystemPage.jsx    CPU/mem bars, active app, wallpaper changer
                └── AudiosPage.jsx    7 ambient sound cards + volume slider (receives audioControls prop)

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
| `system:setWallpaper` | renderer→main | Set desktop wallpaper path |
| `docs:convertFile` | renderer→main | File → Markdown text |
| `docs:convertUrl` | renderer→main | URL → text via fetch or markitdown |
| `data:saveSession` | renderer→main | Append session to userData markdown |
| `data:savePreferences` | renderer→main | Write preferences to userData markdown |
| `data:loadPreferences` | renderer→main | Read preferences from userData on startup |

### State (Zustand store — `src/renderer/src/store/index.js`)
Single flat store, no selectors needed at this scale. Key slices:
- **Pomodoro:** `pomodoroState` ('idle'|'work'|'break'|'paused'), `timeLeft`, `sessionsCompleted`
- **Eye tracking:** `eyeStatus` ('looking'|'away'|'blinking'|'unknown'), `blinkCount`, `blinkRate`
- **Sessions:** `sessions[]`, `todayFocusSeconds`
- **Audio:** `audioPlaying` (null | 'white'|'brown'|'pink'|'lofi'|'lofi2'|'classical'|'classical2')

### Eye Tracking Pipeline
1. `getUserMedia({ video: true })` → hidden `<video>` element
2. `setTimeout`-based loop at ~30fps calls `landmarker.detectForVideo(video, Date.now())` (synchronous)
3. **Library / models:** `@mediapipe/tasks-vision` — `FaceLandmarker` with 478-point mesh. WASM runtime at `public/models/mediapipe/`, model file at `public/models/face_landmarker.task` (~2.3 MB float16).
4. **Blink detection:** Eye Aspect Ratio (EAR) = `(|p2-p6| + |p3-p5|) / (2·|p1-p4|)` using 6 landmarks per eye (L: 362/385/387/263/373/380, R: 33/160/158/133/153/144). EAR < 0.20 for ≥1 frame = blink. Head yaw > 0.55 suppresses detection.
5. **Attention:** No face detected for >3s (configurable) → `eyeStatus = 'away'` → auto-pause Pomodoro
6. **Resume:** Face reappears → auto-resume if the pause was auto-triggered

### Blink Feedback & Focus Scoring
**[`docs/blinksInfo.md`](docs/blinksInfo.md) is the single source of truth for all blink-based feedback.**
It defines the six neurocognitive BPM brackets (A–F), their cognitive-state labels, feedback messages, UI colors, and the focus score assigned to each bracket. Two files are derived from it — update both whenever `blinksInfo.md` changes:
- `src/renderer/src/components/EyeTracker.jsx` — `getBpmBracket()` function (labels, colors, messages)
- `src/renderer/src/utils/focusScore.js` — `computeFocusScore()` function (BPM → score mapping)

### Model Loading (Production)
Models are at `src/renderer/public/models/` (gitignored, generated by `npm install`).
- **Dev:** Vite serves them at `/models/` from public/
- **Production:** Custom `models://` Electron protocol handler serves them from `out/renderer/models/`
  - Registered in `src/main/index.js` via `protocol.registerSchemesAsPrivileged` (before `app.whenReady()`)

### Document Ingestion
1. `dialog.showOpenDialog` → file path(s)
2. If `.txt`/`.md`: `fs.readFileSync`
3. If Python + markitdown installed: `python -c "from markitdown import MarkItDown; ..."` subprocess
4. If URL: `fetch()` → strip HTML tags fallback (or markitdown if available)
5. Content stored in Zustand `documents[]`, displayed in DocumentsPage

---

## User Data Files
Persisted to Electron's `app.getPath('userData')`:
- `atenttion-sessions.md` — Append-only log of completed focus sessions (Markdown table)
- `atenttion-preferences.md` — User preferences in YAML frontmatter + human-readable body

On startup, preferences are loaded and applied to the Zustand store.

---

## Known Issues / Gotchas

1. **GPU cache errors on startup** — `Unable to move the cache: Acceso denegado` — These are benign Windows permission warnings about Electron's GPU disk cache. The app works fine.

2. **MediaPipe model files** — `face_landmarker.task` (~2.3 MB) and WASM runtime files are gitignored. Running `npm install` downloads and copies them via `scripts/setup-models.js`. If models are missing the eye tracker shows "Models not ready".

3. **PowerShell active window detection** — The PowerShell command to get the foreground window process is slow (~2-3s) and is called every 5s. It can return "Unknown" on permission-restricted processes (e.g., UAC dialogs).

4. **Wallpaper change on Windows** — Uses `SystemParametersInfo(SPI_SETDESKWALLPAPER, ...)` via PowerShell. Requires a full path to an image file. The app stores the original path on first load and can restore it.

5. **markitdown requires Python** — The Documents page gracefully degrades: .txt/.md/.html work without Python. A "pip install" button is shown if Python is found but markitdown isn't.

---

## Preferences That Persist
- Work duration (default 20 min)
- Short break duration (default 5 min)
- Long break duration (default 15 min)
- Eye tracking: away threshold, blink threshold

These are written to `atenttion-preferences.md` on every change and read on startup.
