import { Timer, BarChart2, Monitor, Headphones } from 'lucide-react'
import { useStore } from '../store'

const nav = [
  { id: 'focus',  icon: Timer,       label: 'Focus' },
  { id: 'stats',  icon: BarChart2,   label: 'Stats' },
  { id: 'system', icon: Monitor,     label: 'System' },
  { id: 'audios', icon: Headphones,  label: 'Audio' },
]

export default function Sidebar() {
  const { page, setPage, pomodoroState, eyeStatus, audioPlaying } = useStore()

  const statusColor = {
    work: 'bg-violet-500',
    break: 'bg-emerald-500',
    paused: 'bg-amber-500',
    idle: 'bg-surface-3'
  }[pomodoroState]

  return (
    <aside className="w-[72px] bg-surface-1 border-r border-surface-3 flex flex-col items-center py-4 gap-1 shrink-0">
      {nav.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setPage(id)}
          title={label}
          data-page={id}
          className={`
            relative w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all
            ${page === id
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-neutral-500 hover:text-neutral-300 hover:bg-surface-2'
            }
          `}
        >
          <Icon size={18} />
          <span className="text-[9px] font-medium">{label}</span>
          {id === 'focus' && pomodoroState !== 'idle' && (
            <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${statusColor}`} />
          )}
          {id === 'audios' && audioPlaying && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          )}
        </button>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <div className="w-8 border-t border-surface-3" />
        <div
          title={`Eye: ${eyeStatus}`}
          className={`w-2 h-2 rounded-full transition-colors ${
            eyeStatus === 'looking'       ? 'bg-emerald-500' :
            eyeStatus === 'away'          ? 'bg-red-500 animate-pulse' :
            eyeStatus === 'blinking'      ? 'bg-amber-400' :
            eyeStatus === 'not-tracking'  ? 'bg-orange-400 animate-pulse' :
            'bg-surface-3'
          }`}
        />
      </div>
    </aside>
  )
}
