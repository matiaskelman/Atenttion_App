# Atenttion — Session Memory

Running log of decisions, discoveries, and context across Claude Code sessions.
Add entries at the top of each section. Keep entries concise.

---

## Pending / Next Steps

- `markitdown` not yet installed. User needs to click "pip install" on the Docs page, or run `pip install markitdown` manually.
- Nature paper (s41598-025-24264-5) is paywalled — couldn't retrieve it. If user shares it, add findings to `theoryLogic.md`.
- User wants Documents page to be for research papers only (not user-facing context docs) — clarify use case if needed.

---

## Decisions Made

### 2026-06-12 — Ritual UX overhaul + XLSX export
UX review of the pre/post session ritual found it collected data (goal, mood, outcome) but never displayed any of it. Changes:
1. **Dead state removed** — `ritualEfficiencyImportance` + setter deleted from `pomodoroSlice.js` (never read anywhere).
2. **Breathing animation rebuilt** (`RitualModal.jsx`) — old 2-phase pulse replaced with: SVG sweep arc (r=108, circumference 678.6) tracing the 8s cycle, 3 concentric ripple rings with staggered delays (0/0.08/0.18s), glowing core (box-shadow blooms on inhale), and dynamic phase text ("Breathe in / Hold / Breathe out") crossfaded by a 50ms JS interval. **Keyframe percentages (35/55/90) must match the `PHASES` array ends** — two sources of truth that sync the visual and the text.
3. **Post-ritual auto-dismiss 10s → 60s** — the real timer lives in `App.jsx` (`confirmPostRitual(null)` timeout). RitualModal shows a visual "Closing in Xs" countdown, and overlay.html's skip countdown was updated 10→60 to match. **Three places must agree: App.jsx timeout, RitualModal postCountdown, overlay.html remaining.**
4. **Goal shown during session** — FocusPage renders `ritualGoal` in a violet-tinted bar while `pomodoroMode === 'work' && pomodoroState === 'work'`.
5. **Outcome dots in StatsPage** — colored dot row (red/amber/violet = Scattered/Focused/Flow) under the Focus Duration chart; only renders if some session has `outcomeRating`.
6. **Sessions table upgraded** — Date+time stacked in first column, new Outcome column, "Show all N sessions" expand/collapse (default 8 rows).
7. **Export is now XLSX, not CSV** — `data:exportCsv` IPC channel (name kept) now writes a styled .xlsx via **exceljs (new prod dependency)**: dark violet header, alternating row fills, focus-score and outcome cells colored by value, frozen header row. Button label says "Export XLSX".
Gotcha discovered: Tailwind opacity suffixes `/6` and `/12` are not in the default scale and get silently dropped by JIT — use `/5` and `/10`.
Note: moodBefore/outcomeRating were ALREADY saved in session objects by `usePomodoro.js` — the gap was display-only.

### 2026-05-22 — Eye tracking bug fixes
Three bugs prevented blinks from being detected at all:
1. **`faceapiRef` null on remount** — `loadModels()` returned early if `modelLoaded` was already true in the store, leaving `faceapiRef.current = null` for freshly mounted hook instances. RAF loop ran forever but `runFrame` exited at the `!faceapi` guard, never detecting anything.
2. **`display:none` video element** — Tailwind `hidden` class sets `display:none`, which blocks Chromium canvas reads from the video element. Changed to off-screen absolute positioning.
3. **Silent error swallowing** — detection errors were caught and discarded; now logged to console to aid diagnosis.
Also lowered face detection score threshold from 0.4 → 0.3 for better detection sensitivity.
Created `filesExplained.txt` in project root — full documentation of every source file.

### 2026-05-22 — Theory-grounded eye tracking overhaul
Synthesized two research papers (Wu & Liu 2022, PMC5742176) into `theoryLogic.md`.
Changes made based on findings:
- **Blink interval variability (CV)** now tracked in `useEyeTracker.js` — last 20 intervals, stored as `blinkVariability` in store
- **Blink Rhythm indicator** added to EyeTracker panel: Regular (CV<0.40) / Variable (0.40–0.70) / Irregular (>0.70)
- **Eye strain thresholds** updated: < 8 BPM = danger (red), 8–12 BPM = caution (amber), based on BRV paper
- **Away threshold default** changed from 3s → 5s — Wu & Liu show ~40% of engaged time is gaze aversion (looking away while thinking is normal)
- **Focus Score** (0–100) computed per session from BPM health (55%) + blink rhythm regularity (45%), saved with sessions
- **Stats page** updated: session table now shows BPM, Rhythm, Focus Score, Away time
**Why:** Raw blink count alone doesn't differentiate cognitive states; interval variability is the real signal (BRV paper).

