# Atenttion — Architecture Reference

This document explains every moving part of the app: how data flows, how features are implemented, and why specific decisions were made.

---

## Process Model

Electron runs two (or more) separate OS processes:

```
┌──────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  src/main/index.js                                               │
│                                                                  │
│  • Creates BrowserWindow                                         │
│  • Registers IPC handlers (systemInfo.js, documents.js)         │
│  • Registers custom models:// protocol                          │
│  • Window controls (minimize/maximize/close)                    │
│  • File system access, child_process (Python, PowerShell)       │
└────────────────────────────┬─────────────────────────────────────┘
                             │  IPC (contextBridge)
                             │  src/preload/index.js
┌────────────────────────────▼─────────────────────────────────────┐
│  Renderer Process (Chromium)                                     │
│  src/renderer/                                                   │
│                                                                  │
│  • React 18 SPA                                                  │
│  • Zustand state                                                 │
│  • WebGL (face-api / TensorFlow.js)                             │
│  • getUserMedia (webcam)                                         │
│  • Calls window.api.* to reach main process                     │
└──────────────────────────────────────────────────────────────────┘
```

The preload script (`src/preload/index.js`) is the only bridge between them. It uses `contextBridge.exposeInMainWorld('api', ...)` to expose a safe, typed API surface to the renderer. The renderer cannot access Node.js directly.

---

## IPC Architecture

Every feature that needs system access follows this pattern:

```
Renderer component
  → window.api.thing.doSomething(args)        [preload exposes this]
  → ipcRenderer.invoke('thing:doSomething', args)
  → [main process]
  → ipcMain.handle('thing:doSomething', handler)
  → returns result
```

**Preload (`src/preload/index.js`):**
```js
contextBridge.exposeInMainWorld('api', {
  window: { minimize, maximize, close, isMaximized, onMaximized },
  system: { getInfo, getActiveApp, getCurrentWallpaper, setWallpaper },
  docs:   { checkDeps, installMarkitdown, pickFile, convertFile, convertUrl },
  data:   { saveSession, savePreferences, loadPreferences }
})
```

All channels use `ipcRenderer.invoke` / `ipcMain.handle` (async, request-response). One-way events use `ipcRenderer.send` / `ipcMain.on` (window controls).

---

## Eye Tracking

### Data Flow

```
Webcam
  → getUserMedia({ video: { frameRate: 15 } })
  → <video> element (hidden, in DOM for processing)
  → requestAnimationFrame loop (useEyeTracker.js)
  → faceapi.detectSingleFace(video, TinyFaceDetectorOptions)
       .withFaceLandmarks(true)           ← tiny 68-point landmark model
  → detection result: { landmarks, ... } | null
```

### Blink Detection — Eye Aspect Ratio (EAR)

The Eye Aspect Ratio is a scalar derived from 6 landmark points around each eye:

```
      p2    p3
  p1            p4
      p6    p5
```

```
EAR = (distance(p2, p6) + distance(p3, p5))
      ──────────────────────────────────────
           2 × distance(p1, p4)
```

When the eye is fully open, EAR ≈ 0.3–0.4.
When the eye is closed (blink), EAR drops below **0.21**.

A blink is registered when EAR < 0.21 for at least **2 consecutive frames** and the eye was open the frame before. This prevents spurious counts from partial detections.

The 68-point face landmark model gives these eye landmark indices:
- **Left eye:** points 36–41 (mapped as [p1,p2,p3,p4,p5,p6])
- **Right eye:** points 42–47

Both eyes are averaged: `EAR = (leftEAR + rightEAR) / 2`

### Attention Detection

```
face detected?
  YES → reset away timer, restore 'looking' status
         if pomodoro was auto-paused → auto-resume
  NO  → start/increment away timer
         if away > 3s AND pomodoro is 'work' → auto-pause, set autoPausedRef = true
```

The `autoPausedRef` flag ensures auto-resume only fires if the pause was triggered by the eye tracker (not a manual user pause).

### Blink Rate (BPM)

