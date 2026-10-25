---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast (Debi delegated the build: "Do whatever is required, dont invoke me repeatedly")

## Slices

- [x] **1. You can see a body-aware dose plan for a sample trip**
  Becomes usable: Running `npm start` and opening the app shows a day-by-day dose timeline for sample medicines on a Mumbai → London trip, with local time, home time, gap and reason for each dose.
  Why now: The planner is the unique kernel and the riskiest logic (time-zone maths, gradual shifting), so it comes first, with the scaffold folded in.
  PRD ref: `prd.md > Body-aware dose plan (the kernel)`, `prd.md > The Core Journey` (steps 4-5)
  Spec ref: `spec.md > Planner (public/js/planner.js)`, `spec.md > Time-zone helpers (public/js/tz.js)`, `spec.md > File Structure`
  Build: Scaffold package.json and server.js (static files), tz.js, planner.js, a page that renders the plan for built-in sample data.
  Verify (mechanical): `npm test` passes planner tests (gaps stay within flexibility, doses reach local time, return trip restores home time, with-food targets meals); server starts and serves the page; headless browser screenshot shows the timeline.
  Learner check: Open http://localhost:3000 and read the plan for the sample trip; does each moved dose explain itself?
  Commit: `Add body-aware dose planner with sample timeline`

- [x] **2. You can add your own medicines and trip, and they are remembered**
  Becomes usable: Typing a medicine sentence creates an editable card via the built-in reader; home city and trip form drive the plan; everything survives a reload.
  Why now: Turns the kernel into the traveller's own journey before adding the LLM.
  PRD ref: `prd.md > Home and medicine list`, `prd.md > Trip setup`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Built-in reader (public/js/parser.js)`, `spec.md > Page (public/index.html, public/js/app.js, public/css/style.css)`, `spec.md > Data Model`
  Build: parser.js, three-step UI, editable cards, trip form, local storage.
  Verify (mechanical): parser tests on sample sentences; headless browser adds a medicine, sets a trip, reloads and sees the same plan.
  Learner check: Add your own medicines, set a trip, reload the page.
  Commit: `Add medicine entry, trip setup and saved state`

- [x] **3. The smart reader turns sentences into medicine cards**
  Becomes usable: With an API key, `/api/parse` uses Claude structured output; without one, the page falls back to the built-in reader and labels the card.
  Why now: The LLM is Debi's learning goal but not required for the kernel, so it layers on a working app.
  PRD ref: `prd.md > Home and medicine list`
  Spec ref: `spec.md > Smart reader (server.js → /api/parse)`, `spec.md > External Services and Dependencies`, `spec.md > Important Failure Modes`
  Build: server endpoint with @anthropic-ai/sdk + zod schema; client tries it first.
  Verify (mechanical): without a key the endpoint returns 503 and the card shows "built-in rules"; with a key (if available) a sample sentence returns valid JSON.
  Learner check: Add a medicine with and without the key and compare the cards.
  Commit: `Add Claude-powered medicine reader with fallback`

- [x] **4. You can compare JetDose with a plain time-zone converter**
  Becomes usable: A switch shows the plain-converter plan, unsafe gaps are red, and a summary counts unsafe gaps for each.
  Why now: This is the demo's "oh, that's cool" beat and depends on the plan view.
  PRD ref: `prd.md > Plain converter comparison`
  Spec ref: `spec.md > Planner (public/js/planner.js)`, `spec.md > Look and Feel`
  Build: plain plan in planner.js, comparison toggle and summary, boarding-pass styling pass.
  Verify (mechanical): planner test shows the plain plan has unsafe gaps on the sample trip and JetDose has none; screenshot of both views.
  Learner check: Flip the switch and see the red gaps disappear.
  Commit: `Add plain converter comparison`

- [x] **5. The plan works offline**
  Becomes usable: After one visit the app and the saved plan open with the network off.
  Why now: Required by the PRD, and independent of the other slices.
  PRD ref: `prd.md > Works offline`
  Spec ref: `spec.md > Offline (public/sw.js, public/manifest.webmanifest)`
  Build: service worker, manifest, icon, offline badge.
  Verify (mechanical): headless browser loads once, goes offline, reloads and still sees the plan.
  Learner check: Turn Wi-Fi off and reload.
  Commit: `Make JetDose work offline`

## Hands-on Checkpoints

- [x] Early usable behavior explored — Debi delegated checkpoints; agent reviews screenshots after slice 1 and Debi reviews the finished app
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning wrap-up and `devpost/app-map.html` — app map written (reference route, not toured); wrap-up with Debi still open

## Revisions

- Planner: a dose may switch to any of the medicine's usual times, not only the next one in order. Testing a Mumbai → New York trip showed a 12-hourly pill drifting for five doses when it could simply swap morning and evening; covered by the test "a 12-hourly pill flying ~12 hours swaps morning and evening instead of drifting".
- Slices 2 and 4 landed in one commit (`Add medicine entry, trip setup, dose timeline and saved state`) because the comparison switch shares the timeline renderer; both were verified with headless browser screenshots.
- Early checkpoint: Debi delegated hands-on checks, so the agent reviewed headless screenshots after slice 1 and found and fixed a CSS bug where all three steps showed at once.
- Smart reader verified up to the API call (a fake key returns 401 from the API and the page falls back to built-in rules); not yet run with a real key.
