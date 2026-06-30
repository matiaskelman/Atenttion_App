export const createSystemSlice = (set) => ({
  activeApp: null,
  originalWallpaper: null,
  appUsageFocus: {},  // { processName: totalSeconds }
  appUsageBreak: {},  // { processName: totalSeconds }
  setActiveApp: (app) => set({ activeApp: app }),
  setOriginalWallpaper: (p) => set({ originalWallpaper: p }),
  recordAppUsage: (app, bucket, seconds) =>
    set((s) =>
      bucket === 'focus'
        ? { appUsageFocus: { ...s.appUsageFocus, [app]: (s.appUsageFocus[app] || 0) + seconds } }
        : { appUsageBreak: { ...s.appUsageBreak, [app]: (s.appUsageBreak[app] || 0) + seconds } }
    ),
  setAppUsage: (focus, breakUsage) => set({ appUsageFocus: focus || {}, appUsageBreak: breakUsage || {} }),
  // todayFocusSeconds lives in sessionSlice — set() is shared across all slices
  resetDailyMetrics: () => set({ appUsageFocus: {}, appUsageBreak: {}, todayFocusSeconds: 0 })
})
