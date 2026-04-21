# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Family B-Ball League** is a gamified chore management system for children, presented as a basketball-themed RPG. Two children complete household tasks and study activities; a parent (GM) grades quality and approves work. Task completion is gamified as basketball shots with hit probability tied to quality grade.

Players: P1 "大寶" (age 11), P2 "二寶" (age 8), GM = parent coach.

## Tech Stack

- **Frontend**: Single HTML file (`app/index.html`) — vanilla JS, Tailwind CSS via CDN, no build step
- **Backend**: Google Apps Script (`app/Code.js`) — serverless JS hosted in GAS
- **Database**: Google Sheets (8 normalized tables)
- **Deploy tool**: `clasp` CLI

## Development Commands

```bash
# Push code to Google Apps Script
clasp push
```

There is no local dev server or test runner. To test:
1. Run `clasp push`
2. In GAS UI, create a new Deployment (the URL does not auto-update on re-push)
3. Visit the live Web App URL; use PINs 1111 (P1), 2222 (P2), 9999 (GM) to log in
4. Backend logs: GAS Editor → View Logs (`Utilities.log` output)

**Critical deployment note**: After `clasp push`, you must create a **new deployment** in the GAS UI — the existing deployment URL points to a snapshot and does not auto-update.

### Sprite Pipeline

```bash
cd tools/pipeline
source venv/bin/activate
# Generate sprite sheet from a reference image (requires LEONARDO_API_KEY env var)
python sprite_gen.py --ref ref.png --frames 8 --frame-size 128
# Manual crop/reassemble if AI output needs fixing
python manual_crop.py
```

First run downloads rembg model (~170MB). Output lands at `final_sprite.png` in the project root.

## Architecture

### Frontend (`app/index.html`, ≈1560 lines)
Single-page app with PIN-based login → player dashboard or GM console. Tabs: Quests, Arena, Status, Shop. Polls backend every 30 seconds via `fetchData()`. All state lives in `currentUser` and `globalData` globals.

Key constraint: Tailwind is loaded via CDN in JIT mode — class names must be hardcoded strings (no dynamic string concatenation for classes).

Sprite animations use CSS `steps()` with `background-position` stepping across a horizontal sprite sheet. Sprite sheets live in `assets/characters/leonard/`.

**API_URL** is hardcoded at `app/index.html:445` — must be updated manually after each new GAS deployment.

### Backend (`app/Code.js`, ≈810 lines)
REST API exposed via `doGet()` (fetch all state) and `doPost()` (all mutations). Every request validates PIN server-side and checks an action whitelist. Concurrent writes are protected by `LockService`. All events are appended to the `Logs` sheet with a JSON detail payload.

Key functions triggered by GAS time-based triggers:
- `setupSheets()` — idempotent schema migration; run manually from GAS editor on first deploy
- `generateDailyTasks()` — midnight GMT+8; spawns recurring tasks from `Daily_Templates`
- `dailyEODProcess()` — end-of-day: calls `generateNews()` to write AI battle report to `News` sheet and `Global_State.Daily_News`, resets daily scores; on Mondays also resets weekly scores
- `checkTaskDeadlines()` — penalizes overdue tasks

`generateNews()` calls Gemini API via `callGemini_()`. Requires `GEMINI_API_KEY` set in GAS Script Properties (Project Settings → Script Properties). Without it, news generation is skipped with a placeholder message.

### Database (Google Sheets)

| Sheet | Purpose |
|---|---|
| `Users` | Player/GM accounts, stats (Level, XP, Gold, MP) |
| `Global_State` | Current season, team score, monster score |
| `Tasks` | Task instances with Status: Pending → Reviewing → Completed/Deleted |
| `Logs` | Full audit trail; `Detail_JSON` holds scoring/foul data |
| `Daily_Templates` | Recurring task patterns; `Trigger_Days` is a 0=Sun…6=Sat bitmask |
| `Shop_Items` | Reward catalog |
| `Skills_Dict` | Skill definitions (future use) |
| `Player_Skills` | Unlocked skills per player (future use) |
| `News` | Archive of daily/weekly AI battle reports (Date, Season_ID, Content, Type) |

## Core Game Mechanics

**Task state machine**: `Pending → Reviewing` (player submits) `→ Completed` (GM approves) or back to `Pending` (GM rejects). GM can also delete tasks.

**Scoring**: GM sets a quality grade (60/80/90/95/99%). Backend runs `Math.random() < quality/100` to determine if the shot goes in. Hit = 3 pts (S/A/B difficulty) or 2 pts (C/D/E). XP and Gold are granted regardless of hit/miss ("appearance fee" to prevent frustration).

**AI Commentary**: Broadcast text is chosen deterministically using `getStringHash(logId)` so all viewers see the same commentary for a given log entry.

**Difficulty colors**: E=white, D=green, C=blue, B=red, A/S=gold/silver.

**Lore constraint**: Monster descriptions must never use fear/punishment framing toward 二寶 (age 8). Monsters are always "mischievous" or "needing help" — never threatening.

## Key Files

- `app/index.html` — entire frontend
- `app/Code.js` — entire backend
- `appsscript.json` — GAS config (timezone: Asia/Taipei, webapp access: ANYONE_ANONYMOUS)
- `.clasp.json` — clasp CLI config with `scriptId`
- `docs/design/Game Design Document_2.md` — full GDD with phase roadmap and skill tree
- `docs/guides/Project Handover.md` — detailed architecture notes
- `docs/specs/skill_pixel_sprite_pipeline.md` — sprite generation pipeline spec
- `assets/characters/leonard/` — pixel art sprite sheets for CSS step animations
- `tools/pipeline/sprite_gen.py` — automated sprite sheet generator (Leonardo API + rembg)
- `tools/pipeline/manual_crop.py` — manual frame correction tool

## GAS-Specific Gotchas

- `appsscript.json` sets `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS` — required for anonymous frontend access.
- Formula injection: `safeAppendRow()` escapes values starting with `=` before writing to Sheets.
- All timestamps use GMT+8 (Asia/Taipei) regardless of where GAS executes.
- The MP system is cosmetic/placeholder — it exists in the schema but is not yet mechanically gated.
