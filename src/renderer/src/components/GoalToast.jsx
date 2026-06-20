import { useEffect } from 'react'
import { Trophy, X } from 'lucide-react'

export default function GoalToast({ onClose }) {
  // Auto-dismiss after 6s
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-toast">
      <div className="flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl bg-[#161616] border border-violet-500/40 shadow-violet max-w-xs">
        <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
          <Trophy size={18} className="text-violet-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-neutral-100">Daily goal reached! 🎉</span>
          <span className="text-xs text-neutral-500">Nice work — you hit your focus target for today.</span>
        </div>
        <button
          onClick={onClose}
          className="ml-1 self-start text-neutral-600 hover:text-neutral-300 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
