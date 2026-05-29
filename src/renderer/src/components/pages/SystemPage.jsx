import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { Cpu, Image, RefreshCw } from 'lucide-react'

function ProgressBar({ value, color = 'bg-violet-500' }) {
  return (
    <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

export default function SystemPage() {
  const { systemInfo, setSystemInfo, originalWallpaper } = useStore()
  const [wallpaperPath, setWallpaperPath] = useState('')
  const [wallpaperStatus, setWallpaperStatus] = useState(null)

  const fetchInfo = async () => {
    const info = await window.api?.system.getInfo()
    if (info) setSystemInfo(info)
  }

  useEffect(() => { fetchInfo() }, [])

  const setWallpaper = async () => {
    if (!wallpaperPath.trim()) return
    setWallpaperStatus('loading')
    const res = await window.api?.system.setWallpaper(wallpaperPath.trim())
    setWallpaperStatus(res?.success ? 'ok' : 'error')
    setTimeout(() => setWallpaperStatus(null), 3000)
  }

  const restoreWallpaper = async () => {
    if (!originalWallpaper) return
    setWallpaperStatus('loading')
    const res = await window.api?.system.setWallpaper(originalWallpaper)
    setWallpaperStatus(res?.success ? 'ok' : 'error')
    setTimeout(() => setWallpaperStatus(null), 3000)
  }

  const cpuColor = (systemInfo?.cpuPercent || 0) > 80 ? 'bg-red-500' : (systemInfo?.cpuPercent || 0) > 50 ? 'bg-amber-500' : 'bg-violet-500'
  const memColor = (systemInfo?.usedMemPercent || 0) > 80 ? 'bg-red-500' : (systemInfo?.usedMemPercent || 0) > 60 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">System</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Hardware stats and app activity</p>
        </div>
        <button onClick={fetchInfo} className="btn-icon text-neutral-500 hover:text-neutral-300" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Hardware */}
        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
            <Cpu size={14} className="text-violet-400" /> Hardware
          </h3>
          {systemInfo ? (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-neutral-500">CPU — {systemInfo.cpuModel}</span>
                  <span className="text-xs font-mono text-neutral-300">{systemInfo.cpuPercent}%</span>
                </div>
                <ProgressBar value={systemInfo.cpuPercent} color={cpuColor} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-neutral-500">
                    Memory — {systemInfo.freeMemGB}GB free / {systemInfo.totalMemGB}GB
                  </span>
                  <span className="text-xs font-mono text-neutral-300">{systemInfo.usedMemPercent}%</span>
                </div>
                <ProgressBar value={systemInfo.usedMemPercent} color={memColor} />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[
                  { label: 'CPU Cores', value: systemInfo.cpuCount },
                  { label: 'Platform', value: systemInfo.platform === 'win32' ? 'Windows' : systemInfo.platform === 'darwin' ? 'macOS' : 'Linux' },
                  { label: 'Uptime', value: `${systemInfo.uptime}h` }
                ].map(({ label, value }) => (
                  <div key={label} className="stat-mini">
                    <span className="stat-label">{label}</span>
                    <span className="stat-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-600">Loading…</p>
          )}
        </div>

        {/* Wallpaper */}
        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-300 mb-4 flex items-center gap-2">
            <Image size={14} className="text-cyan-400" /> Desktop Wallpaper
          </h3>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={wallpaperPath}
              onChange={(e) => setWallpaperPath(e.target.value)}
              placeholder="C:\path\to\image.jpg"
              className="input"
            />
            <div className="flex gap-2">
              <button
                onClick={setWallpaper}
                disabled={!wallpaperPath.trim() || wallpaperStatus === 'loading'}
                className="btn btn-primary flex-1"
              >
                {wallpaperStatus === 'loading' ? 'Setting…' :
                  wallpaperStatus === 'ok' ? '✓ Set!' :
                  wallpaperStatus === 'error' ? '✗ Failed' :
                  'Set Wallpaper'}
              </button>
              {originalWallpaper && (
                <button onClick={restoreWallpaper} className="btn btn-secondary">
                  Restore
                </button>
              )}
            </div>
            {originalWallpaper && (
              <p className="text-xs text-neutral-600 truncate">Original: {originalWallpaper}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
