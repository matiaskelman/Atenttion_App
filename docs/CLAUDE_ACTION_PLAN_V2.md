ATENTTION APP — CLAUDE ACTION PLAN V2
Generated: 2026-05-26
Source: Full code review after V1 items completed.
Format: [ID] CATEGORY > Title | Files | Problem | Fix | Result | Traps

Do items within each section in order — some have prerequisites noted.
Mark ✅ DONE as you complete each one.

==============================================================
CRITICAL BUGS — fix before any feature work
==============================================================

[B-1] ✅ DONE — SECURITY > Fix command injection in setWallpaper (single quotes in paths)
  Files: src/main/systemInfo.js
  Problem: Lines 183-198 in system:setWallpaper embed imagePath directly into a
           PowerShell string using single-quote delimiters:
             execSync(`...SystemParametersInfo(20,0,'${escaped}',3)`)
           The escape at line 184 only handles backslashes, not single quotes.
           A path like C:\Users\O'Brien\wallpaper.png breaks out of the string.
           The osascript macOS path (line 190) has the same issue with double quotes.
  Fix:
    Windows path: After the backslash escape, also escape single quotes by doubling them.
    In PowerShell, '' inside a single-quoted string is a literal single quote.
      const safePath = imagePath.replace(/\\/g, '\\\\').replace(/'/g, "''")
    Then use safePath in the command string instead of escaped.

    macOS path: The osascript command uses double quotes around the path.
    Escape any double quotes in the path:
      const safePath = imagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    Then use safePath in the osascript command.

    Full replacement for lines 183-198:
      if (process.platform === 'win32') {
        const safePath = imagePath.replace(/\\/g, '\\\\').replace(/'/g, "''")
        execSync(
          `powershell -NoProfile -NonInteractive -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int a,int b,string c,int d);}';[W]::SystemParametersInfo(20,0,'${safePath}',3)"`,
          { timeout: 5000, windowsHide: true }
        )
      } else if (process.platform === 'darwin') {
        const safePath = imagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        execSync(
          `osascript -e "tell application \\"Finder\\" to set desktop picture to POSIX file \\"${safePath}\\""`,
          { timeout: 5000 }
        )
      }
  Result: Paths containing single quotes (Windows) or double quotes (macOS) are handled
          safely. No arbitrary shell execution possible via path input.
  Traps: Do NOT switch to -EncodedCommand (UTF-16LE Base64) — it complicates the code
         and the doubling fix is sufficient. Do not change any other logic in the handler.

[B-2] ✅ DONE — PERF/BUG > Fix full-store subscription in usePomodoro
  Files: src/renderer/src/hooks/usePomodoro.js
  Problem: Line 44: `const store = useStore()` subscribes to the ENTIRE Zustand store.
           Every blink count update, every eye status change, every second the timer ticks
           causes usePomodoro's host component to re-render. The resulting useEffect
           re-evaluation at lines 282-289 runs its conditions (intervalRef checks) on
           every render, which can cause spurious startTimer() calls.
  Fix:
    Replace line 44:
      const store = useStore()
    With:
      const pomodoroState = useStore((s) => s.pomodoroState)

    Update the useEffect at lines 282-289 to use pomodoroState instead of store.pomodoroState:
      useEffect(() => {
        if (pomodoroState === 'paused' && intervalRef.current) {
          clearTimer()
        }
        if (pomodoroState === 'work' && !intervalRef.current) {
          startTimer()
        }
      }, [pomodoroState, clearTimer, startTimer])
  Result: usePomodoro's component only re-renders when pomodoroState changes.
          All other store mutations (blinks, eye status, system info) no longer trigger it.
  Traps: Do NOT use useStore.getState() here — we need a reactive subscription so the
         effect fires when pomodoroState changes. The key insight is a SELECTOR, not no-subscription.

[B-3] ✅ DONE — BUG > Streak resets to zero every time the user saves settings
  Files: src/renderer/src/components/Settings.jsx
  Problem: The savePrefs function at line 46-53 builds a prefs object that omits
           streak and lastSessionDate. When the user clicks "Save Preferences",
           these fields are overwritten with undefined in the JSON file.
           On next app launch, applyPreferences() reads streak: prefs.streak ?? 0,
           which is 0 — silently destroying the user's streak.
           ALSO omits focusWallpaperEnabled (added by R-1 — do R-1 before this if
           you do them in the same session, otherwise add focusWallpaperEnabled: false
           as a placeholder and update it when R-1 is done).
  Fix:
    In the useStore destructuring at line 28-37, add:
      streak, lastSessionDate

    In the savePrefs prefs object at lines 47-52, add:
      streak,
      lastSessionDate,
      focusWallpaperEnabled: false  // placeholder — replace with actual value after R-1

    If R-1 is already done, the destructuring should also pull focusWallpaperEnabled
    from the store and include it in prefs.
  Result: Saving settings no longer wipes streak progress. All persisted preference
          fields survive a Settings save→restart cycle.
  Traps: Do NOT add streak to the UI as a user-editable field. It is only included
         in the save payload to preserve it, not expose it.

[B-4] ✅ DONE — BUG > Overlay resize positions window off-screen near screen edges
  Files: src/main/index.js
  Problem: overlay:show-feedback handler at line 104 expands the overlay with:
             overlayWindow.setPosition(x + w - 220, y + h - 150)
           If the overlay is near the right or bottom edge of the screen, this
           produces a negative x or y, or a position beyond screen bounds.
           The screen import already exists (used on line 65) but is not used here.
  Fix:
    Import screen is already imported on line 1. In the overlay:show-feedback handler
    (lines 104-112), add bounds clamping before setPosition:

      ipcMain.on('overlay:show-feedback', (_, goal) => {
        if (overlayWindow.isDestroyed()) return
        const [x, y] = overlayWindow.getPosition()
        const [w, h] = overlayWindow.getSize()
        const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
        overlayWindow.setSize(220, 150)
        const newX = Math.max(0, Math.min(x + w - 220, sw - 220))
        const newY = Math.max(0, Math.min(y + h - 150, sh - 150))
        overlayWindow.setPosition(newX, newY)
        overlayWindow.webContents.send('overlay:feedback', { goal: goal || null })
      })

    Apply the same clamping pattern to the overlay:dismiss-feedback handler (lines 114-122)
    and the overlay:rating handler (lines 124-136). In those cases the target size is 100×100:
      const newX = Math.max(0, Math.min(x + w - 100, sw - 100))
      const newY = Math.max(0, Math.min(y + h - 100, sh - 100))
  Result: Overlay never partially exits the screen regardless of where the user dragged it.
  Traps: Use workAreaSize (excludes taskbar), not size (full monitor resolution).
         workAreaSize is already how the initial position is set at line 65.

[B-5] ✅ DONE — RELIABILITY > Session save failures are silently dropped
  Files: src/renderer/src/hooks/usePomodoro.js
  Problem: saveSession (lines 55-59) uses .catch(() => {}) — empty handler.
           If the disk is full, the IPC fails, or userData is inaccessible, the user
           loses their session data with zero indication. The IPC handlers in
           persistence.js already return { success: boolean, error?: string } —
           this response is currently ignored.
  Fix:
    Replace the saveSession function (lines 55-59) with:
      const saveSession = (session) => {
        window.api?.data.saveSession(session)
          .then((res) => {
            if (!res?.success) {
              console.error('[saveSession] failed:', res?.error)
              notify('Atenttion', 'Session could not be saved. Check available disk space.')
            }
          })
          .catch((e) => console.error('[saveSession] IPC error:', e))
        const { appUsageFocus, appUsageBreak } = useStore.getState()
        window.api?.data.saveAppUsage({ focus: appUsageFocus, break: appUsageBreak })
          .catch((e) => console.error('[saveAppUsage] IPC error:', e))
      }

    The notify() helper is already defined at line 68. It checks Notification.permission
    before firing, so it is safe to call unconditionally.
  Result: A failed session save surfaces a native notification. Errors are logged.
          No data loss goes undetected.
  Traps: Do NOT throw or reject from saveSession — it is called from timer callbacks
         and must not propagate. The .then/.catch pattern here is intentional.

==============================================================
QUICK CLEANUPS — < 30 min each, low risk
==============================================================

[C-1] ✅ DONE — ARCH > Remove dead documents state from Zustand store
  Files: src/renderer/src/store/index.js
  Problem: Lines 13-19 define documents, addDocument, removeDocument for a removed
           feature. Comment says "kept for backwards compat" but there is no migration
           that reads documents from disk, no IPC handler that loads them, and no
           component that renders them. It is dead weight.
  Fix:
    Delete lines 13-19 from store/index.js:
      // Documents (removed feature — data model kept for backwards compat)
      documents: [],
      addDocument: (doc) => ...,
      removeDocument: (id) => ...,

    Verify that DocumentsPage.jsx (src/renderer/src/components/pages/DocumentsPage.jsx)
    is not imported or rendered in App.jsx. It is not — confirm before deleting.
    Do NOT delete DocumentsPage.jsx itself unless you want to remove it permanently.
    Just removing the store state is sufficient.
  Result: Store has no dead state. grep for "documents" in store/ returns no results.
  Traps: Confirm DocumentsPage is not rendered anywhere (App.jsx page routing) before
         removing the store state. If it IS rendered somewhere, removing the state
         would break it — search for 'documents' in App.jsx first.

[C-2] ✅ DONE — UX > Fix stale label on Settings save button
  Files: src/renderer/src/components/Settings.jsx
  Problem: Line 211: saved ? 'Saved to preferences.md' : 'Save Preferences'
           The label says "preferences.md" but preferences have been saved as
           atenttion-preferences.json since MF-3. The label is factually wrong.
  Fix:
    Change line 211:
      {saved ? 'Saved to preferences.md' : 'Save Preferences'}
    To:
      {saved ? 'Saved' : 'Save Preferences'}
  Result: Button shows "Saved" on confirmation without referencing the wrong filename.
  Traps: None. Trivial text change.

[C-3] ✅ DONE — DATA > CSV export is missing columns
  Files: src/main/persistence.js
  Problem: Lines 254-262 in data:exportCsv build a CSV with only 6 columns:
           date, duration_minutes, focus_score, blink_count, blink_rate, away_seconds.
           Missing: blinkVariability, ritual, goal, moodBefore, outcomeRating.
           Goal text is not CSV-escaped (values with commas would corrupt the file).
  Fix:
    Replace lines 254-263 with:
      const header = 'date,duration_minutes,focus_score,blink_count,blink_rate,blink_variability,away_seconds,ritual,goal,mood_before,outcome_rating'
      const csvEscape = (v) => {
        if (v == null || v === '') return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      const rows = sessions.map((s) => [
        s.date ? new Date(s.date).toISOString() : '',
        s.duration != null ? (s.duration / 60).toFixed(2) : '',
        s.focusScore != null ? s.focusScore : '',
        s.blinkCount != null ? s.blinkCount : '',
        s.blinkRate != null ? s.blinkRate : '',
        s.blinkVariability != null ? s.blinkVariability : '',
        s.awaySeconds != null ? s.awaySeconds : '',
        s.ritual ? 'true' : 'false',
        csvEscape(s.goal),
        s.moodBefore != null ? s.moodBefore : '',
        s.outcomeRating != null ? s.outcomeRating : ''
      ].join(','))
  Result: CSV includes all session fields. Goal text containing commas or quotes is
          correctly escaped per RFC 4180.
  Traps: Goal text from the ritual modal is user-entered and CAN contain commas.
         The csvEscape function is mandatory — do not skip it.

         (Comment by the coder. Also make the excel more readable, instead of separating with "," separate the values within columns)

[C-4] ✅ DONE — PERF > Overlay sync subscription fires on every Zustand mutation
  Files: src/renderer/src/store/index.js, src/renderer/src/App.jsx
  Problem: App.jsx lines 110-121 use useStore.subscribe (raw) which fires a callback
           on every single Zustand state change. It creates a template string
           `${state.timeLeft}|${state.eyeStatus}|${state.pomodoroState}` on every
           mutation to detect changes. During active eye tracking this is called
           dozens of times per second — for blinkCount, blinkRate, systemInfo, etc.
           Zustand's subscribeWithSelector middleware provides a selector-based
           subscription that only fires when the selected values actually change.
  Fix:
    Step 1 — Add subscribeWithSelector middleware to the store.
    In src/renderer/src/store/index.js, change:
      import { create } from 'zustand'
    To:
      import { create } from 'zustand'
      import { subscribeWithSelector } from 'zustand/middleware'

    Change the create call from:
      export const useStore = create((set) => ({
    To:
      export const useStore = create(subscribeWithSelector((set) => ({

    No other store changes needed. subscribeWithSelector is fully backward-compatible.

    Step 2 — Update App.jsx to use the selector form.
    Replace lines 110-121 in App.jsx with:
      useEffect(() => {
        return useStore.subscribe(
          (state) => ({ timeLeft: state.timeLeft, eyeStatus: state.eyeStatus, pomodoroState: state.pomodoroState }),
          ({ timeLeft, eyeStatus, pomodoroState }) => {
            window.api?.overlay?.update({ timeLeft, eyeStatus, pomodoroState })
          }
        )
      }, [])

    The two-argument form of subscribe (selector, callback) is provided by
    subscribeWithSelector. Zustand only calls the callback when the selected
    object's values change (shallow-compared by default).
  Result: Overlay IPC is sent only when timeLeft, eyeStatus, or pomodoroState changes.
          blinkCount, systemInfo, and other high-frequency mutations no longer trigger it.
  Traps: subscribeWithSelector uses SHALLOW comparison by default. The selector must
         return a plain object (not an array). The pattern above is correct.
         Confirm subscribeWithSelector is exported from 'zustand/middleware' — it is
         in Zustand v5 (which this project uses).

==============================================================
REFACTORS — 1–3h each, do in this order
==============================================================

[R-1] ✅ DONE — UX > Make focus wallpaper feature opt-in (default OFF)
  Files: src/renderer/src/store/slices/pomodoroSlice.js,
         src/renderer/src/components/Settings.jsx,
         src/renderer/src/App.jsx
  Problem: Every work session silently changes the user's desktop wallpaper to a
           black screen. No opt-in, no toggle, no warning. If the app crashes
           mid-session, the wallpaper may not restore. This is the most likely
           reason a first-time user uninstalls the app.
  Fix:
    Step 1 — Add preference to store slice.
    In pomodoroSlice.js, add to the slice object:
      focusWallpaperEnabled: false,
      setFocusWallpaperEnabled: (v) => set({ focusWallpaperEnabled: v }),

    In the applyPreferences function, add inside the set((s) => ({...})) object:
      focusWallpaperEnabled: prefs.focusWallpaperEnabled ?? false,

    Step 2 — Add toggle to Settings.jsx.
    In the useStore() destructuring at line 28, add:
      focusWallpaperEnabled, setFocusWallpaperEnabled

    Inside the "Session Ritual" section (after line 204), add a new section:
      <div className="flex flex-col gap-2 pt-1 border-t border-surface-3">
        <p className="text-[10px] text-neutral-700 uppercase tracking-wider">Focus Mode</p>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-400">Focus wallpaper</span>
            <span className="text-[10px] text-neutral-600">Dims your desktop during work sessions</span>
          </div>
          <button
            role="switch"
            aria-checked={focusWallpaperEnabled}
            onClick={() => setFocusWallpaperEnabled(!focusWallpaperEnabled)}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${focusWallpaperEnabled ? 'bg-violet-500' : 'bg-surface-3'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${focusWallpaperEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>

    In savePrefs (line 46), add focusWallpaperEnabled to the prefs object:
      focusWallpaperEnabled,

    Step 3 — Guard the wallpaper effect in App.jsx.
    Add a selector at the top of App() (with the other useStore selectors):
      const focusWallpaperEnabled = useStore((s) => s.focusWallpaperEnabled)

    In the wallpaper useEffect (lines 129-157), wrap the entire work-state branch:
      if (pomodoroState !== 'work' || !focusWallpaperEnabled) {
        if (wallpaperActiveRef.current) restoreWallpaper()
        return
      }

    Also update B-3 (Settings.jsx streak fix) at the same time — add
    focusWallpaperEnabled to the prefs object there too, using the actual store value
    instead of the false placeholder.
  Result: Wallpaper feature defaults to OFF. First-time users are not surprised.
          Users who want it can enable it in Settings. The store correctly persists the choice.
  Traps: Do NOT set the default to true — that recreates the exact surprise the fix
         is solving. The preference starts false and must be explicitly enabled.
         Update B-3 simultaneously so Settings.jsx saves focusWallpaperEnabled correctly.

[R-2] ✅ DONE — PERF > Replace base64 canvas IPC with main-process PNG generation
  Files: src/renderer/src/App.jsx,
         src/main/systemInfo.js,
         src/preload/index.js
  Prerequisite: R-1 must be done first (the wallpaper effect must be guarded before
                you simplify its internals — otherwise the effect may run during refactor).
  Problem: App.jsx lines 142-156 create a 1920×1080 canvas, encode it as a base64 PNG
           (~500KB–2MB string), and send it through IPC to the main process via
           system:saveFocusWallpaper. The main process then decodes and writes it.
           This is expensive serialization for what is literally a black rectangle.
           The main process has direct fs access and can generate this PNG itself.
  Fix:
    Step 1 — Add makeBlackPng() and a new IPC handler in systemInfo.js.
    Add this import at the top of systemInfo.js:
      import { deflateSync } from 'zlib'

    Add the following function after the existing imports (before setupSystemIPC):
      function makeBlackPng() {
        // Generates a minimal valid 2×2 black grayscale PNG using only Node built-ins.
        // Windows stretches single-color wallpapers to fill the screen.
        const width = 2, height = 2
        const rawRow = Buffer.alloc(1 + width, 0) // filter byte 0x00 + 2 black pixels
        const raw = Buffer.concat([rawRow, rawRow]) // 2 rows
        const compressed = deflateSync(raw)

        const crcTable = (() => {
          const t = new Uint32Array(256)
          for (let i = 0; i < 256; i++) {
            let c = i
            for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            t[i] = c >>> 0
          }
          return t
        })()
        const crc32 = (buf) => {
          let c = 0xffffffff
          for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
          return ((c ^ 0xffffffff) >>> 0)
        }
        const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
        const chunk = (type, data) => {
          const t = Buffer.from(type)
          return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))])
        }

        const ihdr = Buffer.concat([u32(width), u32(height), Buffer.from([8, 0, 0, 0, 0])])
        return Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          chunk('IHDR', ihdr),
          chunk('IDAT', compressed),
          chunk('IEND', Buffer.alloc(0))
        ])
      }

    Inside setupSystemIPC(), replace the system:saveFocusWallpaper handler with:
      ipcMain.handle('system:createFocusWallpaper', async () => {
        try {
          const filePath = path.join(app.getPath('userData'), 'focus-wallpaper.png')
          await require('fs').promises.writeFile(filePath, makeBlackPng())
          return { success: true, path: filePath }
        } catch (e) {
          return { success: false, error: e.message }
        }
      })

    Step 2 — Update preload/index.js.
    In the system section, replace:
      saveFocusWallpaper: (data) => ipcRenderer.invoke('system:saveFocusWallpaper', data)
    With:
      createFocusWallpaper: () => ipcRenderer.invoke('system:createFocusWallpaper')

    Step 3 — Update App.jsx.
    Inside the wallpaper useEffect (the async IIFE starting at line 134), replace
    the entire canvas block (lines 142-151):
      if (!focusWallpaperPathRef.current) {
        const canvas = document.createElement('canvas')
        canvas.width = 1920
        canvas.height = 1080
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#111111'
        ctx.fillRect(0, 0, 1920, 1080)
        const res = await window.api?.system.saveFocusWallpaper(canvas.toDataURL('image/png'))
        if (res?.success) focusWallpaperPathRef.current = res.path
      }
    With:
      if (!focusWallpaperPathRef.current) {
        const res = await window.api?.system.createFocusWallpaper()
        if (res?.success) focusWallpaperPathRef.current = res.path
      }
  Result: No base64 encoding in the renderer. No canvas allocation. IPC payload is
          zero bytes (invoke with no args). Main process writes ~150-byte PNG directly.
  Traps: The 'zlib' import is built into Node.js — no npm install needed.
         Use `import { deflateSync } from 'zlib'` at the TOP of systemInfo.js (not inside
         the function). The `fs` require inside the handler is needed because systemInfo.js
         uses `import fs from 'fs'` at the top — use that existing `fs` object instead of
         `require('fs').promises` if fs is already imported with promises access.
         Check the existing imports in systemInfo.js before adding new ones.

[R-3] ✅ DONE — ARCH > Move updateStreak into the session store slice
  Files: src/renderer/src/hooks/usePomodoro.js,
         src/renderer/src/store/slices/sessionSlice.js
  Problem: updateStreak() at line 9 of usePomodoro.js is a module-level function that
           reads from Zustand AND calls window.api.data.savePreferences(). It is called
           from three places in the same file. This is hidden coupling: the function
           looks like a pure utility but has two side effects (store mutation + IPC save).
           Streak logic belongs in the session slice where session state lives.
  Fix:
    Step 1 — Add updateStreak action to sessionSlice.js.
    In sessionSlice.js, add a new action after setLastSessionDate:
      updateStreak: () => {
        const s = useStore.getState()  // NOTE: needs useStore import — see Traps
        const today = new Date().toLocaleDateString('en-CA')
        let newStreak = s.streak || 0
        if (!s.lastSessionDate) {
          newStreak = 1
        } else if (s.lastSessionDate === today) {
          // already counted today
        } else {
          const diffDays = Math.round(
            (new Date(today) - new Date(s.lastSessionDate)) / 86400000
          )
          newStreak = diffDays === 1 ? newStreak + 1 : 1
        }
        // set() from the slice closure updates the store
        set({ streak: newStreak, lastSessionDate: today })
        // Return the new values so the caller can persist them
        return { streak: newStreak, lastSessionDate: today }
      }

    NOTE: sessionSlice.js uses the `set` parameter from the slice factory, not useStore.
    The updateStreak action sets the store via `set` and RETURNS the new values.
    The caller (usePomodoro) is responsible for saving preferences. This keeps the
    slice free of window.api calls.

    Step 2 — Update usePomodoro.js.
    Delete the entire updateStreak function (lines 9-41).
    Wherever updateStreak() is called (3 places: skip, confirmPostRitual, and the
    non-ritual session end path), replace with:
      const { streak: newStreak, lastSessionDate: today } = useStore.getState().updateStreak()
      window.api?.data.savePreferences({
        workDuration: prefs.workDuration,
        shortBreakDuration: prefs.shortBreakDuration,
        longBreakDuration: prefs.longBreakDuration,
        eyeAwayThresholdMs: prefs.eyeAwayThresholdMs,
        notifyOnAutoPause: prefs.notifyOnAutoPause,
        soundOnAutoPause: prefs.soundOnAutoPause,
        dailyGoalSeconds: prefs.dailyGoalSeconds,
        ritualEnabled: prefs.ritualEnabled,
        focusWallpaperEnabled: prefs.focusWallpaperEnabled,  // if R-1 is done
        streak: newStreak,
        lastSessionDate: today
      }).catch(() => {})
    Get `prefs` from useStore.getState() at each call site.
  Result: Streak logic lives in the slice. usePomodoro no longer contains a floating
          function with mixed concerns. The slice action is testable without IPC.
  Traps: Do NOT import useStore inside sessionSlice.js — circular dependency.
         The updateStreak action uses `set` (the slice parameter) to mutate the store,
         and returns the new values. The savePreferences call stays in usePomodoro
         because it depends on window.api which is renderer-only.

==============================================================
NEW FEATURES — implement after all bugs and refactors are done
==============================================================

[NF-1] FEAT > Adaptive break duration based on end-of-session fatigue
  Files: src/renderer/src/hooks/usePomodoro.js,
         src/renderer/src/store/slices/pomodoroSlice.js
  Problem: The app detects fatigue via blinkVariability (CV of inter-blink intervals)
           but ignores this data when setting break duration. Every short break is
           always shortBreakDuration (default 5 min) regardless of how exhausted the
           user is. If CV > 0.70, the user was blink-erratic and cognitively fatigued —
           a 5-minute break is not enough.
  Fix:
    Step 1 — Add a utility function at the top of usePomodoro.js (after the import block):
      function computeBreakSeconds(cv, defaultBreak) {
        if (cv == null) return defaultBreak
        if (cv > 0.70) return Math.min(Math.round(defaultBreak * 1.8), 15 * 60)
        if (cv < 0.30) return Math.max(Math.round(defaultBreak * 0.7), 3 * 60)
        return defaultBreak
      }

    Step 2 — Use it in the three places where a short break is started.
    There are three paths where s.setPomodoroMode('short-break') is called:
      a) In the setInterval callback (non-ritual path) around line 130
      b) In confirmPostRitual around line 195
      c) The break-to-work cycle does not need adaptive duration

    In each short-break transition, replace:
      s.setPomodoroMode('short-break')
      s.setTimeLeft(s.shortBreakDuration)
    With:
      const adaptedBreak = computeBreakSeconds(s.blinkVariability, s.shortBreakDuration)
      s.setPomodoroMode('short-break')
      s.setTimeLeft(adaptedBreak)

    Step 3 — Inform the user when the break is adapted.
    Replace the break notification in those same paths. Instead of:
      notify('Atenttion', 'Work session complete! Take a break.')
    Use:
      const adaptedBreak = computeBreakSeconds(s.blinkVariability, s.shortBreakDuration)
      const breakMinutes = Math.round(adaptedBreak / 60)
      const isAdapted = adaptedBreak !== s.shortBreakDuration
      const reason = s.blinkVariability > 0.70 ? 'You seem fatigued — extended break.' : 'Flow detected — shorter break.'
      notify('Atenttion', isAdapted
        ? `Session complete! ${reason} Taking ${breakMinutes} min.`
        : `Session complete! Take a ${breakMinutes}-min break.`
      )
      s.setPomodoroMode('short-break')
      s.setTimeLeft(adaptedBreak)
    Make sure to compute adaptedBreak before calling setTimeLeft so the notification
    and setTimeLeft use the same value.
  Result: Users with high blink variability (fatigued) get longer breaks. Users in
          flow get shorter breaks. The notification explains the reason. Long breaks
          are capped at 15 minutes. Short breaks cannot go below 3 minutes.
  Traps: Only adapt SHORT breaks — do NOT change long break duration (every 4th session).
         Long breaks are already for recovery. Only apply this to pomodoroMode === 'short-break'.
         Compute adaptedBreak ONCE per transition and reuse it for both the
         notification and setTimeLeft — do not call computeBreakSeconds twice.

[NF-2] FEAT > Blink rate baseline calibration on first use
  Files: src/renderer/src/hooks/useEyeTracker.js,
         src/renderer/src/components/EyeTracker.jsx,
         src/renderer/src/store/slices/eyeTrackerSlice.js,
         src/renderer/src/constants/blinksConfig.js,
         src/renderer/src/utils/focusScore.js,
         src/renderer/src/components/Settings.jsx,
         src/main/persistence.js (preferences save/load)
  Problem: blinksConfig.js defines fixed BPM brackets (e.g., 12–25 BPM = optimal).
           Population blink rate varies from 8–21 BPM at rest. A user whose natural
           focus rate is 9 BPM is permanently rated as "drowsy" (bracket D) even when
           fully focused. A 2-minute calibration session establishes the user's actual
           baseline and shifts the scoring to be relative, not absolute.
  Fix:
    Step 1 — Add baselineBpm to the store and preferences.
    In eyeTrackerSlice.js, add:
      baselineBpm: null,
      calibrationActive: false,
      setBaselineBpm: (v) => set({ baselineBpm: v }),
      setCalibrationActive: (v) => set({ calibrationActive: v })

    In pomodoroSlice.js, applyPreferences function, add:
      baselineBpm: prefs.baselineBpm ?? null,

    In Settings.jsx savePrefs and updateStreak in usePomodoro.js, add:
      baselineBpm: useStore.getState().baselineBpm,
    to the persisted preferences object so it survives restarts.

    In persistence.js, no changes needed — the prefs JSON will naturally include
    baselineBpm once it is added to the saved object.

    Step 2 — Run calibration in useEyeTracker.
    Add two refs at the top of useEyeTracker:
      const calibrationTimesRef = useRef([])
      const calibrationTimerRef = useRef(null)

    In startTracking(), after the existing reset block, add:
      const s = useStore.getState()
      if (s.baselineBpm === null && !s.calibrationActive) {
        // First run — collect 90 seconds of blink data for baseline
        s.setCalibrationActive(true)
        calibrationTimesRef.current = []
        calibrationTimerRef.current = setTimeout(() => {
          const times = calibrationTimesRef.current
          if (times.length >= 4) {
            // Compute baseline BPM from the 90s window
            const bpm = Math.round(times.length * (60000 / 90000))
            useStore.getState().setBaselineBpm(bpm)
          }
          useStore.getState().setCalibrationActive(false)
          calibrationTimesRef.current = []
        }, 90000)
      }

    In runFrame(), in the blink detection path (when a new blink is counted),
    inside the `if (blinkFramesRef.current >= BLINK_MIN_FRAMES && !isBlinkingRef.current)` block,
    add alongside the existing blinkTimesRef push:
      const s2 = useStore.getState()
      if (s2.calibrationActive) calibrationTimesRef.current.push(now)

    In stopTracking(), add cleanup:
      if (calibrationTimerRef.current) {
        clearTimeout(calibrationTimerRef.current)
        calibrationTimerRef.current = null
      }
      calibrationTimesRef.current = []
      useStore.getState().setCalibrationActive(false)

    Step 3 — Show calibration state in EyeTracker.jsx.
    Import calibrationActive and baselineBpm from the store.
    When calibrationActive is true, show a pulsing indicator:
      "Calibrating your baseline... (keep working naturally)"
    This replaces or supplements the normal BPM display during calibration.
    When baselineBpm is set, show a small line: "Baseline: {baselineBpm} BPM"
    in the EyeTracker card (below the live BPM).

    Step 4 — Use baselineBpm to shift bracket scoring.
    In blinksConfig.js, export a function that computes adjusted brackets:
      export function getAdjustedBrackets(baselineBpm) {
        if (baselineBpm == null) return BPM_BRACKETS  // use fixed brackets as fallback
        const shift = baselineBpm - 16  // 16 is the midpoint of the default optimal bracket
        return BPM_BRACKETS.map((b) => ({
          ...b,
          min: b.min != null ? b.min + shift : b.min,
          max: b.max != null ? b.max + shift : b.max
        }))
      }

    In useEyeTracker.js (runFrame), getBpmBracket() and computeFocusScore() must
    receive the adjusted brackets. Update the calls:
      const brackets = getAdjustedBrackets(useStore.getState().baselineBpm)
    Pass `brackets` to getBpmBracket and computeFocusScore if those functions accept
    a custom bracket array. If they currently read from BPM_BRACKETS directly,
    update their signatures to accept an optional brackets parameter.

    Step 5 — Add a "Reset Calibration" button in Settings.jsx.
    Under the eye tracking section in Settings, add a small button:
      <button onClick={() => { useStore.getState().setBaselineBpm(null) }} className="...">
        Reset baseline calibration
      </button>
    This sets baselineBpm back to null, which triggers re-calibration on next tracking start.
  Result: After 90 seconds of natural use, the user's blink rate is measured and
          used to shift bracket boundaries. A 9-BPM natural blinker will be scored
          against a bracket centered on 9 BPM, not 16. The calibration is silent and
          automatic. Users can reset it if their natural rate changes.
  Traps: Do NOT require calibration before allowing tracking to start. Calibration runs
         passively during normal use. The timer elapses whether or not the user is in
         a Pomodoro session — calibration is independent of timer state.
         The shift in Step 4 is additive. If baselineBpm = 10 and shift = -6,
         bracket C (12–25) becomes (6–19). Check that shifted brackets don't produce
         overlapping or negative values (min = 0 is the floor — use Math.max(0, ...)).
         The 90s window is deliberately short enough to complete in a single session.

[NF-3] FEAT > Per-minute focus snapshots for session replay
  Files: src/renderer/src/hooks/usePomodoro.js,
         src/renderer/src/hooks/useEyeTracker.js,
         src/renderer/src/components/pages/StatsPage.jsx,
         src/main/persistence.js
  Prerequisite: Session data structure must already include the new fields added by NF-1
                (no structural conflict, but do NF-1 first to avoid merging changes).
  Problem: Sessions are saved as single aggregates (one blink rate, one focus score,
           one away-seconds total). There is no time-series data showing WHEN during
           a session focus was high or low. Users cannot identify their focus patterns
           (e.g., "I lose focus in the last 5 minutes of every session").
  Fix:
    Step 1 — Accumulate per-minute snapshots in usePomodoro.
    Add a ref at the top of usePomodoro():
      const minuteSnapshotsRef = useRef([])

    In startTimer(), at the start of the function (before clearTimer()):
      minuteSnapshotsRef.current = []

    After the setInterval call (after line 78), add a parallel snapshot interval:
      const snapshotIntervalRef = useRef(null)

    Inside startTimer (after creating intervalRef.current), start a snapshot interval:
      snapshotIntervalRef.current = setInterval(() => {
        const state = useStore.getState()
        if (state.pomodoroMode !== 'work') return
        minuteSnapshotsRef.current.push({
          minute: minuteSnapshotsRef.current.length + 1,
          bpm: state.blinkRate,
          cv: state.blinkVariability,
          awaySeconds: state.lookingAwaySeconds
        })
      }, 60000)

    In clearTimer(), also clear the snapshot interval:
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current)
        snapshotIntervalRef.current = null
      }
    Add snapshotIntervalRef to the clearTimer useCallback — it needs access to it.
    Best approach: define snapshotIntervalRef alongside intervalRef and include its
    cleanup in clearTimer.

    In the session data construction (the sessionData object built at session end,
    in both the non-ritual path and pendingSessionRef), add:
      minuteSnapshots: minuteSnapshotsRef.current.slice()

    Step 2 — No changes needed in persistence.js.
    The session JSON format already stores arbitrary fields. minuteSnapshots will
    be serialized automatically as part of the session object. Verify that
    appendSessionJson writes the full session object (it does — line 137 pushes
    the session as-is). The CSV export (C-3) should NOT try to flatten minuteSnapshots
    into columns — leave it as JSON-only data.

    Step 3 — Display a timeline chart in StatsPage.
    When the user clicks a session row in the Recent Sessions table, show a
    "Session Timeline" expandable panel beneath it.
    This panel renders a Recharts LineChart with:
      - X axis: minute (1, 2, 3... up to session length)
      - Y axis: BPM (0–40)
      - One Line: blinkRate (bpm) per minute — color: violet
      - Optional: a second Line for cv * 20 scaled to the same axis, color: amber
    Only render the chart if session.minuteSnapshots?.length > 0.
    If minuteSnapshots is absent (older sessions), show: "Timeline not available for this session."

    In StatsPage.jsx, in the recent sessions table section, add state:
      const [expandedSession, setExpandedSession] = useState(null)

    Make each table row clickable:
      onClick={() => setExpandedSession(expandedSession === session.date ? null : session.date)}

    Below each row (as a table row spanning all columns), render the timeline
    panel conditionally when expandedSession === session.date.
  Result: Each session accumulates one data point per elapsed minute during work.
          After a session, clicking its row in StatsPage expands a BPM timeline.
          Users can see exactly when focus degraded. Older sessions show a graceful
          "not available" message.
  Traps: The snapshot interval is started inside startTimer but uses refs that are
         declared in usePomodoro's scope. Keep snapshotIntervalRef declared at the
         same level as intervalRef. Both must be cleared in clearTimer.
         The snapshot interval fires every 60 real-time seconds — it is NOT paused
         when the Pomodoro is paused. Optionally guard it:
           if (useStore.getState().pomodoroState !== 'work') return
         inside the setInterval callback (which is already shown above).
         Do NOT snapshot during break phases — the mode check prevents that.

==============================================================
DEFERRED — document only, do not implement yet
==============================================================

[D-1] DEFERRED — MediaPipe Web Worker (too risky for now, document architecture)
  Files (if implemented): src/renderer/src/workers/eyeTracker.worker.js (new),
                          src/renderer/src/hooks/useEyeTracker.js (major rewrite)
  Problem: landmarker.detectForVideo() is synchronous and runs on the UI thread.
           On a mid-range machine it takes 10–30ms per call at 30fps intervals.
           This blocks React re-renders and event handling during every frame.
  Architecture if implemented:
    1. Create src/renderer/src/workers/eyeTracker.worker.js
       This file runs in a Worker context. Import @mediapipe/tasks-vision there.
       Initialize FaceLandmarker inside the worker using FilesetResolver.
       Use OffscreenCanvas: receive an ImageBitmap from the main thread via postMessage,
       call detectForVideo on it, post back the landmarks array.

    2. In useEyeTracker.js, replace the setTimeout loop with:
       - Create a Worker: new Worker(new URL('../workers/eyeTracker.worker.js', import.meta.url))
       - Every 33ms, grab a frame from the video element:
           const bitmap = await createImageBitmap(videoRef.current)
           worker.postMessage({ bitmap, timestamp: Date.now() }, [bitmap])
         The [bitmap] transfer list transfers ownership to the worker (zero-copy).
       - Listen for worker.onmessage to receive landmarks and run the EAR/blink logic
         in the main thread (landmark processing is fast and doesn't need offloading).

    3. WASM modules must be served with correct MIME types in the worker context.
       The existing models:// protocol handler in main/index.js handles this for the
       renderer. Workers share the same origin, so the same protocol applies.
       Verify WASM files can be fetched from the worker by testing with a simple fetch().

    4. Vite worker config: electron-vite may need `worker.format: 'es'` in
       electron.vite.config.mjs to handle ESM workers correctly.

  Why deferred: Worker + OffscreenCanvas requires complete rewrite of useEyeTracker.
                The blink detection state (blinkFramesRef, isBlinkingRef, etc.) must
                either move into the worker or stay in main thread and receive only landmarks.
                Recommended split: worker handles inference only (video→landmarks),
                main thread handles all state logic (EAR calc, blink counting, store updates).
                This is a 1–2 day task with significant regression risk.
                Implement only after all other items in this plan are stable and tested.

==============================================================
IMPLEMENTATION ORDER
==============================================================

  Week 1 — Critical bugs first, then cleanups:
    B-1 → B-2 → B-3 → B-4 → B-5 → C-1 → C-2 → C-3 → C-4

  Week 2 — Refactors (prerequisite order matters):
    R-1 → then update B-3 with focusWallpaperEnabled → R-2 → R-3

  Week 3+ — New features (any order, no interdependencies):
    NF-1 (smallest, do first) → NF-2 → NF-3

  Never: D-1 until all of the above is stable and manually tested.

==============================================================
IMPLEMENTATION NOTES
==============================================================

- B-3 and R-1 are coupled: Settings.jsx savePrefs must include EVERY preference field.
  If you do R-1 (adds focusWallpaperEnabled) and B-3 (adds streak/lastSessionDate)
  in the same session, merge the savePrefs changes in one edit pass so the prefs object
  contains all fields at once. See each item's fix for the full field list.

- R-2 depends on R-1 being done first because the wallpaper useEffect guard (from R-1)
  reduces the blast radius if anything goes wrong during R-2's IPC refactor.

- NF-2 (calibration) modifies blinksConfig.js. If NF-3 (snapshots) is started before
  NF-2 is complete, be aware that getBpmBracket may have a different signature mid-work.
  Do NF-2 entirely before starting NF-3.

- After each item, run the app (npm run dev) and:
    * Open the Focus page, start eye tracking, verify no console errors
    * Start and complete a 30-second Pomodoro (use the 30s debug toggle in Settings)
    * Check Stats page shows the session
  This is the minimum smoke test for every change.
