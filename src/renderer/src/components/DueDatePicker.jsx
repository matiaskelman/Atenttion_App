import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const POP_W = 248
const POP_H = 308

// Custom due-date picker. `children` is a render fn — children({ open, isOpen }) returns the trigger.
// The popover renders in a body portal (fixed-positioned) so a scrollable parent can't clip it.
export default function DueDatePicker({ value, onChange, children }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const [viewMonth, setViewMonth] = useState(() => (value ? parseYMD(value) : new Date()))
  const triggerRef = useRef(null)
  const popRef = useRef(null)

  const today = new Date()
  const selected = value ? parseYMD(value) : null

  const openPicker = () => {
    setViewMonth(value ? parseYMD(value) : new Date())
    setOpen(true)
  }

  // Anchor under the trigger, right-aligned, clamped to the viewport (flips up if no room below).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    let left = Math.min(Math.max(8, r.right - POP_W), window.innerWidth - 8 - POP_W)
    let top = r.bottom + 6
    if (top + POP_H > window.innerHeight - 8) top = Math.max(8, r.top - POP_H - 6)
    setCoords({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const pick = (date) => { onChange(toYMD(date)); setOpen(false) }
  const clear = () => { onChange(null); setOpen(false) }

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))]

  const presets = [
    { label: 'Today', date: new Date() },
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: '+1 week', date: addDays(new Date(), 7) },
  ]

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        {children({ open: openPicker, isOpen: open })}
      </span>

      {open && coords && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: POP_W }}
          className="z-[100] bg-surface-1 border border-surface-3 rounded-xl shadow-2xl p-3 flex flex-col gap-2 animate-pop"
        >
          {/* Quick presets */}
          <div className="flex gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => pick(p.date)}
                className="flex-1 text-[10px] py-1 rounded-md bg-surface-2 hover:bg-surface-3 text-neutral-300 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} aria-label="Previous month"
              className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-surface-2 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-neutral-200">{MONTHS[month]} {year}</span>
            <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} aria-label="Next month"
              className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-surface-2 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[9px] text-neutral-600 text-center">{w}</span>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((date, i) => {
              if (!date) return <span key={i} />
              const isToday = sameYMD(date, today)
              const isSel = selected && sameYMD(date, selected)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(date)}
                  className={`h-7 rounded-md text-[11px] tabular-nums flex items-center justify-center transition-colors ${
                    isSel ? 'bg-violet-500 text-white font-semibold'
                    : isToday ? 'text-violet-300 ring-1 ring-inset ring-violet-500/40 hover:bg-surface-2'
                    : 'text-neutral-300 hover:bg-surface-2'
                  }`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={clear}
              className="flex items-center justify-center gap-1 text-[10px] text-neutral-500 hover:text-red-400 pt-1 border-t border-surface-3 transition-colors"
            >
              <X size={11} /> Clear due date
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
