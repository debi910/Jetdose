import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMedicineText } from "../public/js/parser.js";

const read = (s) => parseMedicineText(s).medicines[0];

test("fixed interval with explicit times and a narrow-window drug", () => {
  assert.deepEqual(read("Tacrolimus 2 mg every 12 hours at 8am and 8pm"), {
    name: "Tacrolimus", dose: "2 mg", type: "interval", times: ["08:00", "20:00"], flexHours: 1, note: "",
  });
});

test("with food uses meal times", () => {
  const m = read("Metformin 500 mg twice a day with meals");
  assert.equal(m.type, "with_food");
  assert.deepEqual(m.times, ["08:00", "19:30"]);
});

test("once daily in the morning", () => {
  const m = read("Levothyroxine 50 mcg once daily in the morning");
  assert.equal(m.type, "daily");
  assert.deepEqual(m.times, ["08:00"]);
});

test("bedtime and units", () => {
  const m = read("Insulin glargine 10 units at bedtime");
  assert.equal(m.dose, "10 units");
  assert.deepEqual(m.times, ["22:00"]);
});

test("missing dose is flagged for the traveller", () => {
  assert.match(read("Aspirin daily").note, /dose/);
});
