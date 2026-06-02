import { Wind, Waves, Radio, Headphones, CloudRain, TreePine, Coffee, Play, Pause, Volume1, Volume2, VolumeX } from 'lucide-react'

const AUDIO_TYPES = [
  {
    id: 'white',
    name: 'White Noise',
    desc: 'Smooth broadband mask — harsh highs filtered out for a cleaner, steadier sound',
    icon: Wind,
    accent: 'text-slate-300',
    activeBorder: 'border-slate-400/30',
    activeBg: 'bg-slate-400/10',
    dotColor: 'bg-slate-300',
    btnActive: 'bg-slate-400/20 hover:bg-slate-400/30 text-slate-200 border border-slate-400/20',
  },
  {
    id: 'pink',
    name: 'Pink Noise',
    desc: 'Smooth 1/f spectrum — warmer and gentler than white, closer to natural sound',
    icon: Radio,
    accent: 'text-pink-400',
    activeBorder: 'border-pink-500/30',
    activeBg: 'bg-pink-500/10',
    dotColor: 'bg-pink-400',
    btnActive: 'bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/20',
  },
  {
    id: 'brown',
    name: 'Brown Noise',
    desc: 'Deep low-frequency rumble — easy on the ears for long sessions',
    icon: Waves,
    accent: 'text-amber-600',
    activeBorder: 'border-amber-600/30',
    activeBg: 'bg-amber-600/10',
    dotColor: 'bg-amber-600',
    btnActive: 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 border border-amber-600/20',
  },
  {
    id: 'lofi',
    name: 'LoFi Beats',
    desc: 'Warm 80 BPM groove — kick, snare, vinyl hiss, A-minor bassline',
    icon: Headphones,
    accent: 'text-violet-400',
    activeBorder: 'border-violet-500/30',
    activeBg: 'bg-violet-500/10',
    dotColor: 'bg-violet-400',
    btnActive: 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/20',
  },
  {
    id: 'lofi2',
    name: 'LoFi Study',
    desc: 'Slower 70 BPM, sparse rimshot, E-minor bass + subtle chord pad',
    icon: Headphones,
    accent: 'text-indigo-400',
    activeBorder: 'border-indigo-500/30',
    activeBg: 'bg-indigo-500/10',
    dotColor: 'bg-indigo-400',
    btnActive: 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20',
  },
  {
    id: 'rain',
    name: 'Rain',
    desc: 'Gentle rainfall — bandpass wash with natural intensity variation',
    icon: CloudRain,
    accent: 'text-sky-400',
    activeBorder: 'border-sky-500/30',
    activeBg: 'bg-sky-500/10',
    dotColor: 'bg-sky-400',
    btnActive: 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/20',
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Wind through trees — deep gusts, leaf rustle, slow natural swells',
    icon: TreePine,
    accent: 'text-emerald-400',
    activeBorder: 'border-emerald-500/30',
    activeBg: 'bg-emerald-500/10',
    dotColor: 'bg-emerald-400',
    btnActive: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/20',
  },
  {
    id: 'cafe',
    name: 'Café',
    desc: 'Muffled chatter, soft clinking — cozy coffee shop ambience',
    icon: Coffee,
    accent: 'text-orange-400',
    activeBorder: 'border-orange-500/30',
    activeBg: 'bg-orange-500/10',
    dotColor: 'bg-orange-400',
    btnActive: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/20',
  },
]

function EqBars({ color }) {
  return (
    <div className={`flex items-end gap-[3px] h-4 ${color}`}>
      {[0.6, 1, 0.7, 0.9, 0.5].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-current animate-eq"
          style={{ height: `${Math.round(h * 16)}px`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  )
}

function VolumeIcon({ v }) {
  if (v === 0) return <VolumeX size={14} />
  if (v < 0.5)  return <Volume1 size={14} />
  return <Volume2 size={14} />
}

export default function AudiosPage({ audioControls }) {
  const { playing, volume, setVolume, play } = audioControls

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-neutral-100">Ambient Sounds</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Copyright-free audio synthesised on-device — loops indefinitely
        </p>
      </div>

      {/* Volume control */}
      <div className="card mb-5">
        <div className="flex items-center gap-3">
          <span className={`shrink-0 transition-colors ${volume === 0 ? 'text-neutral-600' : 'text-neutral-400'}`}>
            <VolumeIcon v={volume} />
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="volume-slider flex-1"
          />
          <span className="text-xs font-mono text-neutral-500 w-8 text-right tabular-nums shrink-0">
            {Math.round(volume * 100)}%
          </span>
        </div>
        {playing && (
          <p className="text-[10px] text-neutral-600 mt-2 text-center">
            Now playing: {AUDIO_TYPES.find((t) => t.id === playing)?.name}
          </p>
        )}
      </div>

      {/* Audio cards — 2-column grid */}
      <div className="grid grid-cols-2 gap-3">
        {AUDIO_TYPES.map((t, idx) => {
          const isPlaying = playing === t.id
          const isLast    = idx === AUDIO_TYPES.length - 1 && AUDIO_TYPES.length % 2 === 1
          const Icon = t.icon
          return (
            <div
              key={t.id}
              className={`card transition-all duration-200 ${isLast ? 'col-span-2' : ''} ${
                isPlaying
                  ? `${t.activeBorder} ${t.activeBg}`
                  : 'border-surface-3'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`flex items-center gap-2 ${isPlaying ? t.accent : 'text-neutral-400'} transition-colors`}>
                  <Icon size={16} />
                  <span className="text-sm font-semibold text-neutral-200">{t.name}</span>
                </div>
                <div className="h-4 flex items-center">
                  {isPlaying
                    ? <EqBars color={t.accent} />
                    : <div className={`w-1.5 h-1.5 rounded-full ${t.dotColor} opacity-30`} />
                  }
                </div>
              </div>

              <p className="text-xs text-neutral-500 mb-4 leading-relaxed">{t.desc}</p>

              <button
                onClick={() => play(t.id)}
                className={`btn w-full ${isPlaying ? t.btnActive : 'btn-secondary'}`}
              >
                {isPlaying
                  ? <><Pause size={13} fill="currentColor" /> Pause</>
                  : <><Play  size={13} fill="currentColor" className="ml-0.5" /> Play</>
                }
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-neutral-700 text-center mt-5 leading-relaxed">
        All audio synthesised via Web Audio API — no external files, fully offline, no copyright.
      </p>
    </div>
  )
}
