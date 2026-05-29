3# Atenttion

> A focus tracker that watches you back.

Atenttion is a desktop app that combines the Pomodoro technique with real-time eye tracking. It monitors your attention through your webcam, automatically pauses your timer when you look away, tracks your blink rate to warn against eye strain, and logs everything so you can see how your focus improves over time.

---

## What It Does

### Pomodoro Timer
Work in focused 25-minute sessions separated by short breaks. The timer uses the classic Pomodoro structure:
- **25 min** work session
- **5 min** short break
- After every 4 sessions: **15 min** long break

A circular progress ring shows how far through the current session you are. The timer auto-advances between sessions.

### Eye Tracking
Using your webcam and a local AI model (no data ever leaves your computer), Atenttion watches whether you're actually looking at the screen:

- **Auto-pause** — If you look away for more than 3 seconds while a timer is running, it pauses automatically. When you return, it resumes.
- **Blink detection** — Counts your blinks per minute. Healthy blinking is 15–20 BPM. If you drop below 12, you get a warning.
- **Focus log** — Every session records how long you were actually focused vs. away.

### Statistics
After each session, Atenttion logs:
- Total focus time
- Number of sessions completed
- Blink count and average blink rate
- Time spent looking away

These are shown as charts on the Stats page and saved to a Markdown file on your computer.

### System Monitor
See what app you're currently using (updated every 5 seconds), your CPU and memory usage, and change your desktop wallpaper from inside the app.

### Documents
Feed Atenttion with your PDFs, Word docs, notes, and web links. These get converted to readable text and stored as reference material you can review during focus sessions. Great for keeping your task context visible without switching windows.

---

## Requirements

| Requirement | Notes |
|---|---|
| Windows 10/11 or macOS 12+ | |
| Webcam | Required for eye tracking. App works without it, eye tracking just won't be available. |
| Python 3.8+ (optional) | Only needed for converting PDFs and Word documents in the Docs page. `.txt` and `.html` files work without it. |

---

## Installation

### Option A — Download (Recommended)

1. Go to the [Releases page](https://github.com/your-repo/releases)
2. Download `Atenttion-Setup.exe` (Windows) or `Atenttion.dmg` (macOS)
3. Run the installer

### Option B — Run from Source

You need [Node.js 20+](https://nodejs.org) installed.

```bash
git clone https://github.com/your-repo/atenttion-app
cd atenttion-app
npm install
npm run dev
```

---

## First Run

1. **Start a focus session** — Go to the Focus page and click the play button
2. **Enable eye tracking** — Click "Start Eye Tracking". Your browser will ask for webcam permission. Allow it.
3. **Wait for models to load** — The first time, AI models load in the background (a few seconds). You'll see "Loading models…" briefly.
4. **Work** — The timer runs. If you look away, it pauses. When you return, it resumes.

---

## The Four Pages

### Focus
Your main workspace. Shows the Pomodoro timer on the left and the eye tracking panel on the right. The timer ring changes color by mode: purple for work, green for short break, cyan for long break.

### Stats
Charts showing your focus sessions over time. Includes:
- Duration of each session (bar chart)
- Blink rate per session (line chart) — healthy is above 12 BPM
- A table of recent sessions with time, duration, blinks, and how long you were away

### System
- **Active App** — Shows which application is currently in the foreground, updated every 5 seconds. Keeps a short history of recent apps.
- **Hardware** — CPU and memory usage bars with percentages.
- **Wallpaper** — Enter a full path to an image file to set your desktop wallpaper. Your original wallpaper is saved so you can restore it.

### Docs
Import reference material to keep handy during focus sessions:
- Click **Browse Files** to pick PDFs, Word docs, spreadsheets, text files, or HTML
- Paste a URL and click **Add URL** to import a web page
- Each document is converted to readable text and stored locally
- Click the arrow on any document to expand and read its contents

**For PDF/Word/Excel/PowerPoint support**, you need Python and markitdown installed. If Python is found but markitdown isn't, a one-click install button appears. If Python isn't installed at all, only `.txt`, `.md`, and `.html` files will work.

---

## Your Data

Everything stays on your computer. Atenttion stores:

| File | Location | What's in it |
|---|---|---|
| `atenttion-sessions.md` | `%APPDATA%\atenttion-app\` (Windows) or `~/Library/Application Support/atenttion-app/` (Mac) | A table of every completed focus session with date, duration, blinks, blink rate, and away time |
| `atenttion-preferences.md` | Same folder | Your timer durations and other settings |

Both files are plain Markdown — you can open them in any text editor or Obsidian.

No accounts. No internet required. No telemetry.

---

## Eye Tracking: How It Works (Plain English)

1. Your webcam captures video frames at 15 frames per second.
2. A small AI model (TensorFlow.js, runs entirely on your GPU/CPU) finds your face and maps 68 points onto it — including 6 points around each eye.
3. The **Eye Aspect Ratio (EAR)** is calculated from those points. It's a number that gets small when your eye is closed and large when it's open.
4. If EAR drops below a threshold for 2+ frames: that's a blink.
5. If no face is detected for 3+ seconds: you've looked away.

The AI model is downloaded once and cached. It never sends data anywhere.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Minimize window | — (use titlebar button) |
| Maximize window | — (use titlebar button) |
| Close window | — (use titlebar button) |

---

## Building for Distribution

```bash
# Windows installer (.exe)
npm run dist:win

# macOS disk image (.dmg)
npm run dist:mac
```

Output files go to the `dist/` folder.

---

## Troubleshooting

**The eye tracker says "Models not ready"**
Models are copied when you run `npm install`. Run `node scripts/setup-models.js` manually to copy them, then restart the app.

**The timer never auto-pauses even when I look away**
Make sure eye tracking is active (the button should say "Stop Tracking" and show your current status). If it shows "Away" after 3+ seconds, auto-pause is working. Check that your face is clearly visible to the webcam.

**Documents page says "Requires markitdown" for PDF files**
Install Python first (python.org), then use the "pip install" button that appears in the Documents page.

**The app window shows but is blank / white**
This is usually a renderer crash. Check the developer console: in the app, right-click anywhere and choose "Inspect" (only available in dev mode). Look for errors in the Console tab.

**GPU cache errors on startup (Windows)**
Lines like `Unable to move the cache: Acceso denegado` in the terminal are harmless Electron cache warnings. The app works fine.

---

## Tech Stack

- **Electron 33** — Cross-platform desktop shell
- **React 18 + Vite 5** — UI framework and bundler
- **Tailwind CSS 3** — Styling
- **Zustand 5** — State management
- **@vladmandic/face-api** — Face detection and landmark tracking
- **recharts** — Charts on the Stats page
- **markitdown** (optional, Python) — Document conversion

---

*Built with focus, for focus.*
