import { test } from "node:test";
import assert from "node:assert/strict";
import { planTrip, planMedicine, tripTimeline } from "../public/js/planner.js";
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