Maintains a sliding window of the last 60 seconds of blink timestamps:
```js
blinkTimesRef.current = blinkTimesRef.current.filter(t => now - t < 60_000)
blinkTimesRef.current.push(now)
setBlinkRate(blinkTimesRef.current.length) // count in last minute
```

Healthy adult blink rate: 15–20 BPM. Below 12 BPM triggers an eye strain warning.

### Model Loading

Models are served differently in dev vs. production:

| Mode | URL | Source |
|---|---|---|
| Development | `/models/...` | Vite dev server from `src/renderer/public/models/` |
| Production | `models://root/...` | Custom Electron protocol from `out/renderer/models/` |

The custom `models://` protocol is registered in `src/main/index.js`:
```js
protocol.registerSchemesAsPrivileged([
  { scheme: 'models', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])
// in app.whenReady():
protocol.handle('models', (request) => {
  const filePath = new URL(request.url).pathname.slice(1)
  return net.fetch(pathToFileURL(join(__dirname, '../renderer/models', filePath)).toString())
})
```

`protocol.registerSchemesAsPrivileged` must be called **before** `app.whenReady()` — this is a hard Electron requirement.

---

## Pomodoro Timer

### State Machine

```
         start()                  timer hits 0 (work done)
  idle ──────────► work ─────────────────────────────► break
   ▲                │                                    │
   │    reset()     │  pause()            timer hits 0   │
   └────────────────┤◄──────── paused ◄──────────────────┘
                    │           │
                    └───────────┘  start() (resume)
```

Eye tracker can inject `setPomodoroState('paused')` from `'work'` and `setPomodoroState('work')` to resume. This is safe because `usePomodoro` watches `pomodoroState` in a `useEffect` and starts/stops the `setInterval` accordingly.

### Stale Closure Problem

The `setInterval` callback in `usePomodoro.js` would capture stale React state if not handled carefully. The solution: refs mirror the state values that the interval needs to read:

```js
const blinkCountRef = useRef(store.blinkCount)
useEffect(() => { blinkCountRef.current = store.blinkCount }, [store.blinkCount])
```

For writes to the store, `useStore.getState()` is called inside the interval instead of using hook values — Zustand's `getState()` always returns the current state without subscription, making it safe to call from inside closures.

### Session Completion

When `timeLeft` reaches 0 in a work session:
1. `addSession({ date, duration, blinkCount, blinkRate, awaySeconds })` → Zustand
2. `incrementSessions()` → updates session counter + mode rotation (every 4 sessions → long break)
3. Browser Notification API fires if permission granted
4. `data:saveSession` IPC → appends row to `atenttion-sessions.md` in userData
5. Timer auto-transitions to break mode

---

## State Management

Single Zustand store at `src/renderer/src/store/index.js`. No context providers, no Redux. Components subscribe only to what they need:

```js
const { pomodoroState, timeLeft } = useStore()          // subscribes to both
const page = useStore(s => s.page)                      // subscribes to one field
```

The store is not persisted to localStorage — session data is written to markdown files via IPC instead, and loaded back on startup.

**Store slices:**
```
Navigation:     page
Pomodoro:       pomodoroState, pomodoroMode, timeLeft, workDuration,
                shortBreakDuration, longBreakDuration, sessionsCompleted
Eye Tracking:   eyeTrackingActive, eyeStatus, blinkCount, blinkRate,
                lookingAwaySeconds, totalLookingAwaySeconds,
                modelLoaded, modelLoading
Sessions:       sessions[], todayFocusSeconds
Documents:      documents[]
System:         activeApp, systemInfo
```

---

## System Information

### Active Window (Current Foreground App)

**Windows** — PowerShell using Win32 API via Add-Type:
```powershell
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices;
public class FW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}'
$h = [FW]::GetForegroundWindow()
$p = 0
[FW]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
(Get-Process -Id $p -EA SilentlyContinue).ProcessName
```

**macOS** — AppleScript:
```applescript
tell application "System Events" to get name of first process whose frontmost is true
```

Polled every 5 seconds in the renderer (`SystemPage.jsx`). Cached in Zustand as `activeApp`.

### CPU Usage

The `os.cpus()` Node.js API returns cumulative tick counts. Real-time % requires two samples:

