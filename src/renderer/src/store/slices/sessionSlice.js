export const createSessionSlice = (set, get) => ({
  sessions: [],
  todayFocusSeconds: 0,
  streak: 0,
  lastSessionDate: null,
  addSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions.slice(-99), session],
      todayFocusSeconds: s.todayFocusSeconds + session.duration
    })),
  applySessionHistory: (sessions) => {
    const today = new Date().toLocaleDateString('en-CA')
    const todayFocusSeconds = sessions
      .filter((s) => new Date(s.date).toLocaleDateString('en-CA') === today)
      .reduce((sum, s) => sum + s.duration, 0)
    set({ sessions: sessions.slice(-100), todayFocusSeconds })
  },
  setStreak: (v) => set({ streak: v }),
  setLastSessionDate: (d) => set({ lastSessionDate: d }),
  updateStreak: () => {
    const s = get()
    const today = new Date().toLocaleDateString('en-CA')
    let newStreak = s.streak || 0
    if (!s.lastSessionDate) {
      newStreak = 1
    } else if (s.lastSessionDate === today) {
      // already counted today
    } else {
      const diffDays = Math.round(
        (new Date(today) - new Date(s.lastSessionDate)) / 86400000
      )
      newStreak = diffDays === 1 ? newStreak + 1 : 1
    }
    set({ streak: newStreak, lastSessionDate: today })
    return { streak: newStreak, lastSessionDate: today }
  }
})