### 2026-05-22 — Driver navigation fix
Added `data-page` attributes to sidebar `<button>` elements in `Sidebar.jsx`.
Replaced `clickText()` nav calls in `scripts/driver.mjs` with a `navigate(pageId)` helper that uses `[data-page]` selector.
**Why:** lucide-react SVG icons inside buttons caused `textContent` matching to fail silently on System and Docs nav items.

### 2026-05-22 — App fully verified via screenshots
All 4 pages render correctly. System page reads real hardware (i7-1065G7, 31.8GB RAM, Windows). Docs page detects Python 3.14.5 but markitdown not installed. Settings sliders and Save Preferences all functional.

### 2026-05-22 — Persistence layer added
`src/main/persistence.js` — markdown-based persistence to `app.getPath('userData')`:
- `atenttion-sessions.md` — append-only session log
- `atenttion-preferences.md` — YAML frontmatter prefs, read on startup via `data:loadPreferences`

### 2026-05-22 — Settings component added
`src/renderer/src/components/Settings.jsx` — collapsible panel on FocusPage with sliders for all 4 durations + look-away threshold. Preferences loaded on mount in `FocusPage.useEffect`.

### 2026-05-22 — Removed @electron-toolkit packages
Removed `@electron-toolkit/utils` and `@electron-toolkit/preload` entirely.
**Why:** Both packages access `electron.app` at module load time, which throws when `ELECTRON_RUN_AS_NODE=1` is set in the Claude Code shell environment.

### 2026-05-22 — Vite version pinned to ^5.4.11
**Why:** `electron-vite@2.3.0` requires `vite@"^4.0.0 || ^5.0.0"`. Default `npm create electron-vite` was installing vite 6 which caused peer dep failure.

### 2026-05-22 — ELECTRON_RUN_AS_NODE workaround
Created `scripts/dev.js` which deletes `process.env.ELECTRON_RUN_AS_NODE` before spawning `electron-vite dev`.
`npm run dev` → `node scripts/dev.js` (not `electron-vite dev` directly).
For one-off commands: `$env:ELECTRON_RUN_AS_NODE = $null` in PowerShell or `env -u ELECTRON_RUN_AS_NODE` in bash.

---

## Known Issues

| # | Issue | Status |
|---|---|---|
| 1 | GPU cache errors on startup (`Unable to move the cache: Acceso denegado`) | Benign, Windows permission warning, safe to ignore |
| 2 | PowerShell active window detection slow (~2-3s) | By design, polled every 5s |
| 3 | face-api models gitignored, generated by `npm install` | Expected — `scripts/setup-models.js` handles this |
| 4 | `markitdown` requires Python | Graceful degradation — txt/md/html work without it |

---

## Environment Notes

- **OS:** Windows 11 Pro (also targets macOS)
- **Node:** check with `node --version`
- **Python:** 3.14.5 (detected by Docs page)
- **Electron binary:** `node_modules/electron/dist/electron.exe`
- **userData path:** `%APPDATA%\atenttion-app\` (where sessions + prefs markdown files live)
- **Screenshot output:** `C:/Users/Usuario/AppData/Local/Temp/atenttion-shots/` (Playwright driver)

---

## Files to Know

| File | Purpose |
|---|---|
| `scripts/dev.js` | CRITICAL launcher — clears ELECTRON_RUN_AS_NODE before electron-vite |
| `scripts/driver.mjs` | Playwright driver — launch app headlessly, take screenshots |
| `scripts/setup-models.js` | Copies face-api .bin model files from node_modules to public/models/ |
| `src/main/persistence.js` | Markdown read/write for sessions + preferences |
| `src/renderer/src/store/index.js` | All Zustand state — single flat store |
| `src/renderer/src/hooks/useEyeTracker.js` | face-api detection loop, EAR blink detection |
| `src/renderer/src/hooks/usePomodoro.js` | Timer state machine, session completion |
