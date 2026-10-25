// The kernel: re-times each medicine across a trip so the gap between doses never
// stretches or shrinks by more than the medicine allows, stepping gradually toward local time.

import { wallClock, zonedToUtc, addDays, timeToHours } from "./tz.js";

const HOUR = 3600000;
const MINUTE = 60000;
const DAYS_AFTER_RETURN = 3;

export const MEALS = [
  { name: "breakfast", time: "08:00" },
  { name: "lunch", time: "13:00" },
  { name: "dinner", time: "19:30" },
];

export const DEFAULT_FLEX = { interval: 2, daily: 3, with_food: 3 };
export const DEFAULT_SLEEP = { from: "23:00", to: "07:00" };

// Is a wall-clock time inside the sleep window (which may wrap past midnight)?
export function inSleep(time, sleep = DEFAULT_SLEEP) {
  const h = timeToHours(time);
  const a = timeToHours(sleep.from);
  const b = timeToHours(sleep.to);
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

export function nearestMeal(time) {
  const h = timeToHours(time);
  return MEALS.reduce((best, m) =>
    Math.abs(timeToHours(m.time) - h) < Math.abs(timeToHours(best.time) - h) ? m : best
  );
}

// Where the traveller is at each moment of the trip.
export function tripTimeline(home, trip) {
  const start = zonedToUtc(trip.departDate, "00:00", home);
  const depart = zonedToUtc(trip.departDate, trip.departTime, home);
  const arrive = depart + trip.flightHours * HOUR;
  const arrivalDate = wallClock(arrive, trip.dest).date;
  let returnDepart = zonedToUtc(addDays(arrivalDate, trip.stayDays), trip.departTime, trip.dest);
  if (returnDepart <= arrive) returnDepart = arrive + trip.stayDays * 24 * HOUR;
  const returnArrive = returnDepart + trip.flightHours * HOUR;
  const end = returnArrive + DAYS_AFTER_RETURN * 24 * HOUR;
  return { start, depart, arrive, returnDepart, returnArrive, end, home, dest: trip.dest };
}

// The zone the traveller lives by at an instant. On a plane, the body is still on the zone just left.
export function locationAt(t, tl) {
  if (t < tl.depart) return { place: "home", tz: tl.home };
  if (t < tl.arrive) return { place: "flight", tz: tl.home };
  if (t < tl.returnDepart) return { place: "dest", tz: tl.dest };
  if (t < tl.returnArrive) return { place: "flight", tz: tl.dest };
  return { place: "home", tz: tl.home };
}

function sortedTimes(med) {
  return [...med.times].sort((a, b) => timeToHours(a) - timeToHours(b));
}

function nominalGaps(times) {
  if (times.length === 1) return [24];
  return times.map((t, k) => {
    const prev = times[(k - 1 + times.length) % times.length];
    const gap = timeToHours(t) - timeToHours(prev);
    return gap <= 0 ? gap + 24 : gap;
  });
}

function targetTime(med, time) {
  return med.type === "with_food" ? nearestMeal(time).time : time;
}

// The occurrence of a wall-clock time in a zone that sits closest to a given instant.
function closestOccurrence(time, tz, near) {
  const day = wallClock(near, tz).date;
  let best = null;
  for (const d of [-1, 0, 1]) {
    const t = zonedToUtc(addDays(day, d), time, tz);
    if (best === null || Math.abs(t - near) < Math.abs(best - near)) best = t;
  }
  return best;
}

function hoursLabel(h) {
  const r = Math.round(Math.abs(h) * 2) / 2;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} h`;
}

// The clock shown to the traveller: on a plane, the clock of the place they are flying to.
function displayZone(t, tl) {
  const loc = locationAt(t, tl);
  if (loc.place !== "flight") return loc.tz;
  return t < tl.arrive ? tl.dest : tl.home;
}

function describe(dose, home, tl) {
  const loc = locationAt(dose.utc, tl);
  return {
    ...dose,
    place: loc.place,
    tz: loc.tz,
    local: wallClock(dose.utc, displayZone(dose.utc, tl)),
    displayTz: displayZone(dose.utc, tl),
    homeClock: wallClock(dose.utc, home),
  };
}

// JetDose plan for one medicine.
export function planMedicine(med, home, trip, sleep = DEFAULT_SLEEP) {
  const tl = tripTimeline(home, trip);
  const times = sortedTimes(med);
  const gaps = nominalGaps(times);
  const flex = Number(med.flexHours ?? DEFAULT_FLEX[med.type] ?? 2);
  const doses = [];

  let k = 0;
  let prev = zonedToUtc(addDays(trip.departDate, -1), targetTime(med, times[0]), home);
  while (prev < tl.end) {
    const gap = gaps[(k + 1) % times.length];
    const candidate = prev + gap * HOUR;
    const zone = locationAt(candidate, tl).tz;
    // Any of the medicine's usual times can become the next one: a 12-hourly pill
    // flying 12 hours east simply swaps its morning and evening doses.
    let target = null;
    times.forEach((time, j) => {
      const t = closestOccurrence(targetTime(med, time), zone, candidate);
      const better = target === null || Math.abs(t - candidate) < Math.abs(target - candidate) - MINUTE;
      if (better || (Math.abs(t - candidate) <= Math.abs(target - candidate) + MINUTE && j === (k + 1) % times.length)) {
        target = t;
        k = j;
      }
    });
    const goal = targetTime(med, times[k]);
    const wanted = (target - candidate) / HOUR;
    let shift = Math.max(-flex, Math.min(flex, wanted));
    let utc = Math.round((candidate + shift * HOUR) / MINUTE) * MINUTE;
    const remaining = wanted - shift;

    // Sleep-aware: a dose that would wake you is pulled to the edge of your sleep
    // window when the medicine's flexibility allows; otherwise it is flagged.
    let night = null;
    const loc = locationAt(utc, tl);
    const localTime = wallClock(utc, loc.tz).time;
    if (sleep && loc.place !== "flight" && inSleep(localTime, sleep) && !inSleep(goal, sleep)) {
      const h = timeToHours(localTime);
      const back = (h - timeToHours(sleep.from) + 24) % 24 + 0.25;
      const forward = (timeToHours(sleep.to) - h + 24) % 24;
      // Only nudge in the direction the dose is already travelling, so it never stalls.
      const options = [shift - back, shift + forward].filter(
        (s) => Math.abs(s) <= flex + 1e-9 && (Math.abs(wanted) < 1 / 60 || Math.sign(s - shift) === Math.sign(wanted))
      );
      if (options.length) {
        const best = options.reduce((a, b) => (Math.abs(a - shift) <= Math.abs(b - shift) ? a : b));
        utc = Math.round((candidate + best * HOUR) / MINUTE) * MINUTE;
        shift = best;
        night = "moved";
      } else {
        night = "alarm";
      }
    }

    let kind = "same";
    let reason = "Usual spacing";
    if (Math.abs(wanted) >= 1 / 60) {
      const dir = shift > 0 ? "later" : "earlier";
      if (Math.abs(remaining) < 1 / 60) {
        kind = "reached";
        reason = `${hoursLabel(shift)} ${dir}: now on local ${goal}`;
      } else {
        kind = "shifting";
        reason = `${hoursLabel(shift)} ${dir}, stepping toward local ${goal} (${hoursLabel(remaining)} to go)`;
      }
    }
    if (med.type === "with_food" && kind !== "shifting") reason += ` · with ${nearestMeal(times[k]).name}`;
    if (night === "moved") reason += " · kept out of your sleep hours";
    if (night === "alarm") reason += " · falls in your sleep hours, set an alarm";

    const actualGap = (utc - prev) / HOUR;
    if (utc >= tl.start && utc < tl.end) {
      doses.push(
        describe(
          {
            medId: med.id,
            name: med.name,
            dose: med.dose,
            utc,
            gapHours: actualGap,
            nominalGap: gap,
            flexHours: flex,
            safe: Math.abs(actualGap - gap) <= flex + 0.01,
            kind,
            reason,
            night,
          },
          home,
          tl
        )
      );
    }
    prev = utc;
  }
  return doses;
}

// What a plain time-zone converter (or a phone alarm) does: same clock times, wherever you are.
export function planMedicinePlain(med, home, trip) {
  const tl = tripTimeline(home, trip);
  const times = sortedTimes(med);
  const gaps = nominalGaps(times);
  const flex = Number(med.flexHours ?? DEFAULT_FLEX[med.type] ?? 2);
  const alarms = [];
  const firstDay = addDays(trip.departDate, -2);
  const lastDay = addDays(wallClock(tl.end, home).date, 2);
  for (const zone of new Set([home, trip.dest])) {
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      times.forEach((time, k) => {
        const utc = zonedToUtc(day, time, zone);
        if (locationAt(utc, tl).tz === zone) alarms.push({ utc, k });
      });
    }
  }
  alarms.sort((a, b) => a.utc - b.utc);

  const doses = [];
  for (let i = 1; i < alarms.length; i++) {
    const { utc, k } = alarms[i];
    if (utc < tl.start || utc >= tl.end) continue;
    const gapHours = (utc - alarms[i - 1].utc) / HOUR;
    const safe = Math.abs(gapHours - gaps[k]) <= flex + 0.01;
    doses.push(
      describe(
        {
          medId: med.id,
          name: med.name,
          dose: med.dose,
          utc,
          gapHours,
          nominalGap: gaps[k],
          flexHours: flex,
          safe,
          kind: "plain",
          reason: safe ? "Same clock time" : `Gap ${hoursLabel(gapHours)} instead of ${hoursLabel(gaps[k])}`,
        },
        home,
        tl
      )
    );
  }
  return doses;
}

export function planTrip({ home, medicines, trip, sleep = DEFAULT_SLEEP }) {
  const tl = tripTimeline(home, trip);
  const jetdose = medicines.flatMap((m) => planMedicine(m, home, trip, sleep)).sort((a, b) => a.utc - b.utc);
  const plain = medicines.flatMap((m) => planMedicinePlain(m, home, trip)).sort((a, b) => a.utc - b.utc);
  return {
    timeline: tl,
    jetdose,
    plain,
    unsafe: {
      jetdose: jetdose.filter((d) => !d.safe).length,
      plain: plain.filter((d) => !d.safe).length,
    },
    night: {
      jetdose: jetdose.filter((d) => d.place !== "flight" && inSleep(d.local.time, sleep)).length,
      plain: plain.filter((d) => d.place !== "flight" && inSleep(d.local.time, sleep)).length,
    },
  };
}
