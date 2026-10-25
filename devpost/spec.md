---
doc: spec
status: approved
---

# JetDose — Technical Spec

## How This Works, In Plain Language
JetDose is a web page that can install itself and work offline, plus a very small Node server.
- The **page** holds the forms, the timeline and the planning logic. All the planning happens in the browser, so the plan works without internet.
- The **planner** is a plain JavaScript module. It walks through the trip dose by dose, works out where the traveller is (home, on the plane, abroad, back home) and moves each dose toward the right local time without stretching or squeezing the gap by more than the medicine allows.
- The **reader** turns a typed sentence into a medicine card. The smart reader is a large language model (Claude) called through the server, which returns structured JSON that must match a schema. The built-in reader is a set of pattern rules that runs in the browser when the smart reader is unavailable. Having both is deliberate: it shows exactly what the LLM adds over hand-written rules (Debi's ML/LLM learning goal).
- The **service worker** stores the page's files so it opens offline. Medicines and the last plan are saved in the browser's local storage.
Why this shape: a single page and a tiny server is enough to prove the kernel in one day, and it keeps the planning logic testable on its own.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Traveller types a sentence → page sends it to `POST /api/parse` → server asks Claude for JSON matching the medicine schema → page shows the card. If the request fails, the page runs `parser.js` locally instead.
2. Traveller sets home and trip → saved to local storage.
3. "Plan my doses" → `planner.js` builds both the JetDose plan and the plain-converter plan → page renders the timeline and the summary.
4. Next visit with no internet → service worker serves the files → page reads the saved plan from local storage.

## Stack
- Node.js 22 (already required by the hackathon). Built-in `node:http` for the server, so there is no framework. https://nodejs.org/api/http.html
- `@anthropic-ai/sdk` with `zod` for structured outputs (`client.messages.parse` + `zodOutputFormat`). https://docs.claude.com/en/api/overview
- Model: `claude-opus-5-5` at low effort, a short extraction task.
- Front end: plain HTML, CSS and JavaScript modules, no build step. Time-zone maths uses the browser's built-in `Intl.DateTimeFormat`, so no date library.
- Tests: Node's built-in test runner (`node --test`).
Chosen by the agent under Debi's delegation; Debi already works with Node and web stacks.

## Where It Runs and How Someone Tries It
- Local: `npm install`, optionally put `ANTHROPIC_API_KEY=...` in `.env`, then `npm start` and open http://localhost:3000.
- Without a key, the built-in reader is used; everything else works the same.
- Demo recording: open the app, add medicines, set a Mumbai → London trip, plan, toggle the comparison, then turn Wi-Fi off and reload.
- Deployment is optional and not planned.

## Look and Feel
From `prd.md > Look and Feel`: navy background (#0f1b2d), off-white cards (#f7f4ec), amber accent (#f2a541), red (#d64545) for unsafe gaps and green (#2e9e6a) for safe ones. Body font Inter or the system sans-serif; times in a monospaced font (JetBrains Mono, falling back to the system monospace offline). Cards with a dashed "tear line" like a boarding pass. Spacious, calm, plain copy.

## Components

### Planner (`public/js/planner.js`)
Builds the dose plan. PRD ref: `prd.md > Body-aware dose plan (the kernel)` and `prd.md > Plain converter comparison`.
- Location timeline: home time zone until departure; "in flight" during the flight; destination time zone from arrival until the return flight leaves; "in flight"; home time zone after landing. Plan runs from departure day until 3 days after returning home.
- For each medicine, its home-clock times T0..Tn-1 repeat in order. The nominal gap before dose k is the clock difference between T(k-1) and T(k).
- Next dose: candidate = last dose + nominal gap. The target is the occurrence of T(k) in the current location's time zone closest to the candidate (during a flight, the time zone the traveller just left). Shift = target − candidate, clamped to ± flexibility. The dose is taken at candidate + shift.
- Reasons: "Same time as usual" (no shift), "Moved X h later/earlier toward local HH:MM (Y h to go)" (clamped), "Now on local time" (first dose that reaches the target).
- With-food medicines use meal times as targets: each home time is mapped to the nearest meal (breakfast 08:00, lunch 13:00, dinner 19:30) and the target is that meal in local time.
- Plain converter: each dose is simply at T(k) in the current location's time zone.
- Each dose records: medicine, UTC instant, local time, home time, location, gap since previous dose in hours, and `safe` = |gap − nominal| ≤ flexibility + 0.01.

### Time-zone helpers (`public/js/tz.js`)
Converts between a UTC instant and wall-clock time in an IANA zone using `Intl.DateTimeFormat`, and finds the UTC instant of "HH:MM on date D in zone Z". Includes the city list (city → IANA zone).

### Built-in reader (`public/js/parser.js`)
Pattern rules: dose (`\d+ (mg|mcg|g|ml|units|iu|tablet)`), frequency ("once", "twice", "three times", "every N hours", "bid", "tid", "daily"), times ("8am", "20:00", "8 pm"), food words ("with food", "with meals", "after breakfast", "after dinner"). Fills default times when none are given (1/day: 08:00; 2/day: 08:00, 20:00; 3/day: 08:00, 14:00, 20:00). PRD ref: `prd.md > Home and medicine list`.

### Smart reader (`server.js` → `/api/parse`)
Calls Claude with a Zod schema; returns `{ medicines: [...], source: "llm" }`. Returns 503 when no API key is configured, so the page falls back.

### Page (`public/index.html`, `public/js/app.js`, `public/css/style.css`)
Three steps, medicine cards, trip form, timeline, comparison switch, summary, safety note, offline badge. PRD ref: all of `prd.md > Features and Behavior`.

### Offline (`public/sw.js`, `public/manifest.webmanifest`)
Cache-first service worker for the app files; network-only for `/api/*`. PRD ref: `prd.md > Works offline`.

## Data Model
Stored in local storage under `jetdose:v1`:
```
{ home: "Asia/Kolkata",
  medicines: [{ id, name, dose, type: "interval"|"daily"|"with_food",
                times: ["08:00","20:00"], flexHours: 2, source: "llm"|"rules" }],
  trip: { dest: "Europe/London", departDate: "2026-11-02", departTime: "09:30",
          flightHours: 9.5, stayDays: 5 },
  lastPlan: { generatedAt, jetdose: [...doses], plain: [...doses] } }
```

## File Structure
```
jetdose/
├── server.js                 # static files + /api/parse (Claude structured output)
├── package.json
├── .env.example              # ANTHROPIC_API_KEY=
├── public/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js                 # offline cache
│   ├── icon.svg
│   ├── css/style.css
│   └── js/
│       ├── app.js            # UI and state
│       ├── planner.js        # the kernel
│       ├── parser.js         # built-in reader
│       └── tz.js             # time-zone helpers + city list
├── tests/                    # node --test
├── devpost/                  # Devpost planning docs
├── LICENSE                   # MIT
└── README.md
```

## External Services and Dependencies
- **Claude Messages API** via `@anthropic-ai/sdk` `messages.parse`, model `claude-opus-5-5`, `output_config: { effort: "low", format: zodOutputFormat(schema) }`. Needs `ANTHROPIC_API_KEY`. Cost is a fraction of a cent per sentence. Docs: https://docs.claude.com/en/docs/build-with-claude/structured-outputs

## Important Failure Modes
- **No key or no internet** → built-in reader, with a "read by built-in rules" tag on the card.
- **Reader gets a field wrong** → the card is editable before saving.
- **Time-zone data differences between browsers** → only the built-in `Intl` zones are used, tested in Node with the same API.

## What Was Simplified and Why
- **Fixed meal times** instead of learning the traveller's meals: enough to show food-aware timing.
- **One trip, same-clock-time return** instead of full itineraries: proves the kernel.
- **General flexibility defaults** instead of a drug database: editable per medicine; a real product would source per-drug windows clinically.

## Decisions and Open Issues
- All technical choices above were made by the agent after Debi delegated them; none are attributed to Debi.
- Learning moment for Debi's ML/LLM goal: compare the smart reader and the built-in reader on the same sentences, and see how a schema constrains an LLM's output.
- Open: clinical validation of flexibility defaults (not needed for the proof of concept).
