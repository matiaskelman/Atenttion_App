import { useState } from 'react'
import { ListTodo, Plus, Check, X, CalendarPlus, Calendar } from 'lucide-react'
import { useStore } from '../store'
import DueDatePicker from './DueDatePicker'

// due is a 'YYYY-MM-DD' string. Returns a friendly label + urgency colour, or null.
// Exported so the ritual goal-suggestion dropdown can show the same due chips.
export function dueInfo(due, done) {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  const dueMid = new Date(y, m - 1, d)
  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((dueMid - todayMid) / 86400000)
  const label =
    diff === 0 ? 'Today' :
    diff === 1 ? 'Tomorrow' :
    diff === -1 ? 'Yesterday' :
    dueMid.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const color =
    done ? 'text-neutral-600' :
    diff < 0 ? 'text-red-400' :
    diff === 0 ? 'text-amber-400' : 'text-neutral-500'
  return { label, color, overdue: !done && diff < 0 }
}

const byDue = (a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity)

function TaskRow({ task }) {
  const { toggleTask, setTaskDue, removeTask } = useStore()
  const due = dueInfo(task.due, task.done)

  return (
    <div className="group flex items-center gap-2 text-xs rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-white/[0.03] transition-colors">
      <button
        onClick={() => toggleTask(task.id)}
        aria-label={task.done ? 'Mark task incomplete' : 'Mark task complete'}
        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
          task.done ? 'bg-violet-500 border-violet-500' : 'border-neutral-600 hover:border-violet-400'
        }`}
      >
        {task.done && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>

      <span
        className={`flex-1 min-w-0 truncate transition-colors ${task.done ? 'line-through text-neutral-600' : 'text-neutral-200'}`}
        title={task.title}
      >
        {task.title}
      </span>

      <DueDatePicker value={task.due} onChange={(d) => setTaskDue(task.id, d)}>
        {({ open, isOpen }) =>
          task.due ? (
            <button type="button" onClick={open} title="Change due date" className="shrink-0 flex items-center gap-1">
              {due.overdue && <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />}
              <span className={`tabular-nums ${due.color}`}>{due.label}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={open}
              aria-label="Set due date"
              title="Set due date"
              className={`shrink-0 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
            >
              <CalendarPlus size={13} className="text-neutral-500 hover:text-violet-400" />
            </button>
          )
        }
      </DueDatePicker>

      <button
        onClick={() => removeTask(task.id)}
        aria-label="Delete task"
        className="shrink-0 text-neutral-700 hover:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default function Tasks() {
  const tasks = useStore((s) => s.tasks)
  const addTask = useStore((s) => s.addTask)
  const clearCompletedTasks = useStore((s) => s.clearCompletedTasks)
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState('')

  const open = tasks.filter((t) => !t.done).sort(byDue)
  const done = tasks.filter((t) => t.done).sort(byDue)
  const total = tasks.length
  const doneCount = done.length
  const pct = total ? Math.round((doneCount / total) * 100) : 0
  const allDone = total > 0 && doneCount === total

  const submit = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    addTask(draft, draftDue || null)
    setDraft(''); setDraftDue('')
  }

  return (
    <div data-tour="tasks" className="card flex flex-col gap-3 flex-1 min-h-0">
      {/* Header + completion progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Tasks</h3>
          {total > 0 && (
            <span className={`text-[10px] tabular-nums ${allDone ? 'text-emerald-400 font-medium' : 'text-neutral-600'}`}>
              {allDone ? 'All done' : `${doneCount}/${total}`}
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-violet-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* Add form — optional due date for the new task, via the custom picker */}
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 min-w-0 bg-surface-2 border border-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-violet-500/50 transition-colors"
        />
        <DueDatePicker value={draftDue || null} onChange={(d) => setDraftDue(d || '')}>
          {({ open }) =>
            draftDue ? (
              <button
                type="button"
                onClick={open}
                title="Change due date"
                className="shrink-0 flex items-center gap-1 h-8 px-2 rounded-lg bg-violet-500/10 text-violet-300 text-[10px] hover:bg-violet-500/15 transition-colors"
              >
                <Calendar size={12} /> {dueInfo(draftDue, false).label}
              </button>
            ) : (
              <button
                type="button"
                onClick={open}
                aria-label="Set a due date for the new task"
                title="Set a due date"
                className="btn-icon shrink-0 text-neutral-600 hover:text-neutral-400"
              >
                <Calendar size={15} />
              </button>
            )
          }
        </DueDatePicker>
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Add task"
          className="btn-icon text-violet-400 hover:text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <Plus size={16} />
        </button>
      </form>

      {/* List / empty state */}
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 py-4">
          <ListTodo size={20} className="text-neutral-700" />
          <p className="text-xs text-neutral-500">No tasks yet</p>
          <p className="text-[10px] text-neutral-600">Add what you want to work on.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto min-h-0 -mr-1 pr-1">
          {open.map((task) => <TaskRow key={task.id} task={task} />)}
          {done.length > 0 && (
            <div className="flex items-center justify-between mt-2 mb-0.5 px-1.5">
              <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Done · {doneCount}</span>
              <button onClick={clearCompletedTasks} className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors">
                Clear
              </button>
            </div>
          )}
          {done.map((task) => <TaskRow key={task.id} task={task} />)}
        </div>
      )}
    </div>
  )
}
