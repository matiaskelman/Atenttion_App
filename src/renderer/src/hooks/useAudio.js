import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'

// ─── Buffer generators ────────────────────────────────────────────────────────

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

// White noise: bandpass 100 Hz – 9 kHz — removes the harsh sizzle while keeping the masking character
// Modulation at 1/8 Hz for an 8 s seamless loop.
function generateWhiteNoise(ctx) {
  const sr = ctx.sampleRate
  const total = sr * 8
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  const lpA = Math.exp(-2 * Math.PI * 9000 / sr)
  const hpA = Math.exp(-2 * Math.PI * 100  / sr)
  let lpL=0, lpR=0, hpL=0, hpR=0, prevLpL=0, prevLpR=0
  for (let i = 0; i < total; i++) {
    const wL = Math.random() * 2 - 1
    const wR = Math.random() * 2 - 1
    lpL=(1-lpA)*wL+lpA*lpL;  lpR=(1-lpA)*wR+lpA*lpR
    hpL=lpL-prevLpL+hpA*hpL; hpR=lpR-prevLpR+hpA*hpR
    prevLpL=lpL; prevLpR=lpR
    L[i]=hpL; R[i]=hpR
  }

  // Barely-perceptible swell — one complete cycle over 8 s
  for (let i = 0; i < total; i++) {
    const mod = 0.94 + 0.06 * Math.sin(2 * Math.PI * (1/8) * i / sr)
    L[i] *= mod; R[i] *= mod
  }

  normalizeBuffer(buf, 0.70)
  return buf
}

// Pink noise: independent stereo Voss-McCartney + gentle LP at 12 kHz to smooth harsh tops
// Modulation at 1/8 Hz for an 8 s seamless loop.
function generatePinkNoise(ctx) {
  const sr = ctx.sampleRate
  const total = sr * 8
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  let b0L=0,b1L=0,b2L=0,b3L=0,b4L=0,b5L=0,b6L=0
  let b0R=0,b1R=0,b2R=0,b3R=0,b4R=0,b5R=0,b6R=0

  const lpA = Math.exp(-2 * Math.PI * 12000 / sr)
  const hpA = Math.exp(-2 * Math.PI * 60   / sr)
  let smL=0, smR=0, hpL=0, hpR=0, prevSmL=0, prevSmR=0

  for (let i = 0; i < total; i++) {
    const wL = Math.random() * 2 - 1
    const wR = Math.random() * 2 - 1

    b0L=0.99886*b0L+wL*0.0555179; b1L=0.99332*b1L+wL*0.0750759
    b2L=0.96900*b2L+wL*0.1538520; b3L=0.86650*b3L+wL*0.3104856
    b4L=0.55000*b4L+wL*0.5329522; b5L=-0.7616*b5L-wL*0.0168980
    const pL=(b0L+b1L+b2L+b3L+b4L+b5L+b6L+wL*0.5362)*0.11; b6L=wL*0.115926

    b0R=0.99886*b0R+wR*0.0555179; b1R=0.99332*b1R+wR*0.0750759
    b2R=0.96900*b2R+wR*0.1538520; b3R=0.86650*b3R+wR*0.3104856
    b4R=0.55000*b4R+wR*0.5329522; b5R=-0.7616*b5R-wR*0.0168980
    const pR=(b0R+b1R+b2R+b3R+b4R+b5R+b6R+wR*0.5362)*0.11; b6R=wR*0.115926

    smL=(1-lpA)*pL+lpA*smL; smR=(1-lpA)*pR+lpA*smR
    hpL=smL-prevSmL+hpA*hpL; hpR=smR-prevSmR+hpA*hpR
    prevSmL=smL; prevSmR=smR
    L[i]=hpL; R[i]=hpR
  }

  // Subtle swell — one complete cycle over 8 s
  for (let i = 0; i < total; i++) {
    const mod = 0.93 + 0.07 * Math.sin(2 * Math.PI * (1/8) * i / sr)
    L[i] *= mod; R[i] *= mod
  }

  normalizeBuffer(buf, 0.70)
  return buf
}

// Stereo brown noise — two independent channels for a wide, roomier feel
function generateBrownNoise(ctx) {
  const sr = ctx.sampleRate
  const n = sr * 8
  const buf = ctx.createBuffer(2, n, sr)
  const dL = buf.getChannelData(0)
  const dR = buf.getChannelData(1)
  let lastL = 0, lastR = 0
  for (let i = 0; i < n; i++) {
    dL[i] = (lastL + 0.02 * (Math.random() * 2 - 1)) / 1.02
    lastL = dL[i]; dL[i] *= 3.5
    dR[i] = (lastR + 0.02 * (Math.random() * 2 - 1)) / 1.02
    lastR = dR[i]; dR[i] *= 3.5
  }
  normalizeBuffer(buf, 0.82)
  return buf
}

