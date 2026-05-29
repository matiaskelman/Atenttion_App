import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'

// ─── Buffer generators ────────────────────────────────────────────────────────
// All audio is synthesised algorithmically — no external files, no copyright.

function normalizeBuffer(buf, peak = 0.88) {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    let max = 0
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]))
    if (max > 0) {
      const s = peak / max
      for (let i = 0; i < d.length; i++) d[i] *= s
    }
  }
}

function generateWhiteNoise(ctx) {
  const n = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function generateBrownNoise(ctx) {
  const n = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    d[i] = (last + 0.02 * w) / 1.02
    last = d[i]
    d[i] *= 3.5
  }
  normalizeBuffer(buf)
  return buf
}

function generatePinkNoise(ctx) {
  const n = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.96900 * b2 + w * 0.1538520
    b3 = 0.86650 * b3 + w * 0.3104856
    b4 = 0.55000 * b4 + w * 0.5329522
    b5 = -0.7616  * b5 - w * 0.0168980
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  normalizeBuffer(buf)
  return buf
}

// Lo-fi beat: 80 BPM, 4-measure loop, programmatic drum + bass synthesis
function generateLofiBeat(ctx) {
  const sr = ctx.sampleRate
  const spb = Math.round(sr * 60 / 80)   // samples per beat at 80 BPM
  const measures = 4
  const total = spb * 4 * measures

  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  const clamp = (x) => Math.max(-1, Math.min(1, x))

  function kick(pos) {
    const dur = Math.round(sr * 0.45)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const freq = 60 + 80 * Math.exp(-t * 38)
      const amp = Math.exp(-t * 9) * 0.78
      const s = clamp(Math.sin(2 * Math.PI * freq * t) * amp)
      L[pos + i] += s
      R[pos + i] += s * 0.92
    }
  }

  function snare(pos) {
    const dur = Math.round(sr * 0.24)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const amp = Math.exp(-t * 13) * 0.48
      const tone = Math.sin(2 * Math.PI * 185 * t) * 0.3
      const noise = (Math.random() * 2 - 1) * 0.7
      const s = (tone + noise) * amp
      L[pos + i] += s * 0.95
      R[pos + i] += s
    }
  }

  function hihat(pos, open = false) {
    const dur = Math.round(sr * (open ? 0.11 : 0.034))
    const decay = open ? 28 : 95
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const amp = Math.exp(-t * decay) * 0.21
      const s = (Math.random() * 2 - 1) * amp
      L[pos + i] += s
      R[pos + i] += s
    }
  }

  function bass(pos, freq) {
    const dur = Math.round(spb * 1.1)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const env = (1 - Math.exp(-t * 22)) * Math.exp(-t * 1.8) * 0.38
      const s = (Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 2 * t) * 0.38) * env
      L[pos + i] += s
      R[pos + i] += s
    }
  }

  // Soft vinyl hiss throughout
  for (let i = 0; i < total; i++) {
    const hiss = (Math.random() * 2 - 1) * 0.007
    L[i] += hiss; R[i] += hiss
  }

  // Bass pattern — A1/C2/D2 ostinato (4 notes × 4 measures = 16 slots)
  const bassNotes = [
    55.0, 65.4, 55.0, 61.7,
    73.4, 65.4, 55.0, 61.7,
    55.0, 65.4, 73.4, 65.4,
    55.0, 61.7, 65.4, 55.0,
  ]

  for (let m = 0; m < measures; m++) {
    const base = m * 4 * spb
    for (let b = 0; b < 4; b++) {
      const bpos = base + b * spb
      if (b === 0 || b === 2) kick(bpos)
      if (b === 1 || b === 3) snare(bpos)
      hihat(bpos, false)
      hihat(bpos + Math.round(spb / 2), b % 2 === 1)
      bass(bpos, bassNotes[m * 4 + b])
    }
  }

  normalizeBuffer(buf)
  return buf
}

