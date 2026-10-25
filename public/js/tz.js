// Time-zone helpers built on the browser's (and Node's) Intl API, so no date library is needed.

export const CITIES = [
  { city: "Mumbai", code: "BOM", tz: "Asia/Kolkata" },
  { city: "Delhi", code: "DEL", tz: "Asia/Kolkata" },
  { city: "Bengaluru", code: "BLR", tz: "Asia/Kolkata" },
  { city: "Chennai", code: "MAA", tz: "Asia/Kolkata" },
  { city: "Dubai", code: "DXB", tz: "Asia/Dubai" },
  { city: "Doha", code: "DOH", tz: "Asia/Qatar" },
  { city: "Singapore", code: "SIN", tz: "Asia/Singapore" },
  { city: "Hong Kong", code: "HKG", tz: "Asia/Hong_Kong" },
  { city: "Tokyo", code: "HND", tz: "Asia/Tokyo" },
  { city: "Seoul", code: "ICN", tz: "Asia/Seoul" },
  { city: "Sydney", code: "SYD", tz: "Australia/Sydney" },
  { city: "Auckland", code: "AKL", tz: "Pacific/Auckland" },
  { city: "London", code: "LHR", tz: "Europe/London" },
  { city: "Paris", code: "CDG", tz: "Europe/Paris" },
  { city: "Frankfurt", code: "FRA", tz: "Europe/Berlin" },
  { city: "Istanbul", code: "IST", tz: "Europe/Istanbul" },
  { city: "Nairobi", code: "NBO", tz: "Africa/Nairobi" },
  { city: "Johannesburg", code: "JNB", tz: "Africa/Johannesburg" },
  { city: "Lagos", code: "LOS", tz: "Africa/Lagos" },
  { city: "New York", code: "JFK", tz: "America/New_York" },
  { city: "Toronto", code: "YYZ", tz: "America/Toronto" },
  { city: "Chicago", code: "ORD", tz: "America/Chicago" },
  { city: "Denver", code: "DEN", tz: "America/Denver" },
  { city: "Los Angeles", code: "LAX", tz: "America/Los_Angeles" },
  { city: "Mexico City", code: "MEX", tz: "America/Mexico_City" },
  { city: "São Paulo", code: "GRU", tz: "America/Sao_Paulo" },
  { city: "Honolulu", code: "HNL", tz: "Pacific/Honolulu" },
];

export function findCity(name) {
  return CITIES.find((c) => c.city === name) ?? CITIES[0];
}

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        weekday: "short",
      })
    );
  }
  return formatters.get(tz);
}

// Wall-clock reading of a UTC instant in a zone.
export function wallClock(utcMs, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, weekday: parts.weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

// Minutes the zone is ahead of UTC at that instant.
export function offsetMinutes(utcMs, tz) {
  const w = wallClock(utcMs, tz);
  const asUtc = Date.UTC(+w.date.slice(0, 4), +w.date.slice(5, 7) - 1, +w.date.slice(8, 10), w.hour, w.minute);
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

// UTC instant of "HH:MM on YYYY-MM-DD" in a zone.
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - offsetMinutes(guess, tz) * 60000;
  const corrected = guess - offsetMinutes(utc, tz) * 60000;
  if (corrected !== utc) utc = corrected;
  return utc;
}

export function addDays(date, n) {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function timeToHours(time) {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
}

export function formatDiff(hours) {
  const sign = hours < 0 ? "-" : "+";
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sign}${h}h${m ? ` ${String(m).padStart(2, "0")}m` : ""}`;
}
