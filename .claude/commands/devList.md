# devList — Pre-Release Checklist

A reference of everything worth fixing, reviewing, or being aware of before making Atenttion public. Items are grouped by priority.

---

## Security

### 1. F12 DevTools shortcut is enabled in production
**File:** `src/main/index.js:35-37`
```javascript
mainWindow.webContents.on('before-input-event', (_, input) => {
  if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools()
})
```
**Fix:** Gate it behind `!app.isPackaged` so it only works in dev:
```javascript
if (!app.isPackaged) {
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools()
  })
}
```

---

### 2. `sandbox: false` in BrowserWindow
**File:** `src/main/index.js:27`

Disables Chromium's process sandbox — a significant security regression in any Electron app. The preload (`src/preload/index.js`) only uses `contextBridge` and `ipcRenderer`, so enabling the sandbox should be safe.

**Fix:** Set `sandbox: true` and test that all IPC still works. If it breaks, the preload is using a Node.js API it shouldn't.

---

### 3. Shell injection in wallpaper path
**File:** `src/main/systemInfo.js:184-189`

The `imagePath` is interpolated directly into a PowerShell command string:
```javascript
const escaped = imagePath.replace(/\\/g, '\\\\')
execSync(`powershell ... '[W]::SystemParametersInfo(20,0,'${escaped}',3)"`, ...)
```
If a path contains a single quote `'`, it breaks the PowerShell string and could inject commands. Windows paths can't normally contain `'`, but a malicious renderer could pass a crafted string via IPC.

**Fix:** Pass the path as a separate PowerShell variable to avoid interpolation:
```javascript
execSync(
  `powershell -NoProfile -NonInteractive -Command "$p='${escaped}';Add-Type ... '[W]::SystemParametersInfo(20,0,$p,3)"`,
  ...
)
```
Or better: use `spawn` with an array of arguments and pass the path via `-InputObject` piped to the script.

---

### 4. No code signing
The installer is unsigned. Windows SmartScreen will show a "Unknown publisher — do you want to run this?" warning to every user, and some enterprise AV tools will block it outright.

**Fix:** Purchase an EV code signing certificate (e.g., DigiCert, Sectigo) and configure electron-builder:
```json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "...",
  "signingHashAlgorithms": ["sha256"]
}
```

---

## UX / Polish

### 5. No app icon
**File:** `package.json` — `build.win.icon` / `build.mac.icon`

electron-builder warns "default Electron icon is used". Users see the generic Electron logo in the taskbar and installer.

**Fix:** Create `resources/icon.ico` (Windows, requires 256×256 inside the .ico) and `resources/icon.icns` (Mac). Both fields are already referenced in `package.json` — just need the actual files.

---

### 6. No author / homepage in package.json
electron-builder warns and the NSIS installer's "About" section will be blank.

**Fix:**
```json
"author": {
  "name": "Your Name",
  "email": "you@example.com"
},
"homepage": "https://yourwebsite.com"
```

---

### 7. No camera permission explanation
The app calls `getUserMedia` without first explaining to the user why it needs camera access. On first launch, the OS dialog just says "Atenttion wants to use your camera" with no context.

**Fix:** Add a one-time onboarding card in the Eye Tracking section that explains the camera is used locally for blink detection and never transmitted.

---

### 8. No auto-updater
Users who install v1.0.0 will never know about v1.0.1 unless they check manually.

**Fix:** Integrate `electron-updater` (part of electron-builder). Requires a public update server (GitHub Releases works out of the box):
```json
"publish": {
  "provider": "github",
  "owner": "yourusername",
  "repo": "atenttion"
}
```
Then add `autoUpdater` calls in `src/main/index.js`.

---

## Stability / Performance

### 9. `execSync` blocks the main process
**File:** `src/main/systemInfo.js:113`, `src/main/systemInfo.js:185`

`execSync` for wallpaper reading (getCurrentWallpaper) and setting (setWallpaper on macOS) blocks Electron's main process thread. On slow machines this can freeze the window momentarily.

**Fix:** Both are already wrapped in `ipcMain.handle` async handlers — replace `execSync` with `execFile` wrapped in a `Promise`.

---

### 10. Session data never pruned
**File:** `src/renderer/src/store/index.js:83`

```javascript
sessions: [...s.sessions.slice(-99), session]
```
Only the last 99 sessions are kept in memory, but the `atenttion-sessions.md` file on disk grows forever (append-only). After a year of daily use this file could be hundreds of KB.

**Fix:** Periodically trim the on-disk log to the last N entries, or rotate by year.

---

## Privacy

### 11. `system:getInfo` returns hostname and CPU model
**File:** `src/main/systemInfo.js:145-146`

`os.hostname()` and `cpuModel` are sent to the renderer and displayed in the System page. This is intentional, but worth noting: if any telemetry or crash reporting is added later, make sure these are not accidentally included.

---

## Known Non-Issues (intentional decisions)

- **`models:` in `script-src` CSP** — Required for MediaPipe to load its WASM via the custom Electron protocol. The `models://` handler only serves files from `out/renderer/models/` which are bundled by us. Not a security hole.
- **`blob:` in `worker-src`** — Required for MediaPipe's Web Worker. Standard for WASM-heavy libraries.
- **GPU cache errors on startup** (`Unable to move the cache: Acceso denegado`) — Benign Windows permission warning about Electron's GPU disk cache. App works fine.
- **`sandbox: false` + `contextIsolation: true`** — contextIsolation is already on, which is the more important mitigation. Enabling sandbox is still recommended but not critical given contextIsolation.
