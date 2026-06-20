# Atenttion App — Deep Review (Functionality · Code · Security)

**Reviewer:** Claude (Opus 4.8) · **Date:** 2026-06-17 · **Branch:** `main` · **Version:** 1.0.0

This is a brutally honest, full-codebase review. Tasks are ordered **easiest to change first, hardest last**.
Each task is self-contained with file paths, line references, rationale, and a step-by-step Claude Code can execute.

> ⚠️ **Read this first:** ordering is by *effort/risk*, not by *importance*. The single most important
> security item (Electron upgrade, **TASK 17**) is near the bottom because it is the riskiest to change.
> If you only do three things before going public, do **TASK 17 (Electron), TASK 11 (Python injection),
> and TASK 14 (focus-wallpaper permanent-black bug)**.

---

## Honest verdict

This is a genuinely impressive solo project. The eye-tracking pipeline (adaptive EAR calibration, leaky
phone-detection accumulator, typing veto via system idle-time, drift-aware focus scoring) is well beyond
what most "Pomodoro + webcam" apps attempt, and it's unusually well-commented. Electron security hygiene
is mostly correct: `contextIsolation: true`, `nodeIntegration: false`, a real CSP on the main renderer,
a `setWindowOpenHandler` that denies popups, and a scoped permission handler.

But it is **not release-ready**, and the gaps cluster in predictable places for a fast-moving solo build:

- **Zero automated tests** for code whose entire value proposition is a subtle scoring algorithm.
- **A dead feature (Documents) whose attack surface is still live** — the UI was removed but the IPC
  handlers (with a Python code-injection bug and an unrestricted URL fetch) are still registered.
- **Outdated Electron (33)** with 18 high-severity advisories against it.
- **Performance footguns** — the hottest components subscribe to the entire Zustand store and re-render
  ~30×/second during a focus session.
- **A wallpaper feature that can permanently black out the user's desktop** if the app is killed mid-session.
- **Test/debug scaffolding shipped to production** (30-second timer shortcut, F12 DevTools, an "Eye Debug" page,
  `PHONE_TRIGGER_MS` left at its 3 s test value).

None of these are hard to fix. The list below is the path.

---

## Benchmarking & baseline

Measured on this checkout (`npm audit`, `npm outdated`, `wc -l`, static inspection):

| Metric | This project | Healthy baseline | Verdict |
|---|---|---|---|
| App source (JS/JSX/MJS) | ~6,577 LoC | — | Lean for the feature set |
| Production dependencies | 5 | <15 | ✅ Excellent restraint |
| Largest single file | `useEyeTracker.js` — **749 LoC**, one ~450-line function | <300 LoC/file | ❌ Hard to test/maintain |
| Automated tests | **0** | ≥ pure-logic coverage | ❌ Critical gap |
| Linter / formatter config | **none** | ESLint + Prettier | ❌ Missing |
| Type checking (TS/JSDoc) | none | optional | ⚠️ Acceptable at this size |
| `npm audit` high-severity | **electron, tar, form-data** (+ moderate: esbuild, vite, js-yaml, @babel/core) | 0 | ❌ Needs attention |
| Electron version | **33.4.11** | latest (42.x) — 9 major versions behind | ❌ 18 advisories |
| CSP coverage | main renderer ✅ / overlay.html ❌ | all windows | ⚠️ Partial |
| Hot-path re-renders | `EyeTracker`/`FocusPage` re-render ~30×/s (whole-store subscription) | only on relevant change | ❌ Wasteful |
| Dead code | `DocumentsPage` + `documents.js` IPC + store doc actions | 0 | ❌ Live attack surface |

**Outdated majors** (informational — not all worth chasing): react 18→19, recharts 2→3, tailwind 3→4,
vite 5→8, lucide 0.46→1, electron-builder 25→26.

**Severity legend:** 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low/Polish
**Effort:** ⏱️ minutes · ⏳ ~1 hr · 🛠️ half-day+

---

# TASKS (easiest → hardest)

---

