ATENTTION APP — CLAUDE ACTION PLAN
Generated: 2026-05-25
Format: [ID] CATEGORY > Title | Files | Problem | Fix | Result

==============================================================
QUICK WINS — low risk, < 4h each, do these first
==============================================================

[QW-1] ✅ DONE — PERF > Replace ref farm with getState() in usePomodoro
  Files: src/renderer/src/hooks/usePomodoro.js
  Problem: 8+ refs (blinkCountRef, stateRef, modeRef, blinkRateRef, awayTimeRef, etc.) mirror
           Zustand state via useEffect blocks solely to avoid stale closures inside setInterval.
           Adding new state requires remembering to add a new ref + sync effect or it silently
           uses stale data. Approximately 1-2 re-renders/sec while running, times all effects.
  Fix: At the top of the setInterval tick callback, call useStore.getState() once and
       destructure the values needed. Delete every ref that was only there for this purpose.
       Delete the corresponding useEffect sync blocks. Keep refs that hold non-state values
       (timeout IDs, DOM nodes, flags that must not trigger re-renders).
  Result: No stale-closure refs for Zustand-derived values. Ref count drops by ≥ 6.

[QW-2] ✅ DONE — RELIABILITY > Add fetch timeout to URL conversion
  Files: src/main/documents.js
  Problem: fetch(url) has no AbortController timeout. Unreachable URLs hang the Documents
           feature indefinitely with no way to cancel.
  Fix: Wrap the fetch call:
         const ctrl = new AbortController()
         const timer = setTimeout(() => ctrl.abort(), 15000)
         try { const resp = await fetch(url, { signal: ctrl.signal }) ... }
         finally { clearTimeout(timer) }
       In the catch block, detect AbortError and return { success: false, error: 'Timed out after 15s' }.
  Result: Unreachable URLs fail within 15s with a user-visible error.

[QW-3] ✅ DONE — RELIABILITY > Replace spawnSync with async spawn for markitdown
  Files: src/main/documents.js
  Problem: spawnSync for Python/markitdown conversion blocks the entire Electron main process
           (all IPC, all window events) for up to 30s. App appears completely frozen.
  Fix: Replace with a promisified spawn wrapper:
         function spawnAsync(cmd, args, opts) {
           return new Promise((resolve, reject) => {
             const proc = spawn(cmd, args, opts)
             let stdout = '', stderr = ''
             proc.stdout.on('data', d => stdout += d)
             proc.stderr.on('data', d => stderr += d)
             proc.on('close', code => resolve({ stdout, stderr, status: code }))
             proc.on('error', reject)
             setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, 30000)
           })
         }
       Mark the IPC handler async and await spawnAsync(...).
       Import spawn (not spawnSync) from child_process.
  Result: Main process stays responsive during document conversion.

[QW-4] ✅ DONE — ARCH > Extract BPM bracket constants to single source file
  Files: docs/blinksInfo.md (spec), src/renderer/src/components/EyeTracker.jsx (getBpmBracket),
         src/renderer/src/utils/focusScore.js (computeFocusScore)
  Problem: Bracket thresholds and scores defined in 3 places. Changing one requires manually
           updating all three. Will inevitably drift.
  Fix: Create src/renderer/src/constants/blinksConfig.js with a BPM_BRACKETS array
       (id, label, min, max, color, score — read exact current values from EyeTracker.jsx before writing).
       Refactor getBpmBracket() and computeFocusScore() to derive values from this array.
       Delete the inline data from both files.
  Result: grep for bracket thresholds returns exactly 1 file. Changing a threshold propagates
          automatically to both UI and scoring.

[QW-5] ✅ DONE — PERF > Move system info polling out of SystemPage
  Files: src/renderer/src/components/pages/SystemPage.jsx, src/renderer/src/App.jsx
  Problem: The 5000ms setInterval that polls system:getInfo lives inside SystemPage.jsx.
           Navigating away and back creates a new interval without clearing the old one.
           Five nav round-trips = five overlapping intervals doing identical work.
  Fix: Move the interval (and the state it populates) to App.jsx alongside other top-level
       polling hooks. SystemPage reads from the Zustand store only — no setInterval inside it.
  Result: Navigating to System page N times creates exactly 1 polling interval total.

[QW-6] ✅ DONE — RELIABILITY > Validate session JSON on load
  Files: src/main/persistence.js
  Problem: If atenttion-sessions.json is malformed (even one bad character), the entire parse
           fails and the app silently returns [] — all session history is lost with no warning.
  Fix: After JSON.parse, verify result is an Array. Filter each session for required fields
       (at minimum: date, duration, blinkCount). Skip malformed entries, keep valid ones.
       Log a warning to console for each entry skipped.
  Result: A file with 1 malformed entry still loads the other 999 sessions correctly.

