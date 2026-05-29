import { useState } from 'react'
import { Settings2, Save, FolderOpen } from 'lucide-react'
import { useStore } from '../store'

function MinuteSlider({ label, value, onChange, min = 1, max = 60 }) {
  const minutes = Math.round(value / 60)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
          {minutes} min
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={minutes}
        onChange={(e) => onChange(Number(e.target.value) * 60)}
        className="w-full h-1 accent-violet-500 cursor-pointer"
      />
    </div>
  )
}

export default function Settings() {
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
    streak, lastSessionDate,
    pomodoroState
  } = useStore()

  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [paths, setPaths] = useState(null)

  const isRunning = pomodoroState === 'work' || pomodoroState === 'break'

  const savePrefs = async () => {
    const prefs = {
      workDuration, shortBreakDuration, longBreakDuration, eyeAwayThresholdMs,
      notifyOnAutoPause, soundOnAutoPause, dailyGoalSeconds, ritualEnabled,
      focusWallpaperEnabled,
      streak, lastSessionDate
    }
    await window.api?.data.savePreferences(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const loadPaths = async () => {
    const [sp, pp] = await Promise.all([
      window.api?.data.getSessionsPath(),
      window.api?.data.getPrefsPath()
    ])
    setPaths({ sessions: sp, prefs: pp })
  }

  const handleOpen = () => {
    setOpen((v) => !v)
    if (!paths) loadPaths()
  }

  return (
    <div className="card">
      <button
        onClick={handleOpen}
        className="flex items-center justify-between w-full"
      >
        <span className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
          <Settings2 size={14} className="text-neutral-500" />
          Settings
        </span>
        <span className="text-xs text-neutral-600">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {isRunning && (
            <p className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
              Stop the timer before changing durations.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {/* Work session — inline to support 30s test shortcut */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Work session</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={isRunning}
                    onClick={() => { if (!isRunning) setWorkDuration(workDuration === 30 ? 25 * 60 : 30) }}
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
                value={workDuration < 60 ? 1 : Math.round(workDuration / 60)}
                onChange={(e) => { if (!isRunning) setWorkDuration(Number(e.target.value) * 60) }}
                className="w-full h-1 accent-violet-500 cursor-pointer"
              />
            </div>
            <MinuteSlider
              label="Short break"
              value={shortBreakDuration}
              onChange={(v) => { if (!isRunning) setShortBreakDuration(v) }}
              min={1} max={30}
            />
            <MinuteSlider
              label="Long break"
              value={longBreakDuration}
              onChange={(v) => { if (!isRunning) setLongBreakDuration(v) }}
              min={5} max={60}
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

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Daily focus goal</span>
              <span className="text-xs font-mono text-neutral-300 tabular-nums w-16 text-right">
                {Math.round(dailyGoalSeconds / 3600)}h
              </span>
            </div>
            <input
              type="range"
              min={1} max={12}
              value={Math.round(dailyGoalSeconds / 3600)}
              onChange={(e) => setDailyGoalSeconds(Number(e.target.value) * 3600)}
              className="w-full h-1 accent-violet-500 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1 border-t border-surface-3">
            <p className="text-[10px] text-neutral-700 uppercase tracking-wider">Alerts</p>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-neutral-400">Notify on auto-pause</span>
              <button
                role="switch"
                aria-checked={notifyOnAutoPause}
                onClick={() => setNotifyOnAutoPause(!notifyOnAutoPause)}
                className={`relative w-8 h-4 rounded-full transition-colors ${notifyOnAutoPause ? 'bg-violet-500' : 'bg-surface-3'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${notifyOnAutoPause ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-neutral-400">Sound on auto-pause</span>
              <button
                role="switch"
                aria-checked={soundOnAutoPause}
                onClick={() => setSoundOnAutoPause(!soundOnAutoPause)}
                className={`relative w-8 h-4 rounded-full transition-colors ${soundOnAutoPause ? 'bg-violet-500' : 'bg-surface-3'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${soundOnAutoPause ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>

          <div className="flex flex-col gap-2 pt-1 border-t border-surface-3">
            <p className="text-[10px] text-neutral-700 uppercase tracking-wider">Session Ritual</p>
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-neutral-400">Intention &amp; check-in</span>
                <span className="text-[10px] text-neutral-600">Set a goal before, rate after</span>
              </div>
              <button
                role="switch"
                aria-checked={ritualEnabled}
                onClick={() => setRitualEnabled(!ritualEnabled)}
                className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${ritualEnabled ? 'bg-violet-500' : 'bg-surface-3'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${ritualEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>

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

          <button
            onClick={savePrefs}
            className={`btn w-full ${saved ? 'btn-secondary text-emerald-400' : 'btn-primary'}`}
          >
            <Save size={13} />
            {saved ? 'Saved' : 'Save Preferences'}
          </button>

          {paths && (
            <div className="flex flex-col gap-1 pt-1 border-t border-surface-3">
              <p className="text-[10px] text-neutral-700 uppercase tracking-wider mb-1">Data files</p>
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
        </div>
      )}
    </div>
  )
}