// LoFi beat: 80 BPM — vinyl hiss reduced for a smoother listen
function generateLofiBeat(ctx) {
  const sr = ctx.sampleRate
  const spb = Math.round(sr * 60 / 80)
  const measures = 4
  const total = spb * 4 * measures

  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  const clamp = (x) => Math.max(-1, Math.min(1, x))

  function kick(pos) {
    const dur = Math.round(sr * 0.45)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t = i / sr
      const s = clamp(Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-t*38)) * t) * Math.exp(-t*9) * 0.78)
      L[pos+i] += s;  R[pos+i] += s * 0.92
    }
  }

  function snare(pos) {
    const dur = Math.round(sr * 0.24)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t = i / sr
      const amp = Math.exp(-t*13) * 0.48
      const s   = (Math.sin(2 * Math.PI * 185 * t) * 0.3 + (Math.random()*2-1) * 0.55) * amp
      L[pos+i] += s * 0.95;  R[pos+i] += s
    }
  }

  function hihat(pos, open = false) {
    const dur   = Math.round(sr * (open ? 0.11 : 0.034))
    const decay = open ? 28 : 95
    for (let i = 0; i < dur && pos+i < total; i++) {
      const s = (Math.random()*2-1) * Math.exp(-i/sr * decay) * 0.21
      L[pos+i] += s;  R[pos+i] += s
    }
  }

  function bass(pos, freq) {
    const dur = Math.round(spb * 1.1)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t   = i / sr
      const env = (1 - Math.exp(-t*22)) * Math.exp(-t*1.8) * 0.38
      const s   = (Math.sin(2*Math.PI*freq*t) + Math.sin(2*Math.PI*freq*2*t)*0.38) * env
      L[pos+i] += s;  R[pos+i] += s
    }
  }

  // Softer vinyl hiss
  for (let i = 0; i < total; i++) {
    const h = (Math.random()*2-1) * 0.004
    L[i] += h;  R[i] += h
  }

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
      hihat(bpos + Math.round(spb/2), b%2 === 1)
      bass(bpos, bassNotes[m*4+b])
    }
  }

  normalizeBuffer(buf)
  return buf
}

// LoFi Study: 70 BPM — lighter hiss and softer rimshot
function generateLofiBeat2(ctx) {
  const sr  = ctx.sampleRate
  const spb = Math.round(sr * 60 / 70)
  const measures = 4
  const total = spb * 4 * measures

  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  function kick(pos) {
    const dur = Math.round(sr * 0.40)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t = i / sr
      const s = Math.sin(2*Math.PI*(55+70*Math.exp(-t*32))*t) * Math.exp(-t*8) * 0.68
      L[pos+i] += s;  R[pos+i] += s * 0.90
    }
  }

  function rimshot(pos) {
    const dur = Math.round(sr * 0.14)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t   = i / sr
      const amp = Math.exp(-t*22) * 0.28
      const s   = (Math.sin(2*Math.PI*220*t)*0.4 + (Math.random()*2-1)*0.50) * amp
      L[pos+i] += s * 0.92;  R[pos+i] += s
    }
  }

  function hihat(pos) {
    const dur = Math.round(sr * 0.028)
    for (let i = 0; i < dur && pos+i < total; i++) {
      L[pos+i] += (Math.random()*2-1) * Math.exp(-i/sr*110) * 0.16
      R[pos+i] = L[pos+i]
    }
  }

  function bass(pos, freq) {
    const dur = Math.round(spb * 1.15)
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t   = i / sr
      const env = (1-Math.exp(-t*18)) * Math.exp(-t*1.4) * 0.36
      L[pos+i] += (Math.sin(2*Math.PI*freq*t) + Math.sin(2*Math.PI*freq*2*t)*0.35) * env
      R[pos+i] = L[pos+i]
    }
  }

  function pad(pos, freqs) {
    const dur = spb * 2
    for (let i = 0; i < dur && pos+i < total; i++) {
      const t   = i / sr
      const env = (1-Math.exp(-t*3)) * Math.exp(-t*0.8) * 0.055
      let s = 0
      for (const f of freqs) s += Math.sin(2*Math.PI*f*t)
      L[pos+i] += s * env;  R[pos+i] += s * env
    }
  }

  // Lighter hiss
  for (let i = 0; i < total; i++) {
    const h = (Math.random()*2-1) * 0.003
    L[i] += h;  R[i] += h
  }

  const bassNotes = [
     82.4,  98.0, 110.0,  82.4,
     98.0, 110.0, 123.5,  98.0,
     82.4, 110.0,  98.0,  82.4,
    110.0,  82.4,  98.0, 110.0,
  ]
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
      hihat(bpos)
      hihat(bpos + Math.round(spb/2))
      bass(bpos, bassNotes[m*4+b])
    }
  }

  normalizeBuffer(buf)
  return buf
}

// ─── Generator map & file-based sounds ───────────────────────────────────────

const GENERATORS = {
  white:  generateWhiteNoise,
  pink:   generatePinkNoise,
  brown:  generateBrownNoise,
  lofi:   generateLofiBeat,
  lofi2:  generateLofiBeat2,
}

const FILE_SOUNDS = new Set(['rain', 'forest', 'cafe'])
const SOUND_BASE  = import.meta.env.PROD ? 'sounds://root' : '/sounds'

async function loadSoundFile(ctx, name) {
  const response = await fetch(`${SOUND_BASE}/${name}.mp3`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  return ctx.decodeAudioData(arrayBuffer)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudio() {
  const setAudioPlaying = useStore((s) => s.setAudioPlaying)

  const ctxRef     = useRef(null)
  const gainRef    = useRef(null)
  const sourceRef  = useRef(null)
  const chainRef   = useRef([])
  const buffersRef = useRef({})

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

    if (!buffersRef.current[type]) {
      try {
        buffersRef.current[type] = FILE_SOUNDS.has(type)
          ? await loadSoundFile(ctx, type)
          : GENERATORS[type](ctx)
      } catch (err) {
        console.error(`[audio] failed to load ${type}:`, err)
        return
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffersRef.current[type]
    source.loop = true

    const intermediates = []

    // LoFi variants get an extra warm low-pass for the characteristic muffled feel
    if (type === 'lofi' || type === 'lofi2') {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 4800
      lp.Q.value = 0.75
      intermediates.push(lp)
    }

    let prev = source
    for (const node of intermediates) { prev.connect(node); prev = node }
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

  useEffect(() => {
    return () => {
      stopCurrent()
      ctxRef.current?.close().catch(() => {})
    }
  }, [stopCurrent])

  return { playing, volume, setVolume, play, stop }
}