## TASK 1 — Gate F12 DevTools behind dev mode 🟡 ⏱️
**Category:** Security / polish · **File:** [src/main/index.js:37-39](src/main/index.js#L37-L39)

**Problem.** Production builds ship a hotkey that opens Chromium DevTools:
```js
mainWindow.webContents.on('before-input-event', (_, input) => {
  if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools()
})
```
This lets any end user (or anyone at their machine) pop a full JS console into the app, inspect IPC, and poke
at internal state. Fine in dev, not in a shipped product.

**Why it matters.** It widens the renderer attack surface and exposes internals; combined with `sandbox: false`
(TASK 18) it's an easy lever for tampering.

**Steps.**
1. The file already computes `const isDev = process.env.NODE_ENV === 'development'` at line 57, but that is
   *below* the listener. Move the `isDev` definition up, or inline the check.
2. Wrap the toggle so it only registers in dev:
   ```js
   if (process.env.NODE_ENV === 'development') {
     mainWindow.webContents.on('before-input-event', (_, input) => {
       if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools()
     })
   }
   ```
3. **Verify:** `npm run build` then run the packaged app — F12 does nothing. In `npm run dev`, F12 still opens DevTools.

---

## TASK 2 — Restore `PHONE_TRIGGER_MS` to its production value 🟡 ⏱️
**Category:** Functionality · **File:** [src/renderer/src/hooks/useEyeTracker.js:30](src/renderer/src/hooks/useEyeTracker.js#L30)

**Problem.** `const PHONE_TRIGGER_MS = 3000` is the *testing* value. Project memory explicitly records this as a
pre-release item: restore `3000 → 10000`. At 3 s, normal "glance down at the keyboard/notes" behavior trips the
phone-detection pause far too aggressively for real users.

**Steps.**
1. Change line 30 to `const PHONE_TRIGGER_MS = 10000`.
2. Sanity-check related comments on lines 28-34 still read correctly (decay factor, resume cancel) — they do.
3. **Verify:** start a focus session, look down at the desk for ~4 s — timer should **not** pause. Hold a phone
   in view ~10 s — timer pauses with the phone alert.
4. Update the memory note `project_action_items.md` to mark this done.

---

## TASK 3 — Remove the 30-second test shortcut from Settings 🔵 ⏱️
**Category:** Polish · **File:** [src/renderer/src/components/Settings.jsx:112-136](src/renderer/src/components/Settings.jsx#L112-L136)

**Problem.** The "Work session" row has a literal `30s` test button that sets `workDuration` to 30 seconds, plus
special-case slider math (`workDuration < 60 ? ...`). This is developer scaffolding leaking into the shipping UI.

**Why it matters.** Confusing to users; lets sessions be created that are too short to be meaningful and that
muddy the stats/scoring (`SCORE_CONFIG.MIN_PRESENT` is 60 s, so 30 s sessions never score anyway).

**Steps.**
1. Replace the inline custom work-session block (lines 113-136) with a standard `<MinuteSlider>` like the others:
   ```jsx
   <MinuteSlider label="Work session" value={workDuration}
     onChange={(v) => { if (!isRunning) setWorkDuration(v) }} min={5} max={60} />
   ```
2. Delete the `30s` button and the `workDuration < 60` special cases.
3. (Optional, keep for yourself) If you still want a quick test path, gate it behind
   `import.meta.env.DEV` so it never renders in production.
4. **Verify:** Settings shows a clean 5–60 min slider; production build has no 30s button.

---

## TASK 4 — Add a CSP to the overlay window 🟡 ⏱️
**Category:** Security · **File:** [src/renderer/public/overlay.html](src/renderer/public/overlay.html)

**Problem.** The main renderer has a strict CSP ([index.html:6](src/renderer/index.html#L6)), but `overlay.html`
has **none** and uses a large inline `<script>` and inline `<style>`. The overlay only renders local trusted
content, so risk is low today — but it's an inconsistent posture and the inline script means you can't tighten
later without refactoring.

**Steps.**
1. Add a CSP `<meta>` to `<head>` (the overlay needs inline styles + its own inline script, so allow
   `'unsafe-inline'` only for what it uses, and nothing external):
   ```html
   <meta http-equiv="Content-Security-Policy"
     content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:;" />
   ```
2. **Stretch (recommended):** move the inline `<script>` (lines 240-344) into `src/preload/overlay.js`'s
   companion or a separate `overlay.client.js` loaded via `<script src>`, then drop `'unsafe-inline'` from
   `script-src`. This is more work; the meta tag alone is the quick win.
3. **Verify:** minimize the app → overlay still shows the ring, phone morph, and rating card; no CSP violations
   in the overlay's console.

---

## TASK 5 — Fix the stale "10 s" auto-dismiss comment 🔵 ⏱️ — ✅ DONE (2026-06-18)
**Category:** Code clarity · **File:** [src/renderer/src/App.jsx:43-48](src/renderer/src/App.jsx#L43-L48)

> **Done:** Comment now reads "Auto-dismiss post-ritual modal after 60 s with no response" and notes the
> three timers that must agree. Verified all three are 60: App.jsx `60000`, RitualModal `postCountdown=60`,
> overlay.html `startCountdown` `remaining = 60`.

**Problem.** The comment says *"Auto-dismiss post-ritual modal after 10 s"* but the code uses `60000` (60 s),
which matches the overlay countdown (`startCountdown` begins at 60). Project memory warns these three timers
(App.jsx real timer, RitualModal visual, overlay.html visual) **must agree**. The comment lies about the value.

**Steps.**
1. Update the comment to `// Auto-dismiss post-ritual modal after 60 s with no response`.
2. While here, confirm the three timers agree: App.jsx `60000`, overlay.html `startCountdown` (`remaining = 60`),
   and any countdown text in `RitualModal.jsx`. If RitualModal shows a different number, align it.
3. **Verify:** trigger a post-session ritual, don't respond — modal and overlay both count down from 60 and
   dismiss together.

---

## TASK 6 — Add a React error boundary 🟡 ⏳
**Category:** Stability · **Files:** new `src/renderer/src/components/ErrorBoundary.jsx`, [src/renderer/src/main.jsx](src/renderer/src/main.jsx)

**Problem.** There is no error boundary anywhere. Any render-time throw in any component (e.g. a malformed session
object reaching a chart, a recharts edge case) blanks the **entire** app to a white/black screen with no recovery.

**Why it matters.** A focus app that occasionally shows a blank window destroys trust. Persistence already
guards against malformed session JSON ([persistence.js:107-125](src/main/persistence.js#L107-L125)) — the UI should
be equally defensive.

**Steps.**
1. Create `ErrorBoundary.jsx`:
   ```jsx
   import { Component } from 'react'
   export default class ErrorBoundary extends Component {
     state = { error: null }
     static getDerivedStateFromError(error) { return { error } }
     componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
     render() {
       if (this.state.error) {
         return (
           <div className="flex flex-col items-center justify-center h-screen gap-3 text-neutral-300 p-8 text-center">
             <p className="text-sm font-semibold">Something went wrong.</p>
             <p className="text-xs text-neutral-500 max-w-md break-words">{String(this.state.error?.message || this.state.error)}</p>
             <button className="btn btn-primary mt-2" onClick={() => this.setState({ error: null })}>Try again</button>
           </div>
         )
       }
       return this.props.children
     }
   }
   ```
2. In `main.jsx`, wrap `<App />` with `<ErrorBoundary>`.
3. **Verify:** temporarily `throw new Error('test')` in a page component → you see the fallback, not a blank window. Remove the test throw.

---

## TASK 7 — Stop writing per-frame debug values to the store when the debug page is closed 🟡 ⏳
**Category:** Performance · **File:** [src/renderer/src/hooks/useEyeTracker.js:330-338](src/renderer/src/hooks/useEyeTracker.js#L330-L338)

**Problem.** Every detection frame (~30×/s) the tracker writes 8 debug-only fields to Zustand
(`setLiveEar`, `setEarThreshold`, `setLiveYaw`, `setLivePitch`, `setLiveGaze`, `setLiveJawOpen`,
`setCalibrationProgress`, `setCalibrationSampleCount`). The comment says *"always update so the debug page shows
live values"* — but those values are **only** consumed by `EyeDebugPage`, which is usually closed.

**Why it matters.** Each `set()` notifies every store subscriber. Combined with TASK 8, this is what makes the
focus screen re-render ~30×/s. Gating these writes is the cheap half of the perf fix.

**Steps.**
1. Read the active page once per frame from the store (it's already in the store as `page`):
   ```js
   const debugActive = s.page === 'eyedebug'
   ```
2. Wrap lines 330-338 in `if (debugActive) { ... }`. Keep `setEyeStatus`, `setBlinkCount`, `setBlinkRate`,
   `setBlinkVariability`, `setLiveFocusScore` **outside** the guard — those drive the always-visible EyeTracker card.
3. Note the recal block also calls `s.setEarThreshold(...)` (lines 314, 512) — leave those; they're infrequent.
4. **Verify:** open EyeDebugPage → live EAR/yaw/pitch charts still update. Switch to Focus page → confirm via React
   DevTools Profiler that `EyeTracker` no longer re-renders every frame (after TASK 8 too).

---

## TASK 8 — Replace whole-store subscriptions in hot components with selectors 🟠 ⏳
**Category:** Performance · **Files:** [EyeTracker.jsx:26-30](src/renderer/src/components/EyeTracker.jsx#L26-L30), [FocusPage.jsx:9](src/renderer/src/components/pages/FocusPage.jsx#L9) (also Pomodoro.jsx, Sidebar.jsx, Settings.jsx, DocumentsPage.jsx, SystemPage.jsx)

**Problem.** `const { ... } = useStore()` with **no selector** subscribes the component to the *entire* store, so it
re-renders on *any* state change. `EyeTracker` and `FocusPage` are mounted during every focus session while the
tracker mutates store fields ~30×/s (blink rate, focus score, and — until TASK 7 — debug fields, plus the
per-frame `addCogScore` which writes `cogScoreWeightedSum`/`cogScorePresentMs`). Result: both components re-render
up to ~30×/s for data they don't even display. The `eyeTrackerSlice` even warns *"DO NOT select these in a
component — they update ~30×/s"* — but the no-selector subscription pulls them in implicitly.

**Why it matters.** This is the clearest measurable inefficiency in the app. Selector-based subscriptions are the
idiomatic Zustand fix and project memory already documents this exact pitfall (`feedback_store_subscriptions`).

**Steps.**
1. In `EyeTracker.jsx`, replace the destructured `useStore()` with individual selectors (or one `useShallow`):
   ```js
   import { useShallow } from 'zustand/react/shallow'
   const { eyeTrackingActive, eyeStatus, blinkCount, blinkRate, blinkVariability,
     liveFocusScore, modelLoaded, modelLoading, lookingAwaySeconds, camError, modelError, phoneDetected } =
     useStore(useShallow((s) => ({
       eyeTrackingActive: s.eyeTrackingActive, eyeStatus: s.eyeStatus, blinkCount: s.blinkCount,
       blinkRate: s.blinkRate, blinkVariability: s.blinkVariability, liveFocusScore: s.liveFocusScore,
       modelLoaded: s.modelLoaded, modelLoading: s.modelLoading, lookingAwaySeconds: s.lookingAwaySeconds,
       camError: s.camError, modelError: s.modelError, phoneDetected: s.phoneDetected,
     })))
   ```
   This still re-renders when `blinkRate`/`liveFocusScore` change (a few times per minute) but **not** on the
   per-frame EAR/cogScore churn.
2. Do the same for `FocusPage.jsx` (line 9), `Pomodoro.jsx` (line 18), `Sidebar.jsx` (line 13), `Settings.jsx`
   (line 57), `SystemPage.jsx` (line 17). `DocumentsPage.jsx` is being deleted in TASK 9 — skip it.
3. **Verify:** React DevTools Profiler during a live session — `FocusPage`/`EyeTracker` render only when their
   displayed values change, not every frame. App should feel snappier and use less CPU during tracking.

---

## TASK 9 — Remove the dead Documents feature (UI + live IPC + store actions) 🟠 ⏳ — ✅ DONE (2026-06-18)
**Category:** Dead code / **security surface** · **Files:** `DocumentsPage.jsx`, [documents.js](src/main/documents.js), [index.js:6,189](src/main/index.js#L189), [preload/index.js:29-35](src/preload/index.js#L29-L35), session/system store doc actions

> **Done (removal path):** Deleted `DocumentsPage.jsx` and `src/main/documents.js`; removed the
> `setupDocumentsIPC` import + call from `src/main/index.js` and the entire `docs:` block from
> `src/preload/index.js`. This also retires the Python code-injection (TASK 11) and unrestricted-fetch
> (TASK 12) surface — those tasks are now N/A. Grep confirms no remaining JS references to
> `docs.*` / `convertFile` / `convertUrl` / `DocumentsPage` / `setupDocumentsIPC`. Updated `CLAUDE.md`
> (IPC table, file tree, Document Ingestion section, markitdown known-issue) and `filesExplained.txt`.
> `npm run build` succeeds; main bundle shrank from prior size. **Note:** README.md and docs/ARCHITECTURE.md
> still describe the Documents feature — out of scope for this task (those weren't named in the steps).

**Problem.** `DocumentsPage.jsx` is **unreachable** — it's not in the `App.jsx` page router and not in the Sidebar
nav. The V2 action plan even calls it "for a removed [feature]". **However, `setupDocumentsIPC()` is still called**
([index.js:189](src/main/index.js#L189)), so the `docs:convertFile`, `docs:convertUrl`, `docs:installMarkitdown`,
and `docs:pickFile` IPC handlers are **live**. That means the most dangerous code in the repo (Python code
injection — TASK 11; unrestricted URL fetch — TASK 12; a UI-triggered `pip install` — [documents.js:101-108](src/main/documents.js#L101-L108))
is shippable attack surface for *no working feature*.

**Decision point.** Either (a) **remove it** (recommended — fastest, shrinks attack surface and bundle), or
(b) **wire it back up** and then do TASKS 11 & 12 to harden it. This task assumes removal.

**Steps (removal).**
1. Delete `src/renderer/src/components/pages/DocumentsPage.jsx`.
2. In `src/main/index.js`: remove the `import { setupDocumentsIPC } from './documents'` (line 6) and the
   `setupDocumentsIPC()` call (line 189). Delete `src/main/documents.js`.
3. In `src/preload/index.js`: remove the entire `docs: { ... }` block (lines 29-35).
4. In the store: the `documents`/`addDocument`/`removeDocument` actions were **already removed** in a prior
   cleanup, so `DocumentsPage.jsx` currently references undefined functions (harmless only because the page is
   unreachable). Nothing to delete in the store — just grep to confirm no slice redefines them.
5. Grep to confirm no dangling references: `docs\.`, `addDocument`, `DocumentsPage`, `convertUrl`, `convertFile`.
6. Update `CLAUDE.md` (the IPC table lists `docs:*` channels) and `filesExplained.txt` to drop the Documents rows.
7. **Verify:** `npm run build` succeeds; app runs; no `documents`-related console errors.

> If you choose (b) wire it up instead: add a `documents` entry to the Sidebar `nav` array and an
> `{page === 'documents' && <DocumentsPage />}` route in App.jsx — **but you must then complete TASKS 11 and 12.**

---

## TASK 10 — Add ESLint + Prettier 🟡 ⏳
**Category:** Code quality / consistency · **Files:** new `eslint.config.js`, `.prettierrc`, `package.json`

**Problem.** No linter, no formatter. For a 6.5k-LoC React/Electron app this means style drift, unused-variable
rot, and missed `react-hooks/exhaustive-deps` bugs (several `useEffect`s in App.jsx have intentionally trimmed
dep arrays — a linter would let you mark those explicitly instead of silently).

**Steps.**
1. `npm i -D eslint @eslint/js eslint-plugin-react eslint-plugin-react-hooks prettier eslint-config-prettier`
2. Add a flat `eslint.config.js` with the recommended React + hooks rulesets, `env` for browser (renderer) and
   node (main/scripts), and `eslint-config-prettier` last.
3. Add scripts: `"lint": "eslint ."`, `"format": "prettier --write ."`.
4. Add a `.prettierrc` matching the existing style (no semicolons, single quotes, 2-space — the code already
   follows this).
5. Run `npm run lint`, triage findings. For the deliberately-trimmed hook deps, add targeted
   `// eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line reason rather than blanket-disabling.
6. **Verify:** `npm run lint` passes (or only has acknowledged disables); CI can later run it.

---

## TASK 11 — Fix Python code injection in the document converter 🟠 ⏳ — ⏭️ N/A (obsoleted by TASK 9, 2026-06-18)
**Category:** Security · **File:** [src/main/documents.js:36-62](src/main/documents.js#L36-L62)
**(Skip if you removed Documents in TASK 9.)** — `documents.js` was deleted, so this surface no longer exists.

**Problem.** `convertWithMarkitdown` and `convertWithMarkitdownUrl` build a Python program by **string-interpolating
user input** into source code:
```js
const result = await spawnAsync('python', ['-c', `
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("${filePath.replace(/\\/g, '\\\\')}")   // filePath: only backslash-escaped
print(result.text_content)
`])
```
The URL variant interpolates `url` with **no escaping at all**. A path/URL containing `"` (or `");import os;...`)
breaks out of the string literal and executes arbitrary Python in the spawned interpreter. The file path comes
from a picker (semi-trusted) but the URL field is free text.

**Why it matters.** It's local code execution in a child process driven by attacker-influenceable input (e.g. a
crafted link a user is tricked into pasting). Even though `spawn` with an args array avoids *shell* injection, the
*Python source* is still injectable.

**Steps.**
1. Stop interpolating into source. Pass the value as a real argument and read it with `sys.argv`:
   ```js
   async function convertWithMarkitdown(target) {
     const py = [
       'import sys',
       'from markitdown import MarkItDown',
       'print(MarkItDown().convert(sys.argv[1]).text_content)',
     ].join('\n')
     const result = await spawnAsync('python', ['-c', py, target], { timeout: 30000, windowsHide: true })
     if (result.status !== 0) throw new Error(result.stderr || 'markitdown conversion failed')
     return result.stdout
   }
   ```
2. Use the same function for both file path and URL (markitdown accepts both) — delete `convertWithMarkitdownUrl`.
3. **Verify:** convert a file whose name contains a `"` character and a URL containing `");` — both convert
   normally (or fail cleanly), with no injected behavior.

---

## TASK 12 — Restrict URL fetching (scheme allowlist + block private hosts) 🟠 ⏳ — ⏭️ N/A (obsoleted by TASK 9, 2026-06-18)
**Category:** Security (SSRF) · **File:** [src/main/documents.js:68-92,146-158](src/main/documents.js#L68-L92)
**(Skip if you removed Documents in TASK 9.)** — `documents.js` was deleted, so this surface no longer exists.

**Problem.** `convertUrl` → `fetchUrl` fetches **any** string the user types with no validation. There's no scheme
check (so `file://`, `gopher://` etc. depending on the path), and no block on `localhost`/`127.0.0.1`/`169.254.x`/
RFC-1918 ranges. A malicious "article link" could probe the user's LAN, cloud metadata endpoints, or local admin
panels and return the response into the app.

**Steps.**
1. At the top of `fetchUrl` (and before `convertWithMarkitdownUrl`), validate:
   ```js
   const u = new URL(url)                          // throws on garbage
   if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) URLs are allowed')
   const host = u.hostname
   if (/^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|::1)/.test(host) ||
       /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error('Private/loopback addresses are not allowed')
   ```
2. Keep the existing 15 s `AbortController` timeout and the HTML-stripping fallback.
3. (Defense in depth) cap the response size — abort if the body exceeds, say, 5 MB.
4. **Verify:** `http://localhost:1234` and `file:///etc/passwd` are rejected with a clear error; a normal article
   URL still imports.

---

## TASK 13 — Harden the PowerShell wallpaper command construction 🟡 ⏳
**Category:** Security / robustness · **File:** [src/main/systemInfo.js:285-304](src/main/systemInfo.js#L285-L304)

**Problem.** `setWallpaper` builds one big PowerShell `-Command` string via `execSync` (a shell) with the image path
interpolated in. It does escape backslashes and single quotes for the PS single-quoted literal, which is *mostly*
correct — but it's fragile string-built shell code, and the same pattern recurs in `getCurrentWallpaper`. The path
isn't user-typed today (it comes from the registry or the generated focus-wallpaper file), so severity is moderate,
not critical — but it's the kind of thing that becomes a hole the moment someone adds a "pick custom wallpaper" feature.

**Steps.**
1. Prefer passing the path as a parameter instead of inlining it. Use `spawn`/`execFile` with an args array and a
   script that reads `$args[0]`:
   ```js
   // pseudo: spawn('powershell', ['-NoProfile','-NonInteractive','-Command', script, imagePath], {windowsHide:true})
   // inside script: ... SystemParametersInfo(20,0,$args[0],3) ...
   ```
2. Keep the existing 5 s timeout and `{ success, error }` return shape.
3. Apply the same parameterization to `getCurrentWallpaper` and the macOS `osascript` branch
   (osascript supports passing args after the script with `-` and `on run argv`).
4. **Verify:** focus-wallpaper enable/disable still swaps and restores correctly on Windows and macOS.

---

## TASK 14 — Prevent the focus wallpaper from permanently blacking out the desktop 🟠 ⏳ — ✅ DONE (2026-06-18)
**Category:** Functionality (data-loss-class bug) · **Files:** [App.jsx:81-157](src/renderer/src/App.jsx#L81-L157), [systemInfo.js:168-191,275-283](src/main/systemInfo.js#L168-L191)

> **Done:** Added crash-safety in `src/main/systemInfo.js`:
> - New `system:captureOriginalWallpaper` IPC: reads the live wallpaper but **never** returns the black
>   focus PNG (`isFocusWallpaper()` compares against `userData/focus-wallpaper.png`), and persists the
>   captured original to disk (`userData/original-wallpaper.json`) so it survives restarts.
> - Startup recovery: `restoreOriginalIfFocusActive()` (deferred 1.5 s so it never blocks first paint)
>   restores the persisted original if the desktop is still the black PNG from a prior force-kill.
> - `before-quit` backstop (gated on an in-memory `focusWallpaperActive` flag, so normal quits pay no cost)
>   restores the original if the renderer's unmount cleanup didn't run.
> - `setWallpaper` refactored to a shared `applyWallpaper()` helper and tracks the active flag.
> - `App.jsx` now calls `captureOriginalWallpaper()` at both capture sites instead of the raw
>   `getCurrentWallpaper()`, so the focus PNG can never be saved as "original".
> **Deviation from step 1:** persisted to a dedicated `original-wallpaper.json` (main-process owned) rather
> than the renderer prefs JSON — decouples crash recovery from the renderer/prefs round-trip and keeps a
> machine-specific absolute path out of the user prefs file (and out of TASK 15's `buildPrefs`).

**Problem.** When `focusWallpaperEnabled` is on, the app saves the original wallpaper into the Zustand store
(in-memory only) and swaps in a generated black PNG. The original is **restored only** on work-end or component
unmount ([App.jsx:127-157](src/renderer/src/App.jsx#L127-L157)). If the app is **force-killed or crashes mid-session**:
- the desktop stays black, and
- on next launch `getCurrentWallpaper()` reads the registry, which now points at `focus-wallpaper.png`, and the app
  saves **that** as the new "original" ([App.jsx:81-86](src/renderer/src/App.jsx#L81-L86)). The real wallpaper is lost
  permanently.

**Why it matters.** This silently destroys a user setting and looks like the app broke their PC. It's opt-in
(default off), but for anyone who enables it, one crash = permanent black desktop.

**Steps.**
1. **Persist** the original wallpaper path to disk (preferences JSON) the first time it's captured — not just to
   the store — so it survives restarts.
2. When capturing the original, **reject the focus wallpaper path**: if `getCurrentWallpaper()` returns a path that
   ends in `focus-wallpaper.png` (compare against `path.join(userData, 'focus-wallpaper.png')`), do **not** save it
   as original; instead fall back to the persisted original (or leave original unset and skip swapping).
3. On app startup, if a persisted original exists **and** the current wallpaper is the focus PNG, restore the
   original immediately (recovers from a prior crash).
4. Consider restoring on `before-quit`/`window-all-closed` in the **main** process as a backstop (the renderer
   unmount cleanup doesn't run on a hard kill, but a graceful quit should still restore).
5. **Verify:** enable focus wallpaper, start a session, `kill` the app process, relaunch → original wallpaper is
   restored (or at minimum never overwritten as "original").

---

## TASK 15 — De-duplicate the `savePreferences` payload (preferences-completeness footgun) 🟡 ⏳ — ✅ DONE (2026-06-18)
**Category:** Code quality / correctness · **File:** [src/renderer/src/hooks/usePomodoro.js](src/renderer/src/hooks/usePomodoro.js) (4 call sites: lines 131-145, 205-219, 304-318; also [Settings.jsx:66-71](src/renderer/src/components/Settings.jsx#L66-L71))

> **Done:** Added `buildPrefs(s, extra)` in new `src/renderer/src/utils/prefs.js` (the canonical full
> payload, incl. `streak`/`bestStreak`/`lastSessionDate`). Replaced all three inline payloads in
> `usePomodoro.js` and the one in `Settings.jsx`. **Bugs fixed:** the two `usePomodoro` copies that
> hardcoded `focusWallpaperEnabled: false` now read the real value (`s.focusWallpaperEnabled`), so
> completing/skipping a session no longer silently flips the wallpaper setting off; and `Settings.jsx`'s
> save previously omitted `bestStreak`, which would reset it — now included. Removed the now-unused
> `streak`/`lastSessionDate` destructure from Settings.jsx. `npm run build` green.

**Problem.** The full preferences object is hand-written in **four** places. Project memory
(`feedback_prefs_completeness`) records the rule: *every `savePreferences` call must include ALL fields or a partial
save silently resets data.* Two of the `usePomodoro` copies even hardcode `focusWallpaperEnabled: false` while the
third uses `s.focusWallpaperEnabled` — an inconsistency that means completing a session can silently flip a user's
wallpaper preference off.

**Steps.**
1. Add a single helper in the store (or a shared util) that builds the canonical prefs object from state:
   ```js
   // in store or a util
   export const buildPrefs = (s, extra = {}) => ({
     workDuration: s.workDuration, shortBreakDuration: s.shortBreakDuration,
     longBreakDuration: s.longBreakDuration, eyeAwayThresholdMs: s.eyeAwayThresholdMs,
     notifyOnAutoPause: s.notifyOnAutoPause, soundOnAutoPause: s.soundOnAutoPause,
     dailyGoalSeconds: s.dailyGoalSeconds, ritualEnabled: s.ritualEnabled,
     focusWallpaperEnabled: s.focusWallpaperEnabled, autoStartEyeTracking: s.autoStartEyeTracking,
     overlayEnabled: s.overlayEnabled, streak: s.streak, lastSessionDate: s.lastSessionDate,
     ...extra,
   })
   ```
2. Replace all four inline payloads with `window.api?.data.savePreferences(buildPrefs(s, { streak: newStreak, lastSessionDate: today }))`.
3. **Fix the `focusWallpaperEnabled: false` bug**: with the helper it now reads the real value. Confirm that's
   the intended behavior (it is — session completion shouldn't change the wallpaper setting).
4. **Verify:** toggle focus-wallpaper ON, complete a session, restart → setting is still ON.

---

## TASK 16 — Add a unit-test harness and cover the pure logic 🟠 🛠️
**Category:** Testing · **Files:** new `*.test.js`, `package.json`, `vitest` config

**Problem.** Zero tests. The app's differentiator is its scoring/bracket math and persistence parsing — all of which
are **pure, deterministic, and trivially testable**, yet untested. Any future tuning of `blinksConfig.js` or
`focusScore.js` (which happens often, per the memory log) risks silent regressions.

**Highest-value targets (all pure):**
- `src/renderer/src/utils/focusScore.js` — `computeFocusScore`, `computeSessionScore`
- `src/renderer/src/constants/blinksConfig.js` — `findBracket` (boundary cases: 0, 6, 12, 26, 46, 66, >66)
- `src/main/persistence.js` — `validateSessions`, `parseLegacyYaml`, `formatDuration`
- `src/renderer/src/utils/format.js`
- `src/renderer/src/store/slices/sessionSlice.js` — `updateStreak` (consecutive day, gap, same day, first ever)

**Steps.**
1. `npm i -D vitest` and add `"test": "vitest run"`, `"test:watch": "vitest"`.
2. Vitest reads `vite`/`electron-vite` config fine; for renderer-only pure modules no DOM is needed (default node env).
3. Write `focusScore.test.js` first — assert bracket C (12–26 BPM) peaks at 100, bracket A is penalized, `null`
   returns for `bpm=0`, and `computeSessionScore` withholds (`{score:null}`) below `MIN_PRESENT`/`MIN_BLINKS`.
4. Add `blinksConfig.test.js` covering every boundary (especially `findBracket(26)` → D not C, `findBracket(66)` → F).
5. Add `persistence` tests for malformed-session filtering and legacy-YAML migration.
6. Add `updateStreak` tests for the four date cases.
7. **Verify:** `npm run test` is green; wire it into `.github/workflows/build.yml` as a pre-build step (TASK 19 area).

---

## TASK 17 — Upgrade Electron (and the build toolchain) to clear the security advisories 🔴 🛠️
**Category:** Security (highest impact) · **Files:** `package.json`, `package-lock.json`, regression test pass

**Problem.** `npm audit` reports **Electron 33 with 18 advisories** (multiple use-after-free, ASAR integrity bypass,
HTTP response-header injection in custom protocol handlers — and this app uses **two** custom protocols, `models://`
and `sounds://`). It also flags `tar` (high), `form-data` (high, via electron-builder), and moderate `esbuild`/`vite`/
`js-yaml`/`@babel/core`. This is the single most important security item; it's last only because a 9-major-version
Electron jump is the riskiest change and needs a full manual regression pass.

**Why it matters.** Custom-protocol header injection is directly relevant to your `protocol.handle` implementations.
Shipping a public app on a 9-versions-old Electron with known high-severity CVEs is the headline risk.

**Steps.**
1. Do this on a branch. Bump in stages, building + smoke-testing between each:
   - `electron` 33 → latest 33.x patch first (cheap, low-risk), retest.
   - then to the current stable major (42.x). Read the Electron breaking-changes notes for 34→42.
   - bump `electron-builder` 25 → 26 and `electron-vite` 2 → current (this also pulls fixed `vite`/`esbuild`).
2. Run `npm audit` again; for anything left, `npm audit fix` (non-breaking) and re-evaluate.
3. **Regression-test the Electron-touching paths manually** (no test covers these): custom `models://` + `sounds://`
   protocol loading in a *packaged* build, camera permission grant, frameless window controls, the overlay window,
   wallpaper set/restore, notifications, and `app.getFileIcon`. Pay attention to the `protocol.handle` response
   headers given the header-injection advisory.
4. Watch the `@electron-toolkit` landmine documented in CLAUDE.md — don't let an upgrade reintroduce it.
5. **Verify:** `npm audit` shows 0 high; packaged Win + Mac builds run end-to-end.

> Keep this independent of TASK 18/20 so a regression is easy to bisect.

---

## TASK 18 — Evaluate enabling the renderer sandbox 🟡 🛠️
**Category:** Security · **File:** [src/main/index.js:28](src/main/index.js#L28)

**Problem.** The main window sets `sandbox: false`. With `contextIsolation: true` and `nodeIntegration: false` the
app is still reasonably safe, but the sandbox is a major additional layer (it confines the renderer's OS access).
It's almost certainly set to `false` because the preload uses ESM/`require` patterns that the sandbox restricts.

**Steps.**
1. Try `sandbox: true`. The preload (`src/preload/index.js`) only uses `contextBridge` + `ipcRenderer`, which are
   sandbox-compatible — it may "just work."
2. If the preload fails to load under the sandbox, the usual fix is ensuring the preload is bundled to CommonJS
   (electron-vite does this) and avoiding Node APIs in preload (it already does).
3. The overlay preload (`src/preload/overlay.js`) is even simpler and should sandbox cleanly — enable it there too
   (overlay window omits `sandbox`, so it inherits the default).
4. **Verify:** both windows load, IPC works, eye tracking + overlay function. If something genuinely needs
   `sandbox: false`, document *why* in a comment so it's a decision, not an accident.

---

## TASK 19 — Add lint + test gates to CI 🟡 ⏳
**Category:** Process · **File:** [.github/workflows/build.yml](.github/workflows/build.yml)

**Problem.** CI only builds/publishes on tags. It never lints or tests. Regressions ship straight to a release.
(Prereq: TASK 10 + TASK 16.)

**Steps.**
1. Add a `verify` job that runs on `push`/`pull_request` (not just tags): `npm ci`, `npm run lint`, `npm run test`.
2. Make the `build-mac`/`build-windows` jobs `needs: verify` so a broken build never publishes.
3. **Verify:** push a branch with a deliberate lint error → CI fails before building.

---

## TASK 20 — Decompose `useEyeTracker.runFrame` into testable pure helpers 🟡 🛠️
**Category:** Maintainability · **File:** [src/renderer/src/hooks/useEyeTracker.js](src/renderer/src/hooks/useEyeTracker.js) (749 LoC; `runFrame` ~lines 131-587)

**Problem.** `runFrame` is a single ~450-line function mixing geometry math, calibration state machines, the phone
leaky-accumulator, blink edge detection, canvas drawing, and store writes. It's the riskiest file to change, has the
most magic numbers, and is **impossible to unit-test** as written — which is exactly why tuning it keeps causing
regressions (see the long memory log of eye-tracker fixes).

**Why it matters.** This is the heart of the product. Making it testable de-risks every future tuning pass. This is
last because it's a careful refactor of working, subtle code — do it *after* TASK 16 gives you a safety net.

**Steps.**
1. Extract **pure** functions (no refs, no store) into a sibling `eyeMath.js`, each taking inputs and returning values:
   - `computePose(lm) → { yawRatio, pitchRatio, gazeRatio, jawOpenRatio, eyeSpan }`
   - `computeRawEar(lm, w, h, yawRatio) → ear` (the far/near weighting at lines 227-236)
   - `clampAndSmoothEar(prevBuffer, rawEar) → { ear, buffer }`
   - `classifyDownFrame({ ear, pitchRatio, gazeRatio, baselines, emaOpen }) → { downFrame, strongDown }`
   - `percentile(samples, p)` and `median(samples)` helpers (used in calibration + recal + resume re-anchor).
2. Keep the stateful orchestration (refs, store writes, timers) in `runFrame`, now calling the pure helpers.
3. Unit-test each pure helper with synthetic landmark/EAR sequences (now possible thanks to TASK 16).
4. This naturally fixes the duplicated percentile/median code currently inlined ~4 times.
5. **Verify:** behavior is unchanged on the EyeDebugPage (EAR chart, threshold tracking, phone %), and the new
   helper tests pass. Diff the live EAR/threshold values before vs after against a recorded session if possible.

---

## Appendix A — Smaller notes (fix opportunistically)

- **Documents not persisted** ([DocumentsPage.jsx](src/renderer/src/components/pages/DocumentsPage.jsx)): if you
  revive the feature instead of deleting it (TASK 9), note that `documents[]` lives only in memory and vanishes on
  restart — there's no `data:saveDocuments`. Decide if that's intended.
- **"Eye Debug" page is shipped** ([Sidebar.jsx:9](src/renderer/src/components/Sidebar.jsx#L9)): a raw debug surface
  in the public nav. There's a `deleteCameraPage` skill for exactly this. Decide whether end users should see it.
- **Dirty working tree:** `git status` shows 20 modified/deleted files (incl. a deleted `.verify-stats.cjs`).
  Commit or revert before tagging a release so the build is reproducible.
- **`.task` MIME type** ([index.js:214](src/main/index.js#L214)) served as `application/octet-stream` — correct, but
  given the header-injection advisory (TASK 17), keep the protocol handlers minimal and never reflect request data
  into response headers.
- **Notification consistency:** `playBeep`/notifications fire with mixed `silent: true/false`; minor UX inconsistency.
- **Magic numbers** in `useEyeTracker.js` are well-named constants (good) but undocumented units in a few spots;
  the extraction in TASK 20 is the place to add a short header block mapping each to its physical meaning.

## Appendix B — What's genuinely good (keep doing this)

- Correct Electron baseline: `contextIsolation`, no `nodeIntegration`, denied window-open, scoped permission handler,
  a real CSP on the main renderer.
- Defensive persistence: session JSON is schema-validated and bounded to 1,000 rows; legacy YAML→JSON migration is
  handled gracefully.
- Timer correctness via `Date.now()` elapsed math rather than decrement (survives background throttling) — and the
  documented reason for `backgroundThrottling: false` and `showInactive()` for the overlay.
- The focus-score design (instantaneous cognitive score → time-weighted session average → presence/phone/drift
  penalties → confidence tiers) is thoughtful and centralizes its knobs in `SCORE_CONFIG`.
- Excellent inline documentation and a disciplined memory/decision log.

---

### Suggested execution order for a release sprint
1. **Quick wins (1 sitting):** TASKS 1, 2, 3, 4, 5 — ship-blockers that are trivial.
2. **Safety + perf:** TASKS 6, 7, 8, 9.
3. **Tooling:** TASKS 10, 16, 19.
4. **Security hardening:** TASKS 11, 12, 13, 14, 15.
5. **Big rocks:** TASK 17 (Electron), then 18, then 20.
