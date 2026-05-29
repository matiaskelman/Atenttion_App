import { useEffect, useState } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

const isMac = window.api?.platform === 'darwin'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api?.window.isMaximized().then(setMaximized)
    const off = window.api?.window.onMaximized((v) => setMaximized(v))
    return off
  }, [])

  const controls = (
    <div
      className="flex items-center gap-1"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <button
        onClick={() => window.api?.window.minimize()}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-3 text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <Minus size={12} />
      </button>
      <button
        onClick={() => window.api?.window.maximize()}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-3 text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        {maximized ? <Square size={11} /> : <Maximize2 size={11} />}
      </button>
      <button
        onClick={() => window.api?.window.close()}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  )

  const wordmark = (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-violet-500 opacity-80" />
      <span className="text-xs font-semibold tracking-widest text-neutral-400 uppercase">
        Atenttion
      </span>
    </div>
  )

  return (
    <div
      className="flex items-center justify-between h-9 px-4 bg-surface-1 border-b border-surface-3 shrink-0"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {isMac ? controls : wordmark}
      {isMac ? wordmark : controls}
    </div>
  )
}
