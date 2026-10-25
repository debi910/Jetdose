import { test } from "node:test";
import assert from "node:assert/strict";
import { planTrip, planMedicine, tripTimeline, inSleep } from "../public/js/planner.js";
import { dosesToIcs } from "../public/js/ics.js";
import { wallClock } from "../public/js/tz.js";

const HOME = "Asia/Kolkata";
const trip = { dest: "Europe/London", departDate: "2026-11-02", departTime: "09:30", flightHours: 9.5, stayDays: 5 };
const tacrolimus = { id: "t", name: "Tacrolimus", dose: "2 mg", type: "interval", times: ["08:00", "20:00"], flexHours: 1 };
const metformin = { id: "m", name: "Metformin", dose: "500 mg", type: "with_food", times: ["08:00", "19:30"], flexHours: 3 };
const levo = { id: "l", name: "Levothyroxine", dose: "50 mcg", type: "daily", times: ["07:00"], flexHours: 3 };

test("every JetDose gap stays within the medicine's flexibility", () => {
  for (const med of [tacrolimus, metformin, levo]) {
    for (const d of planMedicine(med, HOME, trip)) {
      assert.ok(Math.abs(d.gapHours - d.nominalGap) <= med.flexHours + 0.01, `${med.name} gap ${d.gapHours} vs ${d.nominalGap}`);
    }
  }
});

test("doses settle on usual local times during the stay", () => {
  const tl = tripTimeline(HOME, trip);
  const lastDayInLondon = planMedicine(tacrolimus, HOME, trip).filter((d) => d.place === "dest" && d.utc > tl.returnDepart - 24 * 3600000);
  assert.ok(lastDayInLondon.length > 0);
  for (const d of lastDayInLondon) assert.ok(["08:00", "20:00"].includes(d.local.time), d.local.time);
});

test("doses return to home times after the trip", () => {
  const doses = planMedicine(tacrolimus, HOME, trip);
  const last = doses.slice(-2).map((d) => wallClock(d.utc, HOME).time).sort();
  assert.deepEqual(last, ["08:00", "20:00"]);
});

test("with-food doses land on local meal times", () => {
  const tl = tripTimeline(HOME, trip);
  const settled = planMedicine(metformin, HOME, trip).filter((d) => d.place === "dest" && d.utc > tl.arrive + 48 * 3600000);
  for (const d of settled) assert.ok(["08:00", "19:30"].includes(d.local.time), d.local.time);
});

test("a plain converter creates unsafe gaps that JetDose avoids", () => {
  const plan = planTrip({ home: HOME, medicines: [tacrolimus, metformin, levo], trip });
  assert.ok(plan.unsafe.plain > 0);
  assert.equal(plan.unsafe.jetdose, 0);
});

test("a 12-hourly pill flying ~12 hours swaps morning and evening instead of drifting", () => {
  const ny = { ...trip, dest: "America/New_York", flightHours: 16 };
  const shifts = planMedicine({ ...tacrolimus, flexHours: 2 }, HOME, ny).filter((d) => d.kind === "shifting");
  assert.ok(shifts.length <= 2, `expected few shifting doses, got ${shifts.length}`);
});

test("same time zone means no changes", () => {
  const plan = planTrip({ home: HOME, medicines: [tacrolimus], trip: { ...trip, dest: "Asia/Kolkata" } });
  assert.ok(plan.jetdose.every((d) => d.kind === "same"));
  assert.equal(plan.unsafe.plain, 0);
});

test("a dose that would land in sleep hours is moved out when the medicine allows", () => {
  // Levothyroxine can move 3 h. Flying to London, 07:00 Mumbai is 01:30 London.
  const doses = planMedicine(levo, HOME, trip);
  for (const d of doses.filter((x) => x.place === "dest")) {
    assert.ok(d.night === "moved" || d.night === "alarm" || !inSleep(d.local.time), `${d.local.time} ${d.night}`);
  }
  assert.ok(doses.some((d) => d.night));
});

test("sleep nudges never break the safe gap", () => {
  for (const med of [tacrolimus, metformin, levo]) {
    for (const d of planMedicine(med, HOME, trip)) assert.ok(d.safe, `${med.name} at ${d.local.time}`);
  }
});

test("a narrow-window medicine that cannot avoid the night is flagged for an alarm", () => {
  const doses = planMedicine(tacrolimus, HOME, trip).filter((d) => d.place === "dest" && inSleep(d.local.time));
  assert.ok(doses.length > 0);
  assert.ok(doses.every((d) => d.night === "alarm"));
});

test("calendar export has one event with a reminder per dose", () => {
  const plan = planTrip({ home: HOME, medicines: [tacrolimus, levo], trip });
  const ics = dosesToIcs(plan.jetdose);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, plan.jetdose.length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, plan.jetdose.length);
  assert.match(ics, /DTSTART:\d{8}T\d{6}Z/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
});
