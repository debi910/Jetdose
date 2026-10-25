---
doc: scope
status: draft
---

# JetDose

A travel companion that re-times your medicines for a new time zone around how your body actually adapts, and keeps the plan available offline.

## The Unique Kernel
A time-zone converter only shows the raw local time. JetDose "studies the human body along with time": each medicine carries its own timing rule (a fixed interval such as every 12 hours, once daily, or "take with food"), and JetDose shifts the doses across the trip so the gaps between doses stay safe, then anchors food-dependent pills to local meal times at the destination.

## Who It's For
Frequent flyers, airline crew and other travellers who take medicines on a schedule. For example, a cabin crew member on metformin and a twice-daily prescription who flies Mumbai to London and back several times a month. Today they convert times in their head or set phone alarms that silently follow the phone's clock to the wrong time.

## The Core Loop
1. Once: add pills and medications with their dose schedule, plus home town (for the home time zone).
2. Each trip: set destination and days of stay.
3. JetDose produces an updated dose-by-dose schedule for the outbound leg, the stay and the return, and saves it for offline use, because finding internet abroad is hard.
They come back for every trip.

## Inspiration & Identity
Calm and trustworthy, like a boarding pass: one clear timeline that you can glance at in an airport.

## Why This Matters to the Learner
Debi wants to win this hackathon with a problem generic AI projects won't converge on, and wants to learn machine learning and LLMs along the way.

## What "Working" Looks Like
In a one-minute demo: add two or three medicines (typed in plain language), set home (e.g. Mumbai) and a trip (e.g. London, 5 days). JetDose shows a timeline in both home and local time, flags where a dose moves and why ("12-hour interval kept: take at 07:30 local"), shows food-dependent doses next to local meal times, then the demo turns Wi-Fi off and the schedule still loads.
The "oh, that's cool" beat: the same pill list produces a different, body-aware plan than a naive clock conversion, side by side.

## The POC Boundary
- Medication entry, with an LLM turning plain language ("Metformin 500 mg twice a day with meals") into a structured schedule the user confirms. This is the ML/LLM learning piece.
- Home time zone plus one trip (destination + days of stay), including the return.
- Rule-based re-timing for three timing types: fixed interval, once daily, with food.
- Timeline view showing home and local time, with a reason for each shift.
- Offline: the generated schedule works without internet (installable web app).
- A clear "check with your doctor or pharmacist" note; JetDose never changes doses, only times.

## Later
- Multi-leg itineraries and layovers.
- Reminders and notifications.
- Calendar export or a printable card for the doctor.
- Photo of a prescription label as input.

## Explicitly Cut
- Calculating whether food eaten is "enough" for the next pill or insulin dose: this is insulin dose calculation, which is medical dosing advice. It needs clinical validation and would undermine trust in the demo. JetDose keeps food-awareness to timing doses around local meals.
- Accounts and cloud sync: not needed to prove the kernel.
