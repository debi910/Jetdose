---
doc: prd
status: approved
---

# JetDose — Product Requirements

A travel companion for frequent flyers, airline crew and travellers who take medicines on a schedule: it re-times each medicine for a new time zone around how the body adapts, and keeps the plan offline.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`.
1. The traveller opens JetDose and sets their home city (this sets the home time zone).
2. They add each medicine by typing a sentence such as "Tacrolimus 2 mg every 12 hours at 8am and 8pm". JetDose turns it into a medicine card (name, dose, timing type, times, how flexible the timing is) and they confirm or edit it.
3. They set up a trip: destination city, departure date and time, flight length, and days of stay. The return flight is assumed to leave at the same local clock time on the last day.
4. They tap "Plan my doses". JetDose shows a day-by-day dose timeline covering the outbound flight, the stay, the return and the first days back home.
5. Each dose shows the local time large, the home time small, the gap since the previous dose, and a short reason when the time moved.
6. A comparison switch shows what a plain time-zone converter would do with the same medicines, with unsafe gaps highlighted, next to JetDose's plan.
7. The plan is saved on the device and opens with no internet.
Success: a traveller can see, for every dose of the trip, when to take it in local time and why.

## Screens and Layout
One page with three steps along the top: **1 Medicines**, **2 Trip**, **3 Dose plan**. Steps 1 and 2 are forms with cards; step 3 is the timeline. An "Offline ready" badge sits in the header once the app is cached.

## Look and Feel
Source: `scope.md > Inspiration & Identity`. Calm and trustworthy, like a boarding pass: off-white cards on a deep navy background, one warm amber accent, monospaced digits for times so they line up, generous spacing, readable at a glance in an airport. Plain, reassuring copy. Avoid generic purple-gradient "AI app" styling.

## Features and Behavior

### Home and medicine list
- As a traveller, I want to type my medicine in plain words so that I don't fill a long form.
  - [ ] Typing a sentence and pressing Add produces a medicine card with name, dose, timing type, home-clock times and flexibility.
  - [ ] Supported timing types: **fixed interval** (every N hours), **once daily**, **with food** (tied to meals).
  - [ ] Every field on the card can be edited before saving.
  - [ ] When the smart reader is unavailable (offline or no key), a simpler built-in reader still fills the card, and the card says which reader was used.
- [ ] Home city is chosen from a list; its time zone is shown.

### Trip setup
- [ ] Destination city, departure date and time (home time), flight length in hours, and days of stay.
- [ ] Shows the time difference (e.g. "London is 4h 30m behind Mumbai").

### Body-aware dose plan (the kernel)
- [ ] Doses keep their spacing: each dose moves by at most the medicine's flexibility (e.g. 2 hours) from its normal gap, stepping gradually toward the new local times.
- [ ] Once a medicine reaches its normal local time, it stays there for the rest of the stay; the same happens in reverse on the way home.
- [ ] "With food" doses step toward local meal times (breakfast 08:00, lunch 13:00, dinner 19:30).
- [ ] Doses that fall during a flight are marked "on the plane".
- [ ] Each dose shows local time, home time, the gap since the previous dose and a one-line reason when it moved.

### Plain converter comparison
- [ ] A switch shows the plain-converter plan: the same home clock times applied in local time immediately.
- [ ] Gaps outside the medicine's flexibility are highlighted red in both views.
- [ ] A summary line counts unsafe gaps: plain converter vs JetDose.

### Works offline
- [ ] After the first visit the app opens and shows the saved plan with no internet.
- [ ] Medicines, home and the last plan persist between visits.

## States and Boundaries
- **First use** — no medicines yet: the Medicines step shows an example sentence and an "Add" box.
- **Unreadable sentence** — the reader cannot find a dose time: the card opens with blanks highlighted for the traveller to fill.
- **No trip yet** — the Dose plan step asks the traveller to set up a trip.
- **Same time zone** — the plan says no changes are needed.
- **Offline** — everything works except the smart reader, which falls back to the built-in reader.
- **Safety note** — every plan shows: "JetDose only changes timing, never doses. Check the plan with your doctor or pharmacist, especially for insulin, transplant or seizure medicines."

## Product Decisions
- Travellers and airline crew are the audience (Debi, scope interview).
- Offline is required because internet abroad is unreliable (Debi).
- Food-awareness means timing doses around local meals; checking whether food eaten is "enough" for a dose was removed from scope (Debi approved removing the cut item).
- Debi delegated the remaining product decisions to the agent ("do whatever is required"). Agent-made decisions: one-page three-step layout, return flight at the same local clock time, default flexibility of 2 hours for fixed-interval medicines and 3 hours for once-daily and with-food medicines, and fixed local meal times.

## What We're Building
Everything under **Features and Behavior** above.

## Deferred From the POC
- Multi-leg trips and layovers: one trip proves the kernel.
- Reminders and notifications: need permissions and background work.
- Accounts and sync: plan lives on the device.

## Possible Later Enhancements
Calendar export, a printable card for the doctor, reading a prescription label photo, sleep-window awareness, crew roster import.

## Non-Goals
- Changing doses or calculating insulin amounts: medical dosing advice.
- Diagnosing or recommending medicines.

## Open Questions
None blocking. Flexibility defaults are general and should be confirmed by a clinician before real-world use.