[QW-7] ✅ DONE — ARCH > Extract duplicated utility functions
  Files: src/renderer/src/hooks/usePomodoro.js, src/renderer/src/hooks/useEyeTracker.js,
         multiple components (formatTime, formatDuration)
  Problem: playBeep() defined identically in both hooks. formatTime()/formatDuration()
           duplicated across multiple components. Changing one copy misses the others.
  Fix: Create src/renderer/src/utils/audio.js — move playBeep() there, export it, update
       both hooks to import it.
       Create src/renderer/src/utils/format.js — move time/duration formatters there, update
       all importing components.
       No new abstractions — just named exports of existing functions.
  Result: grep for 'function playBeep' returns exactly 1 result.
          grep for 'function formatTime' returns exactly 1 result.

[QW-8] ✅ DONE — DOCS > Update CLAUDE.md eye tracking section (face-api → MediaPipe)
  Files: CLAUDE.md
  Problem: Architecture section still documents face-api (68-point landmarks, tinyFaceDetector,
           faceLandmark68TinyNet) but the codebase uses MediaPipe tasks-vision since 2026-05-23.
           Wrong mental model for anyone reading the docs.
  Fix: In the "Eye Tracking Pipeline" section replace all face-api references.
       Update: model names (face_landmarker.task), landmark count (478), library name
       (@mediapipe/tasks-vision), detection call (detectForVideo, synchronous),
       model loading path (WASM at public/models/mediapipe/).
  Result: CLAUDE.md accurately describes the running code.

==============================================================
MEDIUM FIXES — 1-3 days each
==============================================================

[MF-1] ✅ DONE — PERF > Switch persistence.js to async file I/O
  Files: src/main/persistence.js
  Problem: All readFileSync/writeFileSync calls block the main process thread. Currently
           tolerable (small files), but will cause hitches as session JSON grows toward 1000 entries.
  Fix: Replace every readFileSync with await fs.promises.readFile(...).
       Replace every writeFileSync with await fs.promises.writeFile(...).
       Mark affected IPC handler functions as async.
       No logic or format changes — only the I/O calls.
  Result: Main process does not block during file reads or writes.

[MF-2] ✅ DONE — ARCH > Slice the Zustand store
  Files: src/renderer/src/store/index.js
  Problem: Single flat store with ~50 fields spanning pomodoro, eye tracking, audio, system,
           sessions, and UI. Any mutation triggers all subscribers. No logical grouping.
  Fix: Split into named slices using Zustand's slice pattern: pomodoro, eyeTracker, audio,
       system, ui. Keep a single useStore export for backwards compatibility.
       Update component imports to select from the relevant slice.
       Pure refactor — no behavior changes.
  Result: Store file < 60 lines. Components only re-render on relevant slice changes.

[MF-3] ✅ DONE — RELIABILITY > Replace YAML frontmatter preferences with JSON
  Files: src/main/persistence.js, src/renderer/src/store/index.js (load path)
  Problem: Preferences stored as YAML frontmatter in a markdown file and parsed with regex
           string splitting. Silently misparses any value containing a colon (e.g. "14:30").
  Fix: Change preferences file to atenttion-preferences.json.
       Save with JSON.stringify(prefs, null, 2). Load with JSON.parse(await fs.readFile(...)).
       On startup, detect old .md file and migrate once, then delete it.
       Delete the regex parser entirely.
  Result: Preference values containing colons save and load correctly.

[MF-4] ✅ DONE — UX > Pre-load MediaPipe models at startup
  Files: src/renderer/src/hooks/useEyeTracker.js, src/renderer/src/App.jsx
  Problem: Models load only when the user clicks "Start Tracking" for the first time.
           The WASM + task file (~3.6 MB) takes 1-2s, during which nothing appears to happen.
  Fix: Extract model initialization into a standalone initLandmarker() async function.
       In App.jsx, call it inside a useEffect on mount, wrapped in setTimeout(fn, 2000) to
       avoid competing with startup rendering.
       Store the landmarker in a module-level ref. In useEyeTracker, skip init if already done.
       Add a small "ready" indicator in EyeTracker.jsx once preloading completes.
  Result: Clicking "Start Tracking" activates detection in < 200ms.

[MF-5] ✅ DONE — UX > Add CSV export to StatsPage
  Files: src/renderer/src/components/pages/StatsPage.jsx, src/preload/index.js, src/main/index.js
  Problem: Users have potentially months of session data (blink rates, focus scores, app usage)
           with no way to access it outside the app.
  Fix: Add IPC handler data:exportCsv in main process — accepts sessions array, converts to
       CSV string (columns: date, duration_minutes, focus_score, blink_count, blink_rate,
       away_seconds), opens dialog.showSaveDialog, writes the file.
       Expose window.api.data.exportCsv(sessions) in preload.
       Add an "Export CSV" button at the bottom of StatsPage.
  Result: Clicking Export opens a native save dialog and writes a valid CSV file.

