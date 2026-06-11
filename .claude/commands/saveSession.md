# saveSession — Save Session to Memory

Review the full conversation from this session and persist everything worth keeping to the memory files at `C:\Users\Usuario\.claude\projects\c--Users-Usuario-Desktop-AtenttionApp\memory\`.

---

## Step 1 — Load existing memory

Read `MEMORY.md` (the index), then read every file it lists. You need to know what is already captured before you can decide what is new or stale.

## Step 2 — Scan the session for saveable content

Go through the entire conversation and collect findings in four categories:

**Bugs & pitfalls** — any technical gotcha discovered: a wrong assumption, an edge case, a subtle invariant, a workaround for a specific quirk. The bar is: *would this burn someone again if they didn't know it?*

**Decisions & trade-offs** — non-obvious architectural, UX, or engineering choices made this session: what was chosen, what was rejected, and *why*. Obvious choices ("used useState for local state") don't qualify.

**User preferences & feedback** — how the user wants Claude to work: corrections ("don't do X"), confirmations of non-obvious approaches ("yes, keep doing that"), style preferences, process preferences.

**Project state** — features completed, features started but unfinished, known open issues, pending action items, V-plan items resolved or added. Convert any relative dates ("next Thursday") to absolute dates.

Do **not** save: code patterns derivable from reading the files, git history, obvious implementation details, things already documented in CLAUDE.md, or ephemeral conversational details with no future value.

## Step 3 — Match findings to existing memory

For each finding, check whether an existing memory file already covers it:

- **Direct overlap** → update the existing file in-place (merge, correct, or extend — don't duplicate).
- **Related but distinct** → add a `[[link]]` reference between them but write to a new file.
- **Completely new** → create a new file.

## Step 4 — Write memory files

For every file you create or update, use this frontmatter format:

```
---
name: short-kebab-case-slug
description: one-line summary specific enough to judge relevance at a glance
metadata:
  type: feedback | user | project | reference
---

[body]
```

**Feedback/project body structure:** lead with the rule or fact, then a `**Why:**` line (the reason or motivation) and a `**How to apply:**` line (when this kicks in). Link related memories with `[[their-name]]`.

Use the Write tool for new files and the Edit tool for updates to existing files.

## Step 5 — Update the index

If any new files were created, add a one-line entry to `MEMORY.md`:
```
- [Title](filename.md) — one-line hook (under ~150 chars)
```

Keep the index under 200 lines total. If adding a new entry would push it over, consolidate the most closely related existing entries.

## Step 6 — Report

After all writes are done, output a compact report:

```
## Session saved

**Updated:** list each file updated and the key change made
**Created:** list each new file and what it covers
**Skipped:** (only if something notable was almost saved but wasn't — explain why)
```

If nothing from the session met the bar for saving, say so explicitly rather than inventing low-value entries.
