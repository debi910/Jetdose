// Built-in reader: hand-written pattern rules that turn a medicine sentence into a card.
// Used when the smart (LLM) reader is offline or not configured.

import { DEFAULT_FLEX, MEALS } from "./planner.js";

const NARROW_WINDOW = /tacrolimus|cyclosporin|ciclosporin|levodopa|carbidopa|sinemet|madopar|progestin|norethisterone|desogestrel|mini.?pill/i;
const DOSE = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|units?|iu|tablets?|tabs?|capsules?|puffs?|drops?)\b/i;
const WORD_COUNTS = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3, four: 4 };

function pad(n) {
  return String(n).padStart(2, "0");
}

function findTimes(text) {
  const times = [];
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi;
  for (const m of text.matchAll(re)) {
    let h, min;
    if (m[3]) {
      h = Number(m[1]) % 12;
      if (m[3].toLowerCase().startsWith("p")) h += 12;
      min = Number(m[2] ?? 0);
    } else {
      h = Number(m[4]);
      min = Number(m[5]);
    }
    times.push(`${pad(h)}:${pad(min)}`);
  }
  if (/\bmorning\b/i.test(text) && !times.length) times.push("08:00");
  if (/\b(night|bedtime|evening)\b/i.test(text) && times.length < 2) times.push(/bedtime|night/i.test(text) ? "22:00" : "20:00");
  return [...new Set(times)];
}

function defaultTimes(count, type) {
  if (type === "with_food") return { 1: ["08:00"], 2: ["08:00", "19:30"] }[count] ?? MEALS.map((m) => m.time);
  const presets = { 1: ["08:00"], 2: ["08:00", "20:00"], 3: ["08:00", "14:00", "20:00"], 4: ["06:00", "12:00", "18:00", "23:00"] };
  if (presets[count]) return presets[count];
  return Array.from({ length: count }, (_, i) => {
    const h = 8 + (i * 24) / count;
    return `${pad(Math.floor(h) % 24)}:${pad(Math.round((h % 1) * 60))}`;
  });
}

function nameFrom(text) {
  const beforeDose = text.split(DOSE)[0] || text;
  const words = beforeDose
    .replace(/\b(take|taking|i take|my|pill|tablet|tab)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => /^[a-z][a-z\-]+$/i.test(w))
    .slice(0, 3);
  const name = words.join(" ");
  return name ? name[0].toUpperCase() + name.slice(1) : "";
}

export function parseMedicineText(text) {
  const t = text.trim();
  const doseMatch = t.match(DOSE);
  const dose = doseMatch ? `${doseMatch[1]} ${doseMatch[2].toLowerCase()}` : "";
  const withFood = /\bwith (food|meals?|breakfast|lunch|dinner)|after (food|meals?|breakfast|lunch|dinner)|before (meals?|breakfast|dinner)/i.test(t);

  let count = null;
  let intervalHours = null;
  const every = t.match(/every\s+(\d+)\s*(?:h|hrs?|hours?)/i);
  if (every) {
    intervalHours = Number(every[1]);
    count = Math.max(1, Math.round(24 / intervalHours));
  }
  const times = findTimes(t);
  const wordCount = t.match(/\b(once|twice|thrice|one|two|three|four)\s+(?:times?\s+)?(?:a|per|each)?\s*(day|daily)/i);
  if (!count && wordCount) count = WORD_COUNTS[wordCount[1].toLowerCase()];
  if (!count && /\b(bid|b\.i\.d)\b/i.test(t)) count = 2;
  if (!count && /\b(tid|t\.i\.d)\b/i.test(t)) count = 3;
  if (!count && /\b(daily|once|every day|a day)\b/i.test(t)) count = 1;
  if (!count && times.length) count = times.length;
  if (!count) count = 1;

  let type = withFood ? "with_food" : count === 1 ? "daily" : "interval";
  let finalTimes = times.length === count ? times : defaultTimes(count, type);
  if (times.length && times.length !== count) finalTimes = times.length > count ? times.slice(0, count) : finalTimes;

  const flexHours = type === "interval" && NARROW_WINDOW.test(t) ? 1 : DEFAULT_FLEX[type];
  const missing = [];
  const name = nameFrom(t);
  if (!name) missing.push("name");
  if (!dose) missing.push("dose");

  return {
    medicines: [
      {
        name,
        dose,
        type,
        times: finalTimes.sort(),
        flexHours,
        note: missing.length ? `Please check: ${missing.join(", ")}` : "",
      },
    ],
    source: "rules",
  };
}
