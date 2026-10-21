# Build Brief: Workout Tracker APK (Android)

**Client:** Chris Simpson
**Prepared for:** Jace (build)
**Date:** 21 Oct 2026
**Status:** Draft. Do not start the build until Chris has signed off.

---

## 1. Summary
A personal, offline-first Android workout tracker. Most of the logic sits in the back end. The interface stays simple: open the app and you see today's session, with its movements and inputs for Set, Reps and Weight. It runs a 5-day weekly split, one focus per day, and each focus rotates through **Normal → Normal → GVT** before resetting. The look is clean, with dynamic card borders and no busy graphics.

## 2. Source material
- Notion: *Cut Block, 5-Day Floor (Aug–Sep 2026)*, the structure Chris wants to keep: https://app.notion.com/p/3b547940c36e81eeaa97d31e50a52587
- Notion: *The Build, Phase 3 (16 Jun–9 Aug 2026)*: https://app.notion.com/p/37e47940c36e81879cf4ca2a0b8d0b5c
- Notion: *Workout Tracker Mar–Aug*: https://app.notion.com/p/32c47940c36e815cab96e27e28c57788
- Notion: *Web Apps & Tools*, which covers the two existing web apps (a 10×10 interval timer and a workout tracker with local-storage autosave, previous-session values and a weekly check-in): https://app.notion.com/p/33047940c36e81a08035e6fac7069272
- **Existing set timer code:** `set_timer.html` in `stackmochris/Tools` (https://github.com/stackmochris/Tools/blob/main/set_timer.html). Reuse its behaviour for the GVT timer: countdown ring, colour warnings at 20s and 10s, set dots, rep counter, configurable sets/reps/seconds, audio cues.
- Also in that repo: `tracker/` (https://github.com/stackmochris/Tools/tree/main/tracker), which appears to be the earlier web tracker. Review it for data-model reuse.

## 3. Training model
### 3.1 Weekly structure
Five sessions a week, each with one focus: **Chest, Shoulder, Back, Arm, Leg**. Chris usually trains 4 days, so the app must handle 4–5 completed sessions a week cleanly (see Missed-day logic, §5.10).

### 3.2 Rotation per focus
Each focus cycles on its own counter: **Normal, Normal, GVT, then reset**.
- **Normal:** progressive overload. Track sets × reps × weight against a target rep range.
- **GVT (German Volume Training):** the user picks 3 movements. A 10-minute timer gives 10 reps per minute, about 300 reps in total, and then the session is done. Log the movements, weight and completed reps per minute.

### 3.3 Movement library (seed data)
Every movement below appears in Chris's Notion logs. The gym is small, with no specialised machines beyond what is listed (cables, Smith machine, leg press, pulldown). Store this as editable seed data so movements can be added or swapped per day.

**Chest**
- Barbell bench press (top set / back-off)
- Incline DB press
- Low-incline DB press
- Incline press, Smith machine (upper-chest bias)
- Cable press (upper-chest bias)
- Deep cable crossover / cable fly
- Deep DB fly
- Dips
- Machine / DB press

**Shoulder**
- DB lateral raise
- Cable lateral raise (incl. burnout)
- Lateral raise → Kelso shrug
- Rear delt fly (DB / cable)
- Face pull
- Machine overhead press
- DB shrugs

**Back**
- Assisted pull-up (Smith / band) / scapular pull-ups
- Neutral-grip pull-ups
- Chin-ups (supinated, paused bottom) ⚠ elbow
- Lat pulldown (paused / controlled)
- Straight-arm pulldown / straight-arm cable pullover
- Chest-supported row (incl. wide and neutral grip)
- Row (barbell / T-bar / machine)
- Single-arm lat row

**Arm**
- DB curls / hammer curls ⚠
- EZ bar curls ⚠
- Incline DB curl ⚠
- Preacher curl ⚠
- Bayesian cable curl ⚠
- OH cable tricep extension ⚠
- Tricep pushdown / rope pushdown ⚠
- OH tricep → pushdown (superset) ⚠
- Pushdown / curl superset ⚠

**Leg**
- Barbell RDL / DB RDL
- Leg press (or hack)
- Leg curl
- Leg extension
- Calf raise

**Conditioning / optional add-ons** (not a focus day): core (plank / hanging leg raise), burpees, incline treadmill walk.

⚠ = covered by the elbow injury flag (§5.8).

## 4. Screens
1. **Today:** the current day's focus and rotation type (Normal or GVT). Movement cards with Set / Reps / Weight inputs, showing last session's values for reference. A rest timer, and an add/swap movement control.
2. **GVT session:** pick 3 movements, then the 10-minute timer (port of `set_timer.html`) with a per-minute rep tick.
3. **Daily check-in:** bodyweight (manual or synced), protein, calories, a one-tap water counter.
4. **Weekly summary:** unlocks after **4 or more** workouts are completed that week. Shows trends (volume, top sets, PRs, bodyweight weekly average) and takes the final weigh-in.
5. **History:** a back page of past sessions and weeks, with per-movement history.
6. **Settings:** movement library editor, rep ranges, injury flags, integrations, export/backup.

Navigation is a simple bottom bar: Today, History, Summary (locked until unlocked), Settings.

## 5. Functional requirements
1. **Set logging:** set, reps and weight per movement. Previous values are pre-filled as hints.
2. **Add/swap movements** per day, picking from the focus library or the full library.
3. **Rotation engine** as in §3.2, with a separate counter per focus.
4. **Rest timer** between sets, configurable, with an audible and vibration cue. Separate from the GVT timer.
5. **Next-session weight suggestion:** when every working set hits the top of its rep range, suggest the next load increment for the next session.
6. **PR detection** with confetti. Gamification stays light: confetti on PRs and progression reminders, nothing more.
7. **Bodyweight:** a daily input. The trend is built from **fasted weekly averages**, not single readings. Ignore the scale's body-fat and visceral numbers for trend purposes.
8. **Injury flag:** movements can be flagged. Default flag: **elbow, lateral epicondyle**. On flagged movements, show a reminder: *neutral grips where possible; add reps before load on curls and pushdowns.* For flagged movements, the weight suggestion should offer reps before load.
9. **Nutrition (light):** one daily entry for protein (g) and calories. Show the targets (current Notion targets are 160–180 g protein and 1,950–2,200 kcal), editable.
10. **Missed-day logic:** a skipped session rolls the plan forward and leaves no gaps. The rotation counter advances only when a session is completed.
11. **Water:** a one-tap counter with a configurable daily target.
12. **Offline-first:** all data local (for example Room/SQLite). JSON/CSV **export and backup**, plus restore.

13. **"Can't get to the gym?" button** on every workout. Replaces that day's session with a 100-rep bodyweight swap, logged as completed (counts toward the weekly 4) but flagged as a swap so it doesn't skew strength trends. Defaults (editable): Chest - 100 push-ups; Back - 100 inverted rows (table/doorframe); Legs - 100 split squats (50 per leg); Shoulders - 100 pike push-ups; Arms - 100 bench/chair dips (elbow-flagged: offer diamond push-ups as the alternative). Can be split across sets; simple rep counter on screen.
14. **Disincentive mechanic.** If fewer than 4 workouts are completed in a week, the following week's working loads are raised by a configurable amount (default +2.5 kg barbell / +1 kg DB and cable steps, Chris to confirm). Shown as a clear banner at the start of the week. Elbow-flagged movements get extra reps instead of extra load. Swap sessions count toward the 4.

## 6. Integrations (Jace to verify feasibility)
- **OKOK International Bluetooth scale:** check for a public SDK/API or a documented BLE protocol. Preferred: direct BLE read.
- **Xiaomi watch:** check what Mi Fitness / Zepp exposes (steps, HR, workouts).
- **Fallback for both:** Android **Health Connect** (weight, steps, HR), or import of the vendor app's exported data.
- **Mara (assistant) data access - required.** Chris wants to discuss his training with Mara and, ideally, have Mara edit data when he tells her what he did ("I did chest, bench 90x5x3"). Minimum v1: Mara can **read** the in-app data. Preferred: Mara can also **write** (log or correct sessions, weigh-ins, nutrition). Suggested approach for Jace to evaluate: the app syncs to a small owned backend (e.g. a private JSON/API endpoint or a Google Sheet / Drive file) that the app reads back on open; Mara reads and writes there. Writes made by Mara are tagged as such in history. Must stay offline-first, with sync when online.
- **Optional:** Notion sync, mirroring the existing tracker's "Save to Notion". Out of scope for v1 unless Chris confirms.

## 7. UI direction
Clean and minimal. **Dynamic card borders** carry state: active set, completed, PR, flagged movement, GVT day. No heavy graphics or animation apart from the PR confetti. Dark mode is a sensible default for gym lighting (to confirm).

## 8. Out of scope (v1)
Full meal or food-database tracking, social features, cloud accounts, iOS.

## 9. Open questions for Jace
1. Is the OKOK scale reachable over BLE or an API, or only through Health Connect or an export?
2. What does the Xiaomi watch (which model?) expose, and is Health Connect sync from Mi Fitness reliable?
3. Native Kotlin/Compose, or wrap the existing web tools (for example a Capacitor build reusing `set_timer.html` and `tracker/`)? What are the trade-offs for BLE and Health Connect?
4. Proposed data model for the rotation counters, and how missed sessions interact with a 5-day week when Chris trains 4.
5. Load increments for the weight suggestion: default DB, barbell and cable steps, and kg only?
6. Should the weekly summary unlock threshold (4) be configurable?
7. Backup target: local file only, or also Google Drive?
8. Sideloaded APK only, or a Play internal-testing track?
9. Estimate and milestones for an MVP (Today + logging + rotation + history + export) versus the integrations.

10. What sync target best supports Mara read/write access (owned API, Google Sheet, Drive JSON), and how are conflicts handled between app and Mara edits?

## 10. Questions for Chris (before build)
- Should GVT movements default to the last-used three per focus?
- Any default rep ranges per movement beyond those in Notion?
- Is Notion sync wanted in v1?
- Disincentive load bump: how many kg, and does it stack if you miss two weeks in a row?