// Classical: slow C-major / D-minor arpeggio with piano-like harmonic timbre
function generateClassical(ctx) {
  const sr = ctx.sampleRate
  // eighth notes at 72 BPM
  const noteSamples = Math.round(sr * 60 / 72 / 2)
  const semitone = (n) => 261.63 * Math.pow(2, n / 12)

  // 16-note sequence — two rising+falling arpeggios
  const seq = [
    0, 4, 7, 12,   // C4 E4 G4 C5 (C major ascending)
    12, 7, 4, 0,   // C5 G4 E4 C4 (descending)
    2, 5, 9, 14,   // D4 F4 A4 D5 (D minor ascending)
    14, 9, 5, 2,   // D5 A4 F4 D4 (descending)
  ]

  const total = seq.length * noteSamples
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  seq.forEach((semi, idx) => {
    const f = semitone(semi)
    const start = idx * noteSamples
    for (let j = 0; j < noteSamples; j++) {
      const t = j / sr
      const attack = Math.min(1, t / 0.008)          // 8 ms attack
      const decay  = Math.exp(-t * 3.2)
      const env    = attack * decay * 0.32
      // Fundamental + harmonic partials for piano timbre
      const s = (
        Math.sin(2 * Math.PI * f       * t) * 1.00 +
        Math.sin(2 * Math.PI * f * 2   * t) * 0.42 +
        Math.sin(2 * Math.PI * f * 3   * t) * 0.20 +
        Math.sin(2 * Math.PI * f * 4   * t) * 0.08
      ) * env
      L[start + j] += s
      R[start + j] += s * 0.96
    }
  })

  // Simple reverb tail: one short predelay reflection
  const delay = Math.round(sr * 0.11)
  for (let i = delay; i < total; i++) {
    L[i] += L[i - delay] * 0.14
    R[i] += R[i - delay] * 0.14
  }

  normalizeBuffer(buf)
  return buf
}

// ─── Study Lo-fi: 70 BPM, sparse kick-only downbeat, E-minor bass, subtle chord pad
function generateLofiBeat2(ctx) {
  const sr  = ctx.sampleRate
  const spb = Math.round(sr * 60 / 70)   // samples per beat at 70 BPM
  const measures = 4
  const total = spb * 4 * measures

  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  function kick(pos) {
    const dur = Math.round(sr * 0.40)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const freq = 55 + 70 * Math.exp(-t * 32)
      const amp  = Math.exp(-t * 8) * 0.68
      const s = Math.sin(2 * Math.PI * freq * t) * amp
      L[pos + i] += s; R[pos + i] += s * 0.90
    }
  }

  // Soft brush rimshot — lighter than a snare
  function rimshot(pos) {
    const dur = Math.round(sr * 0.14)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const amp  = Math.exp(-t * 22) * 0.28
      const tone = Math.sin(2 * Math.PI * 220 * t) * 0.4
      const s = (tone + (Math.random() * 2 - 1) * 0.6) * amp
      L[pos + i] += s * 0.92; R[pos + i] += s
    }
  }

  function hihat(pos) {
    const dur = Math.round(sr * 0.028)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      L[pos + i] += (Math.random() * 2 - 1) * Math.exp(-t * 110) * 0.16
      R[pos + i] = L[pos + i]
    }
  }

  function bass(pos, freq) {
    const dur = Math.round(spb * 1.15)
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const env = (1 - Math.exp(-t * 18)) * Math.exp(-t * 1.4) * 0.36
      L[pos + i] += (Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 2 * t) * 0.35) * env
      R[pos + i] = L[pos + i]
    }
  }

  // Sustained chord pad — very quiet, slow attack
  function pad(pos, freqs) {
    const dur = spb * 2
    for (let i = 0; i < dur && pos + i < total; i++) {
      const t = i / sr
      const env = (1 - Math.exp(-t * 3)) * Math.exp(-t * 0.8) * 0.055
      let s = 0
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * t)
      L[pos + i] += s * env; R[pos + i] += s * env
    }
  }

  // Very soft vinyl hiss
  for (let i = 0; i < total; i++) {
    const h = (Math.random() * 2 - 1) * 0.006
    L[i] += h; R[i] += h
  }

  // Bass pattern in E natural minor: E2 G2 A2 B2 (82.4, 98.0, 110.0, 123.5 Hz)
  const bassNotes = [
    82.4,  98.0, 110.0,  82.4,
    98.0, 110.0, 123.5,  98.0,
    82.4, 110.0,  98.0,  82.4,
   110.0,  82.4,  98.0, 110.0,
  ]
  // Chord pad pairs (root + 5th)
  const padChords = [
    [82.4, 123.5], [82.4, 123.5],
    [98.0, 146.8], [82.4, 123.5],
  ]

  for (let m = 0; m < measures; m++) {
    const base = m * 4 * spb
    pad(base, padChords[m])
    for (let b = 0; b < 4; b++) {
      const bpos = base + b * spb
      if (b === 0) kick(bpos)
      if (b === 2) rimshot(bpos)
      // 8th-note hi-hats
      hihat(bpos)
      hihat(bpos + Math.round(spb / 2))
      bass(bpos, bassNotes[m * 4 + b])
    }
  }

  normalizeBuffer(buf)
  return buf
}

