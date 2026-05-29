export function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 523.25 // C5
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch (_) {}
}

// Soft wood-block tick used during the last 10 s of a focus session (work ending → break upcoming)
export function playFocusEndTick() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    // Warm mid-range sine + quick decay — pleasant, non-jarring
    const osc = ctx.createOscillator()
    osc.connect(gain)
    osc.type = 'sine'
    osc.frequency.value = 880 // A5 — bright but gentle
    gain.gain.setValueAtTime(0.07, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start()
    osc.stop(ctx.currentTime + 0.18)
    osc.onended = () => ctx.close()
  } catch (_) {}
}

// Soft low chime tick used during the last 10 s of a break (break ending → focus upcoming)
export function playBreakEndTick() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    // Low, rounded sine — calm, meditative
    const osc = ctx.createOscillator()
    osc.connect(gain)
    osc.type = 'sine'
    osc.frequency.value = 330 // E4 — warm, grounding
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
    osc.start()
    osc.stop(ctx.currentTime + 0.28)
    osc.onended = () => ctx.close()
  } catch (_) {}
}
