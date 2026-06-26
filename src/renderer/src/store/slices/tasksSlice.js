// User to-do list shown on the Focus page. Persisted with preferences (buildPrefs → atenttion-preferences.json)
// via the debounced autosave, so every mutation produces a new `tasks` array reference (shallow-diffed).
function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// On-time = completed on or before the due date. `due` and the completion date are both
// local 'YYYY-MM-DD' strings, so a lexicographic compare is also chronological.
function isOnTime(due, completedAtISO) {
  if (!due || !completedAtISO) return false
  return new Date(completedAtISO).toLocaleDateString('en-CA') <= due
}

export const createTasksSlice = (set) => ({
  tasks: [], // { id, title, due: 'YYYY-MM-DD' | null, done, completedAt: ISO | null, createdAt }
  // Lifetime completion counters — persisted, so they survive "clear done" (which deletes
  // the task objects). These drive the Tasks Completed / On-Time Finishes milestone tracks.
  tasksCompletedTotal: 0,
  tasksCompletedOnTime: 0,

  addTask: (title, due = null) => {
    const t = (title || '').trim()
    if (!t) return
    set((s) => {
      const fu = s.featuresUsed || {}
      // Latch discovery flags for the Getting Started checklist + Planner badge.
      const nextFu = !fu.task || (due && !fu.taskDue)
        ? { ...fu, task: true, ...(due ? { taskDue: true } : {}) }
        : fu
      return {
        tasks: [...s.tasks, { id: makeId(), title: t, due: due || null, done: false, completedAt: null, createdAt: new Date().toISOString() }],
        ...(nextFu !== fu ? { featuresUsed: nextFu } : {})
      }
    })
  },

  toggleTask: (id) => set((s) => {
    const task = s.tasks.find((t) => t.id === id)
    if (!task) return {}
    const becomingDone = !task.done
    const completedAt = becomingDone ? new Date().toISOString() : null
    const tasks = s.tasks.map((t) => (t.id === id ? { ...t, done: becomingDone, completedAt } : t))

    // Un-checking never decrements the lifetime counters (a completion already happened).
    if (!becomingDone) return { tasks }

    const patch = {
      tasks,
      tasksCompletedTotal: (s.tasksCompletedTotal || 0) + 1,
      tasksCompletedOnTime: (s.tasksCompletedOnTime || 0) + (isOnTime(task.due, completedAt) ? 1 : 0)
    }
    // Clean Slate badge: just emptied a non-trivial open list (≥3 tasks, none left open).
    if (tasks.length >= 3 && tasks.every((t) => t.done) && !s.featuresUsed?.cleanSlate) {
      patch.featuresUsed = { ...(s.featuresUsed || {}), cleanSlate: true }
    }
    return patch
  }),

  setTaskDue: (id, due) => set((s) => {
    const fu = s.featuresUsed || {}
    return {
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, due: due || null } : t)),
      ...(due && !fu.taskDue ? { featuresUsed: { ...fu, taskDue: true } } : {})
    }
  }),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clearCompletedTasks: () => set((s) => ({ tasks: s.tasks.filter((t) => !t.done) })),
})
