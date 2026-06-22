import { useState, useEffect } from 'react'
import { Settings2, FolderOpen, Check, CloudUpload } from 'lucide-react'
import { useStore } from '../../store'

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-violet-500' : 'bg-surface-3'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

function MinuteSlider({ label, value, onChange, min = 1, max = 60, accent = 'accent-violet-500', disabled = false }) {
  const minutes = Math.round(value / 60)
  const title = disabled ? 'Stop the timer to change durations' : undefined
  return (
    <div className="flex flex-col gap-1.5" title={title}>
      <div className="flex items-center justify-between">
        <span className={`text-xs ${disabled ? 'text-neutral-600' : 'text-neutral-400'}`}>{label}</span>
        <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
          {minutes} min
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={minutes}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(Number(e.target.value) * 60)}
        className={`w-full h-1 ${accent} cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
      />
    </div>
  )
}

function SettingGroup({ title, children }) {
  return (
    <div className="card flex flex-col gap-3">
      <p className="text-[10px] text-neutral-600 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function ToggleRow({ title, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">{title}</span>
        {hint && <span className="text-[10px] text-neutral-600">{hint}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  )
}

export default function SettingsPage() {
  const {
    workDuration, setWorkDuration,
    shortBreakDuration, setShortBreakDuration,
    longBreakDuration, setLongBreakDuration,
    eyeAwayThresholdMs, setEyeAwayThreshold,
    notifyOnAutoPause, setNotifyOnAutoPause,
    soundOnAutoPause, setSoundOnAutoPause,
    dailyGoalSeconds, setDailyGoalSeconds,
    ritualEnabled, setRitualEnabled,
    focusWallpaperEnabled, setFocusWallpaperEnabled,
    autoStartEyeTracking, setAutoStartEyeTracking,
    overlayEnabled, setOverlayEnabled,
    pomodoroState, prefsSavedAt, markFeatureUsed
  } = useStore()

  const [paths, setPaths] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const isRunning = pomodoroState === 'work' || pomodoroState === 'break'

  // Flash a passive "Saved" indicator whenever the debounced autosave writes.
  useEffect(() => {
    if (!prefsSavedAt) return
    setJustSaved(true)
    const t = setTimeout(() => setJustSaved(false), 1800)
    return () => clearTimeout(t)
  }, [prefsSavedAt])

  const loadPaths = async () => {
    const [sp, pp] = await Promise.all([
      window.api?.data.getSessionsPath(),
      window.api?.data.getPrefsPath()
    ])
    setPaths({ sessions: sp, prefs: pp })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Settings2 size={18} className="text-violet-400" />
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Settings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Timer, goals, alerts, and tracking preferences</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs h-5">
          {justSaved ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Check size={13} /> Saved
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-neutral-600">
              <CloudUpload size={13} /> Changes save automatically
            </span>
          )}
        </div>
      </div>

      {isRunning && (
        <p className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20 mb-5">
          Stop the timer before changing durations.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SettingGroup title="Timer">
          {/* Work session — inline to support 30s test shortcut */}
          <div className="flex flex-col gap-1.5" title={isRunning ? 'Stop the timer to change durations' : undefined}>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${isRunning ? 'text-neutral-600' : 'text-neutral-400'}`}>Work session</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={isRunning}
                  onClick={() => { if (!isRunning) { setWorkDuration(workDuration === 30 ? 25 * 60 : 30); markFeatureUsed('customTimer') } }}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40 ${workDuration === 30 ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-surface-3 text-neutral-600 hover:border-neutral-600'}`}
                >
                  30s
                </button>
                <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
                  {workDuration < 60 ? `${workDuration}s` : `${Math.round(workDuration / 60)} min`}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={1} max={60}
              disabled={isRunning}
              title={isRunning ? 'Stop the timer to change durations' : undefined}
              value={workDuration < 60 ? 1 : Math.round(workDuration / 60)}
              onChange={(e) => { if (!isRunning) { setWorkDuration(Number(e.target.value) * 60); markFeatureUsed('customTimer') } }}
              className="w-full h-1 accent-violet-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          <MinuteSlider
            label="Short break"
            value={shortBreakDuration}
            onChange={(v) => { if (!isRunning) { setShortBreakDuration(v); markFeatureUsed('customTimer') } }}
            min={1} max={30}
            disabled={isRunning}
          />
          <MinuteSlider
            label="Long break"
            value={longBreakDuration}
            onChange={(v) => { if (!isRunning) { setLongBreakDuration(v); markFeatureUsed('customTimer') } }}
            min={5} max={60}
            disabled={isRunning}
          />
        </SettingGroup>

        <SettingGroup title="Goals & Attention">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Daily focus goal</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setDailyGoalSeconds(dailyGoalSeconds === 30 ? 3600 : 30); markFeatureUsed('customGoal') }}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${dailyGoalSeconds === 30 ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-surface-3 text-neutral-600 hover:border-neutral-600'}`}
                >
                  30s
                </button>
                <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
                  {dailyGoalSeconds < 3600 ? `${dailyGoalSeconds}s` : `${Math.round(dailyGoalSeconds / 3600)}h`}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={1} max={12}
              value={dailyGoalSeconds < 3600 ? 1 : Math.round(dailyGoalSeconds / 3600)}
              onChange={(e) => { setDailyGoalSeconds(Number(e.target.value) * 3600); markFeatureUsed('customGoal') }}
              className="w-full h-1 accent-violet-500 cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Look-away pause after</span>
              <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
                {eyeAwayThresholdMs / 1000}s
              </span>
            </div>
            <input
              type="range"
              min={1} max={10}
              value={eyeAwayThresholdMs / 1000}
              onChange={(e) => setEyeAwayThreshold(Number(e.target.value) * 1000)}
              className="w-full h-1 accent-emerald-500 cursor-pointer"
            />
          </div>
        </SettingGroup>

        <SettingGroup title="Alerts">
          <ToggleRow
            title="Notify on auto-pause"
            checked={notifyOnAutoPause}
            onChange={() => setNotifyOnAutoPause(!notifyOnAutoPause)}
          />
          <ToggleRow
            title="Sound on auto-pause"
            checked={soundOnAutoPause}
            onChange={() => setSoundOnAutoPause(!soundOnAutoPause)}
          />
        </SettingGroup>

        <SettingGroup title="Session Ritual">
          <ToggleRow
            title="Intention & check-in"
            hint="Set a goal before, rate after"
            checked={ritualEnabled}
            onChange={() => setRitualEnabled(!ritualEnabled)}
          />
        </SettingGroup>

        <SettingGroup title="Focus Mode">
          <ToggleRow
            title="Focus wallpaper"
            hint="Dims your desktop during work sessions"
            checked={focusWallpaperEnabled}
            onChange={() => { const v = !focusWallpaperEnabled; setFocusWallpaperEnabled(v); if (v) markFeatureUsed('focusWallpaper') }}
          />
        </SettingGroup>

        <SettingGroup title="Minimized Overlay">
          <ToggleRow
            title="Show floating overlay"
            hint="Small status circle when the app is minimized"
            checked={overlayEnabled}
            onChange={() => { const v = !overlayEnabled; setOverlayEnabled(v); if (v) markFeatureUsed('overlay') }}
          />
        </SettingGroup>

        <SettingGroup title="Eye Tracking">
          <ToggleRow
            title="Auto-start with session"
            hint="Starts the camera on focus, stops it on break"
            checked={autoStartEyeTracking}
            onChange={() => setAutoStartEyeTracking(!autoStartEyeTracking)}
          />
        </SettingGroup>

        <SettingGroup title="Data Files">
          {!paths ? (
            <button onClick={loadPaths} className="text-xs text-violet-400 hover:text-violet-300 text-left">
              Show file locations
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {[
                { label: 'Sessions log', path: paths.sessions },
                { label: 'Preferences', path: paths.prefs }
              ].map(({ label, path }) => (
                <div key={label} className="flex items-start gap-2">
                  <FolderOpen size={11} className="text-neutral-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-neutral-600">{label}</p>
                    <p className="text-[10px] text-neutral-700 font-mono truncate" title={path}>{path}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SettingGroup>
      </div>

    </div>
  )
}