```js
// Called each poll; returns delta % since last call
function getCPUUsage() {
  const { idle, total } = sampleCPU()
  const idleDiff  = idle  - prev.idle
  const totalDiff = total - prev.total
  prev = { idle, total }
  return Math.round((1 - idleDiff / totalDiff) * 100)
}
```

---

## Document Ingestion Pipeline

```
User action
  → dialog.showOpenDialog (main process)
  → file path(s) returned to renderer
  → renderer calls window.api.docs.convertFile(path)
  → main process:
      .txt/.md  → fs.readFileSync
      .html     → readFileSync + strip HTML tags
      other     → if markitdown installed:
                      python -c "from markitdown import MarkItDown; ..."
                  else:
                      error: "Requires markitdown"
  → { success, name, path, content, ext } returned
  → stored in Zustand documents[]
```

For URLs, `fetch()` is used directly from the main process (Node.js), with HTML tag stripping as fallback.

markitdown availability is checked by `python -c "import markitdown"`. Result is cached for the session.

---

## Persistence: Session Logs & Preferences

### Write Path
```
Session completes (usePomodoro.js)
  → ipcRenderer.invoke('data:saveSession', sessionData)
  → main process (persistence.js)
  → appends a Markdown table row to userData/atenttion-sessions.md
  → creates file with header if it doesn't exist
```

```
Preference changes (store action setPreference)
  → ipcRenderer.invoke('data:savePreferences', prefs)
  → main process overwrites userData/atenttion-preferences.md
```

### Read Path (Startup)
```
App loads
  → FocusPage useEffect
  → window.api.data.loadPreferences()
  → main process reads + parses atenttion-preferences.md
  → returns { workDuration, shortBreakDuration, longBreakDuration }
  → store.applyPreferences(prefs)
```

### File Format

**`atenttion-sessions.md`:**
```markdown
# Atenttion — Session Log

| Date | Time | Duration | Blinks | BPM | Away |
|------|------|----------|--------|-----|------|
| 2026-05-22 | 10:30 | 25m 00s | 142 | 18 | 0m 12s |
| 2026-05-22 | 11:05 | 24m 38s | 127 | 16 | 0m 45s |
```

**`atenttion-preferences.md`:**
```markdown
---
workDuration: 1500
shortBreakDuration: 300
longBreakDuration: 900
eyeAwayThresholdMs: 3000
updatedAt: 2026-05-22T10:30:00.000Z
---

# Atenttion Preferences

| Setting | Value |
|---------|-------|
| Work session | 25 minutes |
| Short break | 5 minutes |
| Long break | 15 minutes |
| Look-away pause threshold | 3 seconds |

*Last updated: Thu May 22 2026*
```

The frontmatter block (`---` delimited YAML) is what the app reads programmatically. The table below it is for humans reading the file in a text editor.

---

## Build & Packaging

**electron-vite** handles 3 separate Vite builds:

| Target | Input | Output | Format |
|---|---|---|---|
| Main process | `src/main/index.js` | `out/main/index.js` | CJS (externalized deps) |
| Preload | `src/preload/index.js` | `out/preload/index.js` | CJS (externalized deps) |
| Renderer | `src/renderer/src/main.jsx` | `out/renderer/assets/` | ESM (bundled) |

`externalizeDepsPlugin()` marks all `node_modules` as external for main/preload — they're `require()`d at runtime by Electron. The renderer bundles everything (including face-api at ~1.6MB).

**electron-builder** packages `out/` into installers. `resources/` holds platform icons.

---

## Dependency Notes

| Package | Why |
|---|---|
| `@vladmandic/face-api` | Maintained fork of face-api.js. Includes TypeScript types and updated TF.js bindings. Models bundled in `model/` dir. |
| `zustand@5` | Minimal state. No boilerplate, no context. `getState()` in closures avoids stale captures. |
| `recharts` | Composable chart primitives. Responsive container works well in Electron's fixed-size window. |
| `lucide-react` | Tree-shakeable SVG icon set. Consistent 24px grid. |
| `electron-vite` | Vite-based build tool designed for Electron's 3-process model. Hot reload for renderer in dev. |
