import { useState, useEffect } from 'react'

// Shared app-usage list used by StatsPage

const APP_DISPLAY_NAMES = {
  electron: 'Atenttion',
  atenttion: 'Atenttion',
  chrome: 'Google Chrome',
  firefox: 'Firefox',
  msedge: 'Microsoft Edge',
  code: 'VS Code',
  spotify: 'Spotify',
  discord: 'Discord',
  slack: 'Slack',
  explorer: 'File Explorer',
  notepad: 'Notepad',
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  windowsterminal: 'Windows Terminal',
  terminal: 'Terminal',
  mstsc: 'Remote Desktop',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  outlook: 'Outlook',
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  figma: 'Figma',
  notion: 'Notion',
  obsidian: 'Obsidian',
}

const APP_COLORS = {
  electron: '#47848F',
  atenttion: '#47848F',
  chrome: '#4285F4',
  firefox: '#FF6B35',
  msedge: '#0078D4',
  code: '#007ACC',
  spotify: '#1DB954',
  discord: '#5865F2',
  slack: '#611F69',
  explorer: '#0078D4',
  notepad: '#f59e0b',
  powershell: '#012456',
  cmd: '#333333',
  windowsterminal: '#3b82f6',
  terminal: '#3b82f6',
  zoom: '#2D8CFF',
  teams: '#6264A7',
  outlook: '#0078D4',
  word: '#2B579A',
  excel: '#217346',
  figma: '#F24E1E',
  notion: '#aaaaaa',
  obsidian: '#7C3AED',
}

const FALLBACK_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
]

export function appColor(name) {
  const key = name.toLowerCase()
  for (const [k, c] of Object.entries(APP_COLORS)) {
    if (key.includes(k)) return c
  }
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
}

export function appDisplayName(name) {
  const key = name.toLowerCase()
  for (const [k, display] of Object.entries(APP_DISPLAY_NAMES)) {
    if (key.includes(k)) return display
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function formatAppTime(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

// Module-level icon cache — survives re-renders, shared across all AppAvatar instances
const iconCache = new Map()   // name → dataURL
const iconFetching = new Set() // names currently in-flight

function AppAvatar({ name }) {
  const [iconUrl, setIconUrl] = useState(() => iconCache.get(name) ?? null)
  const color = appColor(name)
  const initials = appDisplayName(name).slice(0, 2).toUpperCase()

  useEffect(() => {
    if (iconUrl || iconFetching.has(name) || !window.api?.system?.getAppIcon) return
    iconFetching.add(name)
    window.api.system.getAppIcon(name).then((url) => {
      iconFetching.delete(name)
      if (url) {
        iconCache.set(name, url)
        setIconUrl(url)
      }
    })
  }, [name, iconUrl])

  return (
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{ backgroundColor: color + '28', border: `1px solid ${color}44` }}
    >
      {iconUrl ? (
        <img src={iconUrl} className="w-5 h-5 object-contain" alt="" />
      ) : (
        <span className="text-[10px] font-bold" style={{ color }}>{initials}</span>
      )}
    </div>
  )
}

export function AppUsageList({ usage, emptyText }) {
  const sorted = Object.entries(usage).sort(([, a], [, b]) => b - a)
  if (sorted.length === 0) {
    return <p className="text-xs text-neutral-600 py-1">{emptyText}</p>
  }
  const maxTime = sorted[0][1]
  return (
    <div className="flex flex-col gap-2">
      {sorted.map(([name, seconds]) => (
        <div key={name} className="flex items-center gap-2.5">
          <AppAvatar name={name} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-xs font-medium text-neutral-300 truncate">{appDisplayName(name)}</span>
              <span className="text-xs font-mono text-neutral-500 ml-2 flex-shrink-0">{formatAppTime(seconds)}</span>
            </div>
            <div className="w-full h-0.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(seconds / maxTime) * 100}%`,
                  backgroundColor: appColor(name),
                  opacity: 0.55
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
