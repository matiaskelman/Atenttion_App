# crearDescargable

Build and package the Atenttion app as a distributable Windows installer.

## Pre-requisites check
- Developer Mode must be enabled in Windows (Settings → System → For developers → Developer Mode → On)
  - This is required for 7zip to extract symlinks from the winCodeSign archive
  - Without it, electron-builder fails with "Cannot create symbolic link: El cliente no dispone de un privilegio requerido"
- **If Developer Mode is NOT enabled**, use the manual cache workaround below instead (proven to work)

## Steps

1. Clear any corrupted electron-builder cache:
```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
```

2. Run the build and package:
```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"; npm run dist:win
```

3. Output will be in `dist/` — look for the `.exe` installer file.

---

## If it fails with the symlink privilege error (no Developer Mode)

`CSC_IDENTITY_AUTO_DISCOVERY=false` alone does NOT prevent winCodeSign from being downloaded — electron-builder needs it for PE resource editing too. Use this manual workaround instead:

```powershell
# Step A: Extract the winCodeSign archive to the canonical cache path, ignoring the 2 macOS symlink errors
$cache   = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$outDir  = "$cache\winCodeSign-2.6.0"
$archive = Get-ChildItem $cache -Filter "*.7z" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# If no .7z is cached yet, run the build once first so it downloads the archive, then Ctrl+C after download
# Then re-run this block.

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
& "node_modules\7zip-bin\win\x64\7za.exe" x -y -bd $archive.FullName "-o$outDir"

# Step B: Create empty placeholder files for the 2 macOS symlinks that couldn't be created
$lib = "$outDir\darwin\10.12\lib"
New-Item -ItemType File -Force -Path "$lib\libcrypto.dylib" | Out-Null
New-Item -ItemType File -Force -Path "$lib\libssl.dylib"    | Out-Null
```

Then run the build normally — electron-builder finds `winCodeSign-2.6.0\` already populated and skips extraction:
```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"; npm run dist:win
```

**Why this works:** electron-builder checks for `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\` before downloading. The two missing `.dylib` files are macOS-only OpenSSL symlinks; they are never used when building for Windows.

**This fix is permanent** — the cache persists across builds. Only repeat if you clear `%LOCALAPPDATA%\electron-builder\Cache\`.

---

## Known warnings (non-blocking)
- **No app icon set** — electron-builder warns "default Electron icon is used". To fix, add an `icon` field to the `build` section in package.json pointing to a `.ico` file.
- **No author in package.json** — electron-builder warns about missing author field.
