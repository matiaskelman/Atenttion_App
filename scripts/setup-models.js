const fs = require('fs')
const path = require('path')
const https = require('https')

const destDir = path.join(__dirname, '../src/renderer/public/models')
fs.mkdirSync(destDir, { recursive: true })

// --- MediaPipe WASM files ---
const wasmSrc = path.join(__dirname, '../node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = path.join(destDir, 'mediapipe')
fs.mkdirSync(wasmDest, { recursive: true })

if (fs.existsSync(wasmSrc)) {
  fs.readdirSync(wasmSrc).forEach((file) => {
    fs.copyFileSync(path.join(wasmSrc, file), path.join(wasmDest, file))
    console.log(`[setup-models] Copied mediapipe/${file}`)
  })
} else {
  console.warn('[setup-models] @mediapipe/tasks-vision not found — run npm install first')
}

// --- MediaPipe face landmarker model ---
const modelDest = path.join(destDir, 'face_landmarker.task')
if (fs.existsSync(modelDest)) {
  console.log('[setup-models] face_landmarker.task already present, skipping download')
  return
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

function download(url, dest, hops) {
  if (hops > 8) { console.error('[setup-models] Too many redirects'); process.exit(1) }
  const proto = url.startsWith('https') ? https : require('http')
  const tmp = dest + '.tmp'
  const file = fs.createWriteStream(tmp)
  proto.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      file.close(() => fs.unlink(tmp, () => {}))
      download(res.headers.location, dest, hops + 1)
      return
    }
    if (res.statusCode !== 200) {
      file.close(() => fs.unlink(tmp, () => {}))
      console.error(`[setup-models] HTTP ${res.statusCode} downloading model`)
      process.exit(1)
    }
    let bytes = 0
    res.on('data', (chunk) => { bytes += chunk.length })
    res.pipe(file)
    file.on('finish', () => {
      file.close(() => {
        fs.renameSync(tmp, dest)
        console.log(`[setup-models] Downloaded face_landmarker.task (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
      })
    })
  }).on('error', (err) => {
    file.close(() => fs.unlink(tmp, () => {}))
    console.error('[setup-models] Download error:', err.message)
    process.exit(1)
  })
}

console.log('[setup-models] Downloading face_landmarker.task (~2.3 MB)...')
download(MODEL_URL, modelDest, 0)
