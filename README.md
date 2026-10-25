# JetDose

**Your medicines, on time in any time zone.**

A plain time-zone converter keeps your pill at "8 pm" wherever you land. For a medicine taken every 12 hours, flying Mumbai → London that turns a 12-hour gap into 17.5 hours. JetDose re-times each medicine around how your body adapts: every dose moves by no more than that medicine allows, stepping toward your new local times, then back again when you fly home. The plan is saved on your device and works offline, because finding internet abroad is hard.

Built for frequent flyers, airline crew and anyone travelling with a medicine schedule.

## What it does

1. **Describe your medicines in plain words** — "Tacrolimus 2 mg every 12 hours at 8am and 8pm". Claude turns the sentence into a structured medicine card using a schema-constrained response; offline or without a key, built-in pattern rules do it instead. Every card is editable.
2. **Set a trip** — destination, departure, flight length, days of stay.
3. **Get a body-aware dose plan** — local time, home time, the gap since the previous dose and why each dose moved. "With food" medicines move to local meal times. Doses on the plane are marked.
4. **Compare with phone alarms** — one switch slides every dose on the trip rail between phone-alarm times and JetDose times; unsafe gaps light up red.
5. **Sleep-aware** — set your usual sleep hours. Doses are kept out of them when the medicine's flexibility allows; the rest are flagged "set an alarm".
6. **See it at a glance** — a live next-dose countdown, a 24-hour body-clock dial (where your home times fall in the new day vs. where JetDose settles them) and a dose-by-dose rail of the whole trip.
7. **Take it with you** — export every dose to your phone calendar (`.ics`, each with a 5-minute reminder that rings offline) or print a one-page travel card for your doctor or pharmacist.
8. **Works offline** — installable web app; the last plan opens without internet.

JetDose only changes **timing**, never doses. Always check the plan with your doctor or pharmacist.

## How the planning works

For each medicine, JetDose walks through the trip dose by dose (`public/js/planner.js`):

- The next dose is due one usual gap after the previous one.
- It looks for the closest of the medicine's usual times in the zone the traveller is living by (home, the plane, or the destination).
- It moves the dose toward that time by at most the medicine's flexibility (default 2 h for fixed-interval, 1 h for narrow-window drugs like tacrolimus, 3 h for once-daily and with-food).
- Once a dose reaches local time it stays there; the same happens in reverse after the return flight.
- If a dose would land in your sleep hours, it is pulled to the edge of them only when that stays within the flexibility and in the direction the dose is already moving; otherwise it is flagged for an alarm.

## Run it

```bash
npm install
cp .env.example .env   # optional: add ANTHROPIC_API_KEY for the Claude reader
npm start              # http://localhost:3000
npm test               # planner and reader tests
```

Requires Node.js 20+. No build step.

## Built with the Devpost Learn Skill Pack

Planned and built with the [Build With AI: Basics](https://learn-ai-basics.devpost.com/) skill pack. The planning documents are in [`devpost/`](devpost/): [scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md), [build checklist](devpost/checklist.md) and the [app map](devpost/app-map.html).

## License

[MIT](LICENSE)
