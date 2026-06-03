const fs = require('fs')
const path = require('path')
const https = require('https')

const SOUNDS_DIR = path.join(__dirname, '../src/renderer/public/sounds')
fs.mkdirSync(SOUNDS_DIR, { recursive: true })

const SOUNDS = [
  {
    filename: 'rain.mp3',
    url: 'https://cdn.freesound.org/previews/518/518863_3490256-lq.mp3',
    credit: 'Rain.wav by idomusics (CC0) — freesound.org/sounds/518863',
  },
  {
    filename: 'forest.mp3',
    url: 'https://cdn.freesound.org/previews/723/723913_2008500-lq.mp3',
    credit: 'Forest birds seamless loop by Magnesus (CC0) — freesound.org/sounds/723913',
  },
  {
    filename: 'cafe.mp3',
    url: 'https://cdn.freesound.org/previews/813/813868_2520418-lq.mp3',
    credit: 'Coffee Shop Ambience by CVLTIV8R (CC0) — freesound.org/sounds/813868',
  },
]

function download(url, dest, hops) {
  if (hops > 8) { console.error('[setup-sounds] Too many redirects'); process.exit(1) }
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
      console.error(`[setup-sounds] HTTP ${res.statusCode} for ${url}`)
      return
    }
    let bytes = 0
    res.on('data', (chunk) => { bytes += chunk.length })
    res.pipe(file)
    file.on('finish', () => {
      file.close(() => {
        fs.renameSync(tmp, dest)
        console.log(`[setup-sounds] ${path.basename(dest)} (${(bytes / 1024).toFixed(0)} KB)`)
      })
    })
  }).on('error', (err) => {
    file.close(() => fs.unlink(tmp, () => {}))
    console.warn(`[setup-sounds] could not download ${path.basename(dest)}: ${err.message}`)
  })
}

const credits = SOUNDS.map((s) => s.credit).join('\n') + '\n'
fs.writeFileSync(path.join(SOUNDS_DIR, 'CREDITS.txt'), credits)

for (const sound of SOUNDS) {
  const dest = path.join(SOUNDS_DIR, sound.filename)
  if (fs.existsSync(dest)) {
    console.log(`[setup-sounds] ${sound.filename} already present, skipping`)
    continue
  }
  console.log(`[setup-sounds] Downloading ${sound.filename}...`)
  download(sound.url, dest, 0)
}
