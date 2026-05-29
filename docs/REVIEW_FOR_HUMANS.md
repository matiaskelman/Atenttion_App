# Atenttion App — Code Review (Human Edition)

*A plain-language breakdown of what's working, what needs fixing, and what features could take this app to the next level.*
Work through [QW-2], [QW-3], [QW-5], [QW-6] from docs/CLAUDE_ACTION_PLAN.md in order.
Finish and verify each one before starting the next. Mark each complete when done.

---

## The Big Picture

The app is well-structured and genuinely impressive for what it does — combining a Pomodoro timer, real-time eye tracking, app usage monitoring, and ambient sound synthesis into a single lightweight desktop app. The foundations are solid. But there are some patterns in the code that will become painful as the app grows, a few bugs that could cause data loss, and some significant feature gaps for an app that claims to track cognitive performance.

---

## Part 1 — What's Structurally Awkward

### The timer hook is doing way too much housekeeping

The main timer logic (`usePomodoro.js`) has to maintain 8+ "shadow copies" of the app's state — variables that exist only to work around a quirk in how React handles timers. Every time the app's state changes, these copies have to be manually kept in sync. It works, but it's like writing a calculation twice on two separate whiteboards to make sure they stay in agreement. If someone adds a new piece of state and forgets to update the shadow copy, the timer will silently use stale data. There's a simpler pattern available using the state library already in the project.

### The app's "memory" is a single enormous list

All of the app's runtime data — timer state, eye tracking, audio, sessions, system stats, navigation — lives in one giant list of about 50 variables. This is fine for now, but as the app grows, changing one thing can accidentally trigger unnecessary updates elsewhere. It should be split into logical groups (timer, eye tracker, audio, etc.) so each part of the app only reacts to the things it actually cares about.

### The blink scoring rules live in three places at once

The rules about what different blink rates mean (e.g., "less than 6 blinks per minute = eye strain risk") are defined in a documentation file, but they're *also* manually copied into two separate code files. If you want to change a threshold, you have to update all three places and hope you don't miss one. This kind of manual synchronization always breaks eventually. The fix is to put the rules in a single code file and have everything else read from it.

### The preferences file uses a fragile custom format

User preferences (timer durations, thresholds, etc.) are stored in a made-up format that mixes Markdown and YAML. The code that reads this file uses basic text splitting — if a preference value ever contains a colon (like a time "14:30"), it will silently break. This should just be a standard JSON file, which every language already knows how to read and write correctly.

---

## Part 2 — Performance & Reliability Issues

### There are two places where the app can freeze completely

When a user tries to convert a document (especially Office files or PDFs), the app runs an external Python tool to do the conversion. The way it's currently written, the entire app — including all windows and controls — is completely frozen while Python works. For a small file this might take 1-2 seconds; for a large PDF it could take 30 seconds. Nothing can happen in the meantime. This is fixable by running Python in the background while the app stays responsive.

Similarly, if a user pastes a URL into the Documents section and that URL is unreachable or slow, the app will wait forever with no timeout. It should give up after 15 seconds and show an error.

### The app could silently lose all your session history

If the sessions data file (`atenttion-sessions.json`) ever gets corrupted — even a single bad character — the app currently throws away the entire file and starts over with zero history. It should instead try to recover as many valid sessions as possible and warn the user that some entries were skipped, rather than silently losing everything.

### A background monitoring process sometimes doesn't clean up after itself

The app runs a background PowerShell process to detect which app is in the foreground. If the Atenttion app crashes hard (as opposed to closing normally), that background process may keep running in the background after the app is gone. It's a minor issue but worth addressing.

### The CPU/memory display can create duplicate background tasks

When you navigate away from the System page and then come back, the code that polls for CPU and memory usage creates a fresh background task without properly canceling the old one. Do this a few times and you have multiple tasks doing the same work. It's not noticeable yet, but it's wasted work.

### Startup delay before eye tracking works

The first time you click "Start Tracking" in a session, the app has to load the face detection model (a ~2MB file) before it can begin. This causes a 1-2 second delay where nothing appears to happen. The model should be loaded quietly in the background as soon as the app opens, so the first click is instant.

