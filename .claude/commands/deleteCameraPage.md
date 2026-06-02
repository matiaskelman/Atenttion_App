# deleteCameraPage — Remove Eye Debug Page

Deletes the Eye Tracker Debug & Calibration page and reverts all related code changes made to support it. Run this when you no longer need the debug page.

---

## What to delete / revert

### 1. Delete the page component
```
src/renderer/src/components/pages/EyeDebugPage.jsx
```

### 2. Revert `src/renderer/src/components/Sidebar.jsx`
Remove `ScanEye` from the lucide-react import and remove the `eyedebug` entry from the `nav` array:
```js
{ id: 'eyedebug', icon: ScanEye, label: 'Eye Debug' },
```

### 3. Revert `src/renderer/src/App.jsx`
- Remove `import EyeDebugPage from './components/pages/EyeDebugPage'`
- Remove `recalibrate` from the `useEyeTracker` destructure (revert to `{ loadModels, startTracking, stopTracking }`)
- Remove the `{page === 'eyedebug' && <EyeDebugPage ... />}` line

### 4. Revert `src/renderer/src/store/slices/eyeTrackerSlice.js`
Remove these six state fields and their six setters:
```
liveEar, earThreshold, calibrationProgress, calibrationSampleCount, liveYaw, livePitch
setLiveEar, setEarThreshold, setCalibrationProgress, setCalibrationSampleCount, setLiveYaw, setLivePitch
```

### 5. Revert `src/renderer/src/hooks/useEyeTracker.js`
Remove in this order:
- The `debugCanvasRef` module-level object and the exported `registerDebugCanvas` function
- The `calibrationStartRef = useRef(null)` ref declaration
- The six `s.setLiveEar / setEarThreshold / setLiveYaw / setLivePitch / setCalibrationProgress / setCalibrationSampleCount` calls inside `runFrame`
- The `if (debugCanvasRef.current)` canvas drawing block at the end of the face-detected branch
- The `recalibrate` useCallback function
- `recalibrate` from the return value (revert to `{ loadModels, startTracking, stopTracking }`)
- The `calibrationStartRef.current = Date.now()` line in `startTracking`
- The `calibrationStartRef.current = null` line in `stopTracking`
- Change the calibration window timing back: replace `calibrationStartRef.current` with `trackingStartTimeRef.current` in the `calElapsed` calculation

---

## After making the changes
Verify the app still starts and eye tracking works on the Focus page.