==============================================================
NEW FEATURES — implement after foundation is stable, in order
==============================================================

[NF-1] FEAT > Adaptive Session Intelligence — fatigue warning banner
  Files (new): src/renderer/src/utils/cognitiveLoad.js
  Files (edit): src/renderer/src/hooks/usePomodoro.js, src/renderer/src/components/pages/FocusPage.jsx,
                src/renderer/src/store/index.js
  Problem: App has enough behavioral data to predict cognitive fatigue before the user notices,
           but does nothing with it mid-session.
  Fix: Add cognitiveLoadIndex (0-1) and showFatigueWarning (bool) to Zustand store.
       In usePomodoro.js, every 30s during work sessions compute:
         bpmDeviation = how far current BPM deviates from optimal bracket C (12-25 BPM), normalized 0-1
         awayRatio = awaySeconds / elapsedSeconds over last 2 minutes
         cognitiveLoadIndex = bpmDeviation * 0.6 + awayRatio * 0.4
       If index > 0.7 for 2 consecutive 30s checks, set showFatigueWarning: true.
       In FocusPage.jsx, render a dismissible banner: "Your focus pattern suggests you're
       fatiguing. Consider an early break." Auto-dismiss on break start or manual dismiss.
       Add fatigueWarningThreshold preference (default 0.7) to Settings.jsx.
  Result: Banner appears after sustained high cognitive load. Does not appear during normal
          sessions. Disappears on break start.

[NF-2] ✅ DONE — FEAT > Session Ritual — intention setting + outcome check-in
  Files (new): src/renderer/src/components/RitualModal.jsx
  Files (edit): src/renderer/src/hooks/usePomodoro.js, src/renderer/src/components/pages/FocusPage.jsx,
                src/main/persistence.js, src/renderer/src/store/index.js
  Problem: No way to set an intention before a session or reflect on it after.
           No data to correlate pre-session state with outcome quality.
  Fix: Add goal (string), moodBefore (1|2|3), outcomeRating (1|2|3) to session data structure.
       Add showRitualModal (bool) and ritualPhase ('pre'|'post') to Zustand store.
       In usePomodoro, when work starts: if ritualEnabled pref is on, set showRitualModal: true,
       ritualPhase: 'pre'. After session completes (before saving): set ritualPhase: 'post'.
       RitualModal.jsx — pre phase: text input (goal) + 3-option mood selector + optional
       8s breathing animation (CSS keyframe on a circle, no library). Post phase: 1-3 star
       outcome rating + display the user's stated goal for reflection.
       On confirm, save goal/mood/outcome into the session object before IPC save.
       Add ritualEnabled boolean preference (default false) to Settings.jsx.
       In StatsPage, add "Ritual Impact" card (visible after 5+ ritual sessions): avg focus
       score with ritual vs. without.
  Result: Modal appears on session start/end when enabled. Data persists in session JSON.
          Stats card shows after sufficient data is collected.

[NF-3] FEAT > App Distraction Fingerprinting
  Files (new): src/renderer/src/utils/distractionAnalysis.js
  Files (edit): src/renderer/src/components/pages/StatsPage.jsx, src/main/persistence.js
  Problem: App records which apps are active during focus sessions and what the focus score was,
           but never surfaces correlations. Users can't see which apps hurt their performance.
  Fix: Confirm each saved session includes appUsageDuringWork: { processName: seconds } —
       if not, capture from useAppTracker state at session end in usePomodoro.
       Create distractionAnalysis.js — computeAppImpact(sessions) function: for each app
       present in work time across ≥ 3 sessions, calculate average focus score delta vs sessions
       without that app. Return array sorted by negative impact.
       In StatsPage, add "App Impact" section (visible after 10+ sessions with app data):
       top 3 positive and top 3 negative impact apps, showing delta score (e.g. "Chrome: -18 pts avg").
       Add focusModeApps: [] array to preferences. In useAppTracker, if current app during
       work session is in focusModeApps, trigger a native notification via window.api.system.notify
       (add this IPC channel if not present).
  Result: After 10 sessions, App Impact section shows ranked data. Flagged app notification
          fires when user opens a flagged app during a Pomodoro work session.

==============================================================
IMPLEMENTATION NOTES
==============================================================

- QW-1 and MF-2 overlap: QW-1 removes the ref farm now; MF-2 slices the store later.
  Do QW-1 first — it's self-contained and unblocks nothing.
- QW-4 (blinksConfig.js) is a prerequisite for NF-1 (cognitive load uses bracket data).
- MF-3 (JSON prefs) should be done before NF-2 (ritual adds new preference fields).
- NF-3 requires appUsageDuringWork in session data — verify it's already saved in
  usePomodoro before building the analysis util. It may already be there (see FEAT-5 in ISSUES.txt).
- Documents page was deliberately removed from the app by the user. Do not re-add.
  QW-2 and QW-3 still apply — documents.js is still in main for the IPC handler.