---

## Part 3 — What's Missing for a "Focus Tracking" App

The app collects rich behavioral data — blink rates, session quality scores, which apps you used during focus time — but barely surfaces any of it in a way that helps you understand yourself over time.

### You can't answer "Am I getting better?"

The stats page shows today's numbers and a 7-day bar chart of focus minutes. But it doesn't show trends: Is your average blink rate normalizing? Are your sessions getting longer? Are your focus scores improving week over week? The data is already being collected — it just isn't being analyzed across time.

### The app doesn't know which apps hurt your focus

It tracks which apps are open during focus sessions, but never asks: "When I switch to Twitter during a Pomodoro, does my focus score drop?" It almost certainly does, but the app can't tell you that. This is exactly the kind of insight that would make the app genuinely useful for behavior change.

### There's no way to set an intention before a session

The best focus tools help you start with a clear purpose: "What am I working on right now?" Setting a goal before a session — even just typing one sentence — dramatically increases follow-through. The app has no way to capture this, and therefore can't help you notice patterns like "when I set a clear goal, I complete 40% more sessions."

### Your data is locked inside the app

You have potentially months of session history — blink rates, focus scores, app usage, session durations — and there's no way to export it. No CSV, no copy-paste. If you want to analyze your data in a spreadsheet, you're out of luck.

---

## Part 4 — Three Features Worth Building

### 1. An early warning when your focus is fading

Instead of waiting for you to notice you're tired, the app already has enough data to predict it. When your blink rate starts drifting into the "mind drifting" zone and you've been looking away more frequently, a quiet banner could say: *"Your focus pattern suggests you're fatiguing — consider an early break."* This would be based on a score computed quietly in the background, updated every 30 seconds. No new data collection needed — just smarter use of data already flowing.

### 2. A brief ritual before each session

Research consistently shows that a short preparation routine before focused work leads to better outcomes. The app could optionally show a 10-second prompt when you start a Pomodoro: type your goal for this session, optionally do a quick 8-second breathing animation, and rate your energy level (low / medium / high). After the session, a quick check-in: how did it go? Over time, the app could show you: "Sessions where you set a goal average 12 more focus points than sessions where you don't."

### 3. An app distraction fingerprint

After enough sessions, the app could build a personal "distraction map." It already knows which apps were open during your focus time and what your focus score was. With some analysis, it could surface something like: *"When Slack is open during focus sessions, your score drops by 18 points on average. When you keep only your code editor open, your score is 23% higher."* You could then flag specific apps, and the app would send a gentle reminder if you open one during a Pomodoro.

---

## Prioritized Fix List

### Do these first — each takes a few hours and the risk is low:

1. Fix the timer's shadow-copy pattern (code cleanup, no behavior change)
2. Add a 15-second timeout to URL fetches so the app doesn't hang
3. Make document conversion run in the background (stop freezing the app)
4. Put all blink scoring rules in one place
5. Move CPU/memory polling to a central location (stop creating duplicates)
6. Protect against losing session history if the data file gets corrupted
7. Clean up duplicated helper functions scattered across multiple files
8. Update the developer documentation (it still references the old face-detection library)

### Do these next — a day or two each:

9. Make file saving run in the background instead of freezing the main process
10. Split the app's state into logical groups
11. Switch preferences to a standard JSON format
12. Pre-load the face detection model at startup
13. Add a CSV export button to the Stats page

### Build these features when the foundation is stable:

14. Cognitive fatigue warning banner
15. Pre/post session ritual with goal tracking
16. App distraction fingerprint and focus mode alerts
17. Week-over-week trend charts

---

## Bottom Line

The app works and the core technology — real-time eye tracking, algorithmic audio synthesis, app monitoring — is genuinely impressive. The main risks right now are: a potential for silent data loss (fragile data loading), two scenarios that freeze the entire app (document conversion and URL fetching), and a codebase pattern (the ref farm in the timer) that will cause subtle bugs as the app evolves. None of these are catastrophic, but they should be addressed before any major feature work. The three proposed features are all buildable within the existing stack and would meaningfully differentiate the app from a generic Pomodoro timer.
