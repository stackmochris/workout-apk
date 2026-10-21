# Workout Tracker

A personal, offline-first workout tracker. Open it and today's session is there: the focus for the day, whether it is a Normal or GVT session, and the movements with Set / Reps / Weight inputs pre-filled with last session's values.

It runs a 5-day split (Chest, Shoulder, Back, Arm, Leg). Each focus has its own rotation counter cycling **Normal → Normal → GVT**, then resetting. The counter advances only when a session is completed; a skipped day rolls the plan forward to the next focus with no gaps.

The full product brief is in [docs/brief.md](docs/brief.md).

## Stack

- React 18 + TypeScript, built with Vite
- Installable PWA (`vite-plugin-pwa`), works offline
- Local storage on the device, with JSON export
- Vitest for unit tests
- Android packaging later with Capacitor (M5)

## Run it

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

On a phone, open the deployed URL and use **Add to Home Screen** to install it.

## Project layout

```
src/
  engine/rotation.ts      rotation engine (pure functions) + tests
  data/movements.ts       seed movement library, elbow flags, default day templates
  lib/store.ts            local persistence, export, previous-value lookup
  lib/audio.ts            timer tones, vibration, screen wake lock
  components/GvtTimer.tsx 10×10 GVT timer (ported from the existing set timer)
  components/RestTimer.tsx
  screens/                Today, History, Summary, Settings
docs/brief.md             product brief
```

## Milestones

| | Scope | Status |
|---|---|---|
| **M1** | Today screen, set logging with previous values, add/swap movements, rest timer, rotation engine, history, bottom nav, JSON export | Done (demo) |
| **M2** | GVT timer with per-minute rep log, "Can't get to the gym?" 100-rep swap, missed-week load penalty, PR detection with confetti, next-session weight suggestions (reps before load on elbow-flagged movements) | GVT timer done; rest to do |
| **M3** | Daily check-in (bodyweight, protein, calories), water counter, weekly summary (unlocks at 4 workouts), settings editor for library / rep ranges / flags / targets, export and restore | Summary lock and export in place; rest to do |
| **M4** | Sync backend so Mara can read and write training data: a small owned API, every record tagged with its author and edit time, offline-first with sync when online | Records already carry `author` and `updatedAt` |
| **M5** | Capacitor Android APK, Health Connect (weight, steps, heart rate), scale and watch integrations where feasible | Not started |

## Notes

- Seed rep ranges come from the Notion training logs (Phase 1 tracker, The Build Phase 3, Cut Block) and the earlier web tracker.
- Default flag: elbow (lateral epicondyle). Flagged movements show: *neutral grips where possible; add reps before load on curls and pushdowns.*
- Nutrition targets default to 160–180 g protein and 1,950–2,200 kcal (editable in M3).

## Deploying to GitHub Pages

The Pages workflow lives at `docs/deploy/pages.yml`. To enable it, move it to `.github/workflows/pages.yml` and set **Settings → Pages → Source** to *GitHub Actions*. GitHub Pages on a private repository needs a paid GitHub plan (Pro or higher).
