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

// Rain: bandpass noise wash + sparse drop impacts + intensity swell
// Modulation frequencies are integer multiples of 1/12 Hz so the 12 s loop seam is phase-aligned.
function generateRain(ctx) {
  const sr = ctx.sampleRate
  const seconds = 12
  const total = sr * seconds
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  // Bandpass noise: LP at 4500 Hz then HP at 150 Hz — warm rain wash
  const lpA = Math.exp(-2 * Math.PI * 4500 / sr)
  const hpA = Math.exp(-2 * Math.PI * 150  / sr)
  let lpL=0, lpR=0, hpL=0, hpR=0, prevLpL=0, prevLpR=0
  for (let i = 0; i < total; i++) {
    const wL = Math.random() * 2 - 1
    const wR = Math.random() * 2 - 1
    lpL = (1-lpA)*wL + lpA*lpL;  lpR = (1-lpA)*wR + lpA*lpR
    hpL = lpL - prevLpL + hpA*hpL;  hpR = lpR - prevLpR + hpA*hpR
    prevLpL = lpL;  prevLpR = lpR
    L[i] = hpL;  R[i] = hpR
  }

  // Gentle intensity swell — two harmonics of 1/12 Hz (complete cycles, seamless)
  for (let i = 0; i < total; i++) {
    const t = i / sr
    const mod = 0.82 + 0.12 * Math.sin(2 * Math.PI * (1/12) * t)
              + 0.06 * Math.sin(2 * Math.PI * (2/12) * t + Math.PI * 0.5)
    L[i] *= mod;  R[i] *= mod
  }

  // Sparse heavy-drop impacts for texture
  for (let d = 0; d < 50; d++) {
    const pos   = Math.floor(Math.random() * (total - sr * 0.04))
    const amp   = 0.06 + Math.random() * 0.14
    const decay = 250  + Math.random() * 400
    const dur   = Math.round(sr * (0.01 + Math.random() * 0.025))
    const pan   = 0.3  + Math.random() * 0.7
    for (let j = 0; j < dur && pos+j < total; j++) {
      const s = (Math.random() * 2 - 1) * Math.exp(-j/sr * decay) * amp
      L[pos+j] += s * (1 - pan*0.3);  R[pos+j] += s * pan
    }
  }

  normalizeBuffer(buf, 0.80)
  return buf
}

// Forest: low-frequency wind (triple LP cascade) + mid-frequency leaf rustle + gust envelope
// Same seamless-loop trick: modulation at 1/12 and 2/12 Hz for a 12 s buffer.
function generateForest(ctx) {
  const sr = ctx.sampleRate
  const seconds = 12
  const total = sr * seconds
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  // Wind base: three cascaded LP passes at ~500 Hz — deep, airy rush
  const wlpA = Math.exp(-2 * Math.PI * 500 / sr)
  let wL1=0, wL2=0, wL3=0,  wR1=0, wR2=0, wR3=0
  for (let i = 0; i < total; i++) {
    const rL = Math.random() * 2 - 1
    const rR = Math.random() * 2 - 1
    wL1 = (1-wlpA)*rL  + wlpA*wL1;  wL2 = (1-wlpA)*wL1 + wlpA*wL2;  wL3 = (1-wlpA)*wL2 + wlpA*wL3
    wR1 = (1-wlpA)*rR  + wlpA*wR1;  wR2 = (1-wlpA)*wR1 + wlpA*wR2;  wR3 = (1-wlpA)*wR2 + wlpA*wR3
    L[i] = wL3;  R[i] = wR3
  }

  // Leaf rustle: bandpass 700–3000 Hz mixed at 28 %
  const llpA = Math.exp(-2 * Math.PI * 3000 / sr)
  const lhpA = Math.exp(-2 * Math.PI * 700  / sr)
  let llpL=0, lhpL=0, lpPrevL=0,  llpR=0, lhpR=0, lpPrevR=0
  for (let i = 0; i < total; i++) {
    const rL = Math.random() * 2 - 1
    const rR = Math.random() * 2 - 1
    llpL = (1-llpA)*rL  + llpA*llpL;  lhpL = llpL - lpPrevL + lhpA*lhpL;  lpPrevL = llpL
    llpR = (1-llpA)*rR  + llpA*llpR;  lhpR = llpR - lpPrevR + lhpA*lhpR;  lpPrevR = llpR
    L[i] += lhpL * 0.28;  R[i] += lhpR * 0.28
  }

  // Gust envelope — two harmonics of 1/12 Hz (seamless)
  for (let i = 0; i < total; i++) {
    const t = i / sr
    const gust = 0.55 + 0.30 * Math.sin(2 * Math.PI * (1/12) * t)
               + 0.15 * Math.sin(2 * Math.PI * (2/12) * t + Math.PI * 0.3)
    L[i] *= gust;  R[i] *= gust
  }

  normalizeBuffer(buf, 0.78)
  return buf
}