// ─── Classical Study: I–V–vi–IV in C, Bach-prelude broken-chord arpeggios
function generateClassical2(ctx) {
  const sr = ctx.sampleRate
  // quarter notes at 60 BPM — relaxed pace
  const noteSamples = Math.round(sr * 60 / 60)
  const C4 = 261.63
  const semi = (n) => C4 * Math.pow(2, n / 12)

  // 4 chords × 8 notes each = 32 notes × 1s = 32s loop
  // Each chord plays as a rising then falling arpeggio (Bach prelude style)
  const chords = [
    [0, 4, 7, 12, 7, 4, 0, 4],    // C major  (I)
    [-5, -1, 2, 7, 2, -1, -5, -1], // G major  (V)
    [-3, 0, 4, 9, 4, 0, -3, 0],    // A minor  (vi)
    [-7, -3, 0, 5, 0, -3, -7, -3], // F major  (IV)
  ]
  const seq = chords.flat()

  const total = seq.length * noteSamples
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  seq.forEach((s, idx) => {
    const f     = semi(s)
    const start = idx * noteSamples
    for (let j = 0; j < noteSamples; j++) {
      const t   = j / sr
      const env = Math.min(1, t / 0.007) * Math.exp(-t * 2.8) * 0.30
      const sample = (
        Math.sin(2 * Math.PI * f     * t) * 1.00 +
        Math.sin(2 * Math.PI * f * 2 * t) * 0.40 +
        Math.sin(2 * Math.PI * f * 3 * t) * 0.18 +
        Math.sin(2 * Math.PI * f * 4 * t) * 0.07
      ) * env
      L[start + j] += sample
      R[start + j] += sample * 0.96
    }
  })

  // Two-reflection reverb for spatial warmth
  const d1 = Math.round(sr * 0.09)
  const d2 = Math.round(sr * 0.19)
  for (let i = d2; i < total; i++) {
    if (i >= d1) L[i] += L[i - d1] * 0.12
    L[i] += L[i - d2] * 0.07
    if (i >= d1) R[i] += R[i - d1] * 0.12
    R[i] += R[i - d2] * 0.07
  }

  normalizeBuffer(buf)
  return buf
}

// ─── Generator map ────────────────────────────────────────────────────────────

const GENERATORS = {
  white:      generateWhiteNoise,
  brown:      generateBrownNoise,
  pink:       generatePinkNoise,
  lofi:       generateLofiBeat,
  lofi2:      generateLofiBeat2,
  classical:  generateClassical,
  classical2: generateClassical2,
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudio() {
  const setAudioPlaying = useStore((s) => s.setAudioPlaying)

  const ctxRef     = useRef(null)
  const gainRef    = useRef(null)
  const sourceRef  = useRef(null)
  const chainRef   = useRef([])          // intermediate nodes (filters, etc.)
  const buffersRef = useRef({})          // cached generated buffers

  const [playing, setPlaying]   = useState(null)
  const [volume,  setVolumeVal] = useState(0.65)

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
      gainRef.current = ctxRef.current.createGain()
      gainRef.current.gain.value = volume
      gainRef.current.connect(ctxRef.current.destination)
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [volume])

  const stopCurrent = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch (_) {}
      sourceRef.current = null
    }
    chainRef.current.forEach((n) => { try { n.disconnect() } catch (_) {} })
    chainRef.current = []
  }, [])

  const play = useCallback(async (type) => {
    if (playing === type) {
      stopCurrent()
      setPlaying(null)
      setAudioPlaying(null)
      return
    }

    stopCurrent()
    const ctx = getCtx()

    // Generate buffer once and cache it
    if (!buffersRef.current[type]) {
      buffersRef.current[type] = GENERATORS[type](ctx)
    }

    const source = ctx.createBufferSource()
    source.buffer = buffersRef.current[type]
    source.loop = true

    const intermediates = []

    // Both LoFi variants get a warm low-pass for the characteristic muffled sound
    if (type === 'lofi' || type === 'lofi2') {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 4800
      lp.Q.value = 0.75
      intermediates.push(lp)
    }

    // Wire chain: source → [filter?] → masterGain → destination
    let prev = source
    for (const node of intermediates) {
      prev.connect(node)
      prev = node
    }
    prev.connect(gainRef.current)

    source.start()
    sourceRef.current = source
    chainRef.current  = intermediates

    setPlaying(type)
    setAudioPlaying(type)
  }, [playing, stopCurrent, getCtx, setAudioPlaying])

  const setVolume = useCallback((v) => {
    setVolumeVal(v)
    if (gainRef.current && ctxRef.current) {
      gainRef.current.gain.setTargetAtTime(v, ctxRef.current.currentTime, 0.02)
    }
  }, [])

  const stop = useCallback(() => {
    stopCurrent()
    setPlaying(null)
    setAudioPlaying(null)
  }, [stopCurrent, setAudioPlaying])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCurrent()
      ctxRef.current?.close().catch(() => {})
    }
  }, [stopCurrent])

  return { playing, volume, setVolume, play, stop }
}