// Café: muffled chatter (double LP + HP) + conversation bursts + sparse clinks
// 16 s buffer; modulation at 1/16 and 2/16 Hz for a seamless loop.
function generateCafe(ctx) {
  const sr = ctx.sampleRate
  const seconds = 16
  const total = sr * seconds
  const buf = ctx.createBuffer(2, total, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)

  // Muffled chatter base: double LP (2000 → 900 Hz) + HP at 200 Hz
  const lp1A = Math.exp(-2 * Math.PI * 2000 / sr)
  const lp2A = Math.exp(-2 * Math.PI * 900  / sr)
  const hpA  = Math.exp(-2 * Math.PI * 200  / sr)
  let lp1L=0, lp2L=0, hpL=0, prevLp2L=0
  let lp1R=0, lp2R=0, hpR=0, prevLp2R=0
  for (let i = 0; i < total; i++) {
    const wL = Math.random() * 2 - 1
    const wR = Math.random() * 2 - 1
    lp1L=(1-lp1A)*wL+lp1A*lp1L; lp2L=(1-lp2A)*lp1L+lp2A*lp2L; hpL=lp2L-prevLp2L+hpA*hpL; prevLp2L=lp2L
    lp1R=(1-lp1A)*wR+lp1A*lp1R; lp2R=(1-lp2A)*lp1R+lp2A*lp2R; hpR=lp2R-prevLp2R+hpA*hpR; prevLp2R=lp2R
    L[i] = hpL * 0.7;  R[i] = hpR * 0.7
  }

  // Conversation bursts — voices rising and falling in level
  for (let b = 0; b < 18; b++) {
    const pos = Math.floor(Math.random() * (total - sr))
    const dur = Math.round(sr * (0.3 + Math.random() * 0.7))
    const amp = 0.15 + Math.random() * 0.25
    for (let j = 0; j < dur && pos+j < total; j++) {
      const env = Math.sin(Math.PI * j / dur)
      L[pos+j] += (Math.random() * 2 - 1) * env * amp * 0.6
      R[pos+j] += (Math.random() * 2 - 1) * env * amp * 0.6
    }
  }

  // Cup / glass clinks — sparse, subtle
  for (let c = 0; c < 6; c++) {
    const pos = Math.floor(Math.random() * (total - sr * 0.15))
    const f   = 1400 + Math.random() * 1800
    const dur = Math.round(sr * 0.14)
    for (let j = 0; j < dur && pos+j < total; j++) {
      const t = j / sr
      const env = Math.exp(-t * 22) * 0.10
      L[pos+j] += Math.sin(2 * Math.PI * f          * t) * env
      R[pos+j] += Math.sin(2 * Math.PI * (f * 1.012) * t) * env
    }
  }

  // Activity swell — two harmonics of 1/16 Hz (seamless)
  for (let i = 0; i < total; i++) {
    const t = i / sr
    const mod = 0.80 + 0.14 * Math.sin(2 * Math.PI * (1/16) * t)
              + 0.06 * Math.sin(2 * Math.PI * (2/16) * t + Math.PI * 0.6)
    L[i] *= mod;  R[i] *= mod
  }

  normalizeBuffer(buf, 0.75)
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

// ─── Generator map ────────────────────────────────────────────────────────────

const GENERATORS = {
  white:  generateWhiteNoise,
  pink:   generatePinkNoise,
  brown:  generateBrownNoise,
  lofi:   generateLofiBeat,
  lofi2:  generateLofiBeat2,
  rain:   generateRain,
  forest: generateForest,
  cafe:   generateCafe,
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
      buffersRef.current[type] = GENERATORS[type](ctx)
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
