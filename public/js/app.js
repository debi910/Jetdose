import { CITIES, findCity, wallClock, offsetMinutes, formatDiff, addDays, timeToHours } from "./tz.js";
import { planTrip, DEFAULT_FLEX, DEFAULT_SLEEP, inSleep } from "./planner.js";
import { parseMedicineText } from "./parser.js";
import { dosesToIcs } from "./ics.js";

const STORE = "jetdose:v1";
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MED_COLORS = ["#f2a541", "#2fb8a6", "#8a7bff", "#ff6f61", "#3f9cf0", "#e05fae"];
const STEPS = ["meds", "trip", "plan"];

const EXAMPLES = [
  "Tacrolimus 2 mg every 12 hours at 8am and 8pm",
  "Metformin 500 mg twice a day with meals",
  "Levothyroxine 50 mcg once daily in the morning",
];

const SAMPLE = {
  homeCity: "Mumbai",
  medicines: [
    { id: "s1", name: "Tacrolimus", dose: "2 mg", type: "interval", times: ["08:00", "20:00"], flexHours: 1, source: "rules" },
    { id: "s2", name: "Metformin", dose: "500 mg", type: "with_food", times: ["08:00", "19:30"], flexHours: 3, source: "rules" },
    { id: "s3", name: "Levothyroxine", dose: "50 mcg", type: "daily", times: ["07:00"], flexHours: 3, source: "rules" },
  ],
  trip: { destCity: "London", departDate: "", departTime: "09:30", flightHours: 9.5, stayDays: 4 },
};

function defaultState() {
  return {
    homeCity: "Mumbai",
    medicines: [],
    trip: { destCity: "London", departDate: addDays(new Date().toISOString().slice(0, 10), 7), departTime: "09:30", flightHours: 9.5, stayDays: 4 },
    sleep: { ...DEFAULT_SLEEP },
    lastPlan: null,
    view: "jetdose",
    filter: "all",
  };
}

let state = load();
let step = "meds";

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved) return { ...defaultState(), ...saved };
  } catch {}
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {}
}

const colorOf = (id) => MED_COLORS[Math.max(0, state.medicines.findIndex((m) => m.id === id)) % MED_COLORS.length];
const homeCity = () => findCity(state.homeCity);
const destCity = () => findCity(state.trip.destCity);

// ---------- Steps ----------
function go(next) {
  const changed = next !== step;
  step = next;
  $$(".panel").forEach((p) => {
    p.hidden = p.id !== next;
    if (p.id === next && changed && !reduceMotion) {
      p.classList.remove("entering");
      void p.offsetWidth;
      p.classList.add("entering");
    }
  });
  $$(".step").forEach((b) => (b.dataset.step === next ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
  $(".steps").style.setProperty("--i", STEPS.indexOf(next));
  if (next === "plan") renderPlan({ fresh: true });
  if (next === "trip") renderTrip();
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

// ---------- Hero: live clocks and the route arc ----------
function skyFor(hour) {
  if (hour < 5 || hour >= 21) return "linear-gradient(160deg, #1d2f5c, #0b1424)";
  if (hour < 8) return "linear-gradient(160deg, #f6a96b, #5a4a8a)";
  if (hour < 17) return "linear-gradient(160deg, #5cb8ff, #2a6fb0)";
  return "linear-gradient(160deg, #ff8a5c, #6b3f8a)";
}

function tickClocks() {
  const now = Date.now();
  for (const [sel, city] of [["home", homeCity()], ["dest", destCity()]]) {
    const w = wallClock(now, city.tz);
    $(`#clock-${sel}`).textContent = w.time;
    $(`#clock-${sel}-city`).textContent = `${city.city} · ${w.weekday}`;
    $(`.${sel}-clock`).style.setProperty("--clock-sky", skyFor(w.hour));
  }
}

let flight = null;
function renderHero() {
  const home = homeCity();
  const dest = destCity();
  $("#code-home").textContent = home.code;
  $("#code-dest").textContent = dest.code;
  const diff = (offsetMinutes(Date.now(), dest.tz) - offsetMinutes(Date.now(), home.tz)) / 60;
  $("#shift-label").textContent = diff === 0 ? "Same time zone" : `${formatDiff(diff).replace("+", "+ ").replace("-", "− ")} body-clock shift`;
  tickClocks();
  flyPlane();
}

function flyPlane() {
  const path = $("#arc");
  const plane = $("#plane");
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  const place = (p) => {
    const a = path.getPointAtLength(p * len);
    const b = path.getPointAtLength(Math.min(len, p * len + 1));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    plane.setAttribute("transform", `translate(${a.x} ${a.y}) rotate(${angle})`);
    path.style.strokeDashoffset = `${len * (1 - p)}`;
  };
  if (flight) cancelAnimationFrame(flight);
  if (reduceMotion) return place(1);
  const DURATION = 2600;
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const frame = (t) => {
    const p = Math.min(1, (t - t0) / DURATION);
    place(ease(p));
    if (p < 1) flight = requestAnimationFrame(frame);
  };
  flight = requestAnimationFrame(frame);
}

// ---------- Toasts ----------
function toast(title, sub = "", icon = "✓") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="ico">${icon}</span><div><b>${escapeHtml(title)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</div>`;
  $("#toaster").append(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

// ---------- Medicines ----------
function cityOptions(select, selected) {
  select.innerHTML = CITIES.map((c) => `<option ${c.city === selected ? "selected" : ""}>${c.city}</option>`).join("");
}

function renderHome() {
  cityOptions($("#home"), state.homeCity);
  const tz = homeCity().tz;
  const off = offsetMinutes(Date.now(), tz) / 60;
  $("#home-tz").textContent = `Time zone ${tz} (UTC${formatDiff(off).replace("+0h", "±0h")}). Your usual dose times are in this time.`;
  renderHero();
}

function miniClock(med, color) {
  const hours = [0, 6, 12, 18]
    .map((h) => `<span class="hr ${h < 7 || h > 19 ? "dark" : ""}" style="left:${(h / 24) * 100 + 2}%">${String(h).padStart(2, "0")}</span>`)
    .join("");
  const ticks = med.times.map((t) => `<span class="tick" style="left:${(timeToHours(t) / 24) * 100}%;--c:${color}" title="${t}"></span>`).join("");
  return hours + ticks;
}

function renderMeds() {
  const list = $("#med-list");
  list.innerHTML = "";
  $("#med-empty").hidden = state.medicines.length > 0;
  state.medicines.forEach((med, i) => {
    const color = MED_COLORS[i % MED_COLORS.length];
    const node = $("#med-card").content.firstElementChild.cloneNode(true);
    node.dataset.id = med.id;
    node.style.setProperty("--c", color);
    node.querySelector(".name").value = med.name;
    node.querySelector(".dose").value = med.dose;
    node.querySelector(".type").value = med.type;
    node.querySelector(".times").value = med.times.join(", ");
    node.querySelector(".flex").value = med.flexHours;
    node.querySelector(".mini-clock").innerHTML = miniClock(med, color);
    const src = node.querySelector(".source");
    src.textContent = med.source === "llm" ? "Read by Claude" : "Read by built-in rules";
    src.className = `source ${med.source}`;
    node.querySelector(".note").textContent = med.note ?? "";
    list.append(node);
  });
}

function updateMed(id, patch) {
  const med = state.medicines.find((m) => m.id === id);
  if (!med) return;
  Object.assign(med, patch);
  state.lastPlan = null;
  save();
}

async function readSentence(text) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return await res.json();
  } catch {}
  return parseMedicineText(text);
}

async function addMedicine() {
  const text = $("#med-text").value.trim();
  if (!text) return;
  const button = $("#add-med");
  button.disabled = true;
  button.classList.add("busy");
  const parsed = await readSentence(text);
  for (const m of parsed.medicines) {
    const times = (m.times?.length ? m.times : ["08:00"]).map(normaliseTime).filter(Boolean);
    state.medicines.push({
      id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
      name: m.name,
      dose: m.dose,
      type: m.type,
      times: times.length ? times : ["08:00"],
      flexHours: m.flexHours || DEFAULT_FLEX[m.type],
      note: m.note,
      source: parsed.source,
    });
  }
  const names = parsed.medicines.map((m) => m.name).join(", ");
  toast(
    names ? `Added ${names}` : "Couldn't find a medicine there",
    parsed.source === "llm" ? "Read by Claude. Check the card." : "Read by built-in rules, works offline. Check the card.",
    names ? "✓" : "?"
  );
  $("#med-text").value = "";
  button.disabled = false;
  button.classList.remove("busy");
  state.lastPlan = null;
  save();
  renderMeds();
}

function normaliseTime(t) {
  const m = String(t).trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ---------- Trip ----------
function renderTrip() {
  const home = homeCity();
  $("#trip-from").textContent = `${home.city} (${home.code})`;
  cityOptions($("#dest"), state.trip.destCity);
  $("#depart-date").value = state.trip.departDate;
  $("#depart-time").value = state.trip.departTime;
  $("#flight-hours").value = state.trip.flightHours;
  $("#stay-days").value = state.trip.stayDays;
  $("#sleep-from").value = state.sleep.from;
  $("#sleep-to").value = state.sleep.to;
  renderDiff();
}

function renderDiff() {
  const home = homeCity();
  const dest = destCity();
  const diff = (offsetMinutes(Date.now(), dest.tz) - offsetMinutes(Date.now(), home.tz)) / 60;
  const label = formatDiff(Math.abs(diff)).slice(1);
  $("#tz-diff").textContent =
    diff === 0 ? `${dest.city} is on the same time as ${home.city}.` : `${dest.city} is ${label} ${diff > 0 ? "ahead of" : "behind"} ${home.city}.`;
}

// ---------- Plan ----------
function makePlan() {
  const home = homeCity().tz;
  const trip = { ...state.trip, dest: destCity().tz };
  const result = planTrip({ home, medicines: state.medicines, trip, sleep: state.sleep });
  state.lastPlan = { generatedAt: Date.now(), ...result };
  save();
  return state.lastPlan;
}

function placeLabel(dose, plan) {
  if (dose.place === "flight") return dose.utc < plan.timeline.arrive ? `In the air to ${destCity().city}` : `In the air to ${homeCity().city}`;
  if (dose.place === "dest") return destCity().city;
  return dose.utc >= plan.timeline.returnArrive ? `${homeCity().city}, back home` : homeCity().city;
}

function fmtDate(utc, tz) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(utc));
}

function hours(h) {
  const r = Math.round(h * 2) / 2;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)}h`;
}

function currentPlan() {
  return state.lastPlan?.jetdose && state.lastPlan.night ? state.lastPlan : makePlan();
}

function renderPlan({ fresh = false } = {}) {
  const ready = state.medicines.length > 0 && state.trip.departDate;
  $("#plan-empty").hidden = ready;
  $("#plan-body").hidden = !ready;
  if (!ready) return;
  const plan = currentPlan();
  const home = homeCity();
  const dest = destCity();
  const tl = plan.timeline;

  $("#plan-pass").innerHTML = `
    <div class="pass-stub">BOARDING PASS · ${state.medicines.length} MEDICINE${state.medicines.length === 1 ? "" : "S"} ON BOARD</div>
    <div class="route">
      <div><div class="code">${home.code}</div><div class="city">${home.city}</div></div>
      <div class="line"></div>
      <div><div class="code">${dest.code}</div><div class="city">${dest.city}</div></div>
    </div>
    <div class="tear"></div>
    <div class="legs">
      <div><span>Depart</span><b>${fmtDate(tl.depart, home.tz)} ${wallClock(tl.depart, home.tz).time}</b></div>
      <div><span>Land</span><b>${fmtDate(tl.arrive, dest.tz)} ${wallClock(tl.arrive, dest.tz).time}</b></div>
      <div><span>Fly home</span><b>${fmtDate(tl.returnDepart, dest.tz)} ${wallClock(tl.returnDepart, dest.tz).time}</b></div>
      <div><span>Sleep window</span><b>${state.sleep.from}–${state.sleep.to}</b></div>
    </div>`;

  const toggle = $(".toggle");
  toggle.dataset.view = state.view;
  toggle.style.setProperty("--i", state.view === "plain" ? 1 : 0);
  $$(".toggle button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));

  renderSummary(plan, home, dest, fresh);
  renderInsight(plan, home, dest);
  if (fresh) renderDial(plan);
  renderRail(plan);
  renderNext(plan);

  const meds = [{ id: "all", name: "All medicines" }, ...state.medicines];
  if (!meds.some((m) => m.id === state.filter)) state.filter = "all";
  $("#filters").innerHTML = meds
    .map(
      (m) =>
        `<button data-filter="${m.id}" aria-pressed="${m.id === state.filter}" style="--c:${m.id === "all" ? "var(--soft)" : colorOf(m.id)}"><i></i>${escapeHtml(m.name || "Unnamed")}</button>`
    )
    .join("");

  const doses = (state.view === "plain" ? plan.plain : plan.jetdose).filter((d) => state.filter === "all" || d.medId === state.filter);
  const days = new Map();
  for (const d of doses) {
    const key = `${d.local.date}|${placeLabel(d, plan)}`;
    if (!days.has(key)) days.set(key, { title: fmtDate(d.utc, d.displayTz), where: placeLabel(d, plan), place: d.place, doses: [] });
    days.get(key).doses.push(d);
  }

  $("#timeline").innerHTML = [...days.values()]
    .map(
      (day, n) => `
      <li class="day ${day.place}" style="--n:${n}${fresh ? "" : ";animation:none"}">
        <h3><span>${day.title}</span><span class="where">${day.place === "flight" ? "✈ " : ""}${escapeHtml(day.where)}</span></h3>
        ${day.doses.map(doseRow).join("")}
      </li>`
    )
    .join("");
}

function countUp(el, to) {
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = to;
  if (reduceMotion || from === to) return (el.textContent = to);
  const t0 = performance.now();
  const frame = (t) => {
    const p = Math.min(1, (t - t0) / 600);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function renderSummary(plan, home, dest, fresh) {
  const box = $("#summary");
  if (home.tz === dest.tz) {
    box.innerHTML = `<div class="stat good" style="grid-column:1/-1"><b>0</b>Same time zone: no changes needed</div>`;
    return;
  }
  if (fresh || !box.querySelector("[data-stat]")) {
    box.innerHTML = `
      <div class="stat" data-stat="plain"><b data-v="0">0</b>unsafe gaps with phone alarms</div>
      <div class="stat" data-stat="jetdose"><b data-v="0">0</b>unsafe gaps with JetDose</div>
      <div class="stat warn" data-stat="night"><b data-v="0">0</b>doses in sleep hours, flagged for an alarm</div>`;
  }
  const values = { plain: plan.unsafe.plain, jetdose: plan.unsafe.jetdose, night: plan.night.jetdose };
  for (const [key, v] of Object.entries(values)) {
    const el = box.querySelector(`[data-stat="${key}"]`);
    if (key !== "night") el.className = `stat ${v ? "bad" : "good"} ${state.view === key ? "active" : ""}`;
    countUp(el.querySelector("b"), v);
  }
}

// The single most dangerous moment a phone alarm would cause, next to what JetDose does instead.
function renderInsight(plan, home, dest) {
  const box = $("#insight");
  const worst = plan.plain.reduce((w, d) => (!w || Math.abs(d.gapHours - d.nominalGap) > Math.abs(w.gapHours - w.nominalGap) ? d : w), null);
  if (!worst || worst.safe || home.tz === dest.tz) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const mine = plan.jetdose.filter((d) => d.medId === worst.medId);
  const maxShift = Math.max(...mine.map((d) => Math.abs(d.gapHours - d.nominalGap)));
  box.innerHTML = `
    <div class="row"><span class="tag bad">ALARMS</span><span><b>${escapeHtml(worst.name)}</b> would go <b>${hours(worst.gapHours)}</b> between doses instead of ${hours(worst.nominalGap)}, ${escapeHtml(placeLabel(worst, plan).toLowerCase().startsWith("in the air") ? "around the flight" : `in ${placeLabel(worst, plan)}`)}.</span></div>
    <div class="row"><span class="tag good">JETDOSE</span><span>Every ${escapeHtml(worst.name)} gap stays within <b>${hours(maxShift)}</b> of usual, inside the ${hours(worst.flexHours)} it can safely move.</span></div>`;
}

// A 24-hour dial in destination time: dashed rings show where your home dose times
// fall in the new day, filled dots show where JetDose settles them.
function renderDial(plan) {
  const svg = $("#dial");
  const C = 130;
  const tl = plan.timeline;
  const dest = destCity();
  const polar = (h, r) => {
    const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const arc = (h1, h2, r) => {
    const span = (h2 - h1 + 24) % 24 || 24;
    const [x1, y1] = polar(h1, r);
    const [x2, y2] = polar(h1 + span, r);
    return `M${x1} ${y1} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const sFrom = timeToHours(state.sleep.from);
  const sTo = timeToHours(state.sleep.to);
  const shift = (offsetMinutes(tl.arrive, tl.dest) - offsetMinutes(tl.arrive, tl.home)) / 60;

  let html = `<circle class="face" cx="${C}" cy="${C}" r="124"/>
    <path class="day-arc" d="${arc(sTo, sFrom, 112)}"/>
    <path class="night-arc" d="${arc(sFrom, sTo, 112)}"/>`;
  for (let h = 0; h < 24; h++) {
    const [x1, y1] = polar(h, 98);
    const [x2, y2] = polar(h, h % 6 ? 94 : 90);
    html += `<line class="hour-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    if (h % 6 === 0) {
      const [tx, ty] = polar(h, 80);
      html += `<text class="hour-num" x="${tx}" y="${ty + 3.5}" text-anchor="middle">${String(h).padStart(2, "0")}</text>`;
    }
  }
  const lastDay = plan.jetdose.filter((d) => d.place === "dest" && d.utc >= tl.returnDepart - 26 * 3600000);
  let delay = 0;
  state.medicines.forEach((med, i) => {
    const color = MED_COLORS[i % MED_COLORS.length];
    const r = 62 - i * 9;
    const settled = [...new Set(lastDay.filter((d) => d.medId === med.id).map((d) => d.local.time))];
    med.times.forEach((t) => {
      const h = (timeToHours(t) + shift + 48) % 24;
      const [gx, gy] = polar(h, 112);
      html += `<circle class="ghost-dot" cx="${gx}" cy="${gy}" r="6" stroke="${color}"/>`;
    });
    settled.forEach((t) => {
      const [x, y] = polar(timeToHours(t), r);
      html += `<circle class="dot" cx="${x}" cy="${y}" r="7" fill="${color}" style="animation-delay:${(delay += 70)}ms"><title>${escapeHtml(med.name)} ${t}</title></circle>`;
    });
  });
  html += `<text class="center-city" x="${C}" y="${C + 4}" text-anchor="middle">${escapeHtml(dest.code)}</text>
    <text class="center-sub" x="${C}" y="${C + 18}" text-anchor="middle">LOCAL TIME</text>`;
  svg.innerHTML = html;
  $("#dial-legend").innerHTML =
    state.medicines.map((m, i) => `<span><i style="--c:${MED_COLORS[i % MED_COLORS.length]}"></i>${escapeHtml(m.name)}</span>`).join("") +
    `<span><i class="hollow"></i>home time, seen from ${escapeHtml(dest.city)}</span>`;
}

// Every dose of the trip on one rail per medicine. Switching views slides the same
// dots between the phone-alarm times and the JetDose times.
function renderRail(plan) {
  const tl = plan.timeline;
  const span = tl.end - tl.start;
  const x = (t) => ((t - tl.start) / span) * 100;
  const rail = $("#rail");
  const signature = `${tl.start}|${tl.end}|${state.medicines.map((m) => m.id).join(",")}`;
  if (rail.dataset.sig !== signature) {
    rail.dataset.sig = signature;
    const band = (cls, a, b, label) => `<div class="band ${cls}" style="width:${x(b) - x(a)}%">${label}</div>`;
    const home = homeCity();
    const dest = destCity();
    rail.innerHTML = `
      <div class="bands">
        ${band("home", tl.start, tl.depart, home.code)}${band("flight", tl.depart, tl.arrive, "✈")}${band("dest", tl.arrive, tl.returnDepart, dest.city.toUpperCase())}${band("flight", tl.returnDepart, tl.returnArrive, "✈")}${band("home", tl.returnArrive, tl.end, home.code)}
      </div>
      <div class="lanes">${state.medicines
        .map(
          (m, i) =>
            `<div class="lane-row" style="--c:${MED_COLORS[i % MED_COLORS.length]}"><span class="lane-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span><div class="lane" data-med="${m.id}"></div></div>`
        )
        .join("")}</div>
      <div class="axis"><span>${fmtDate(tl.start, home.tz)}</span><span>land ${fmtDate(tl.arrive, dest.tz)}</span><span>fly home ${fmtDate(tl.returnDepart, dest.tz)}</span><span>${fmtDate(tl.end, home.tz)}</span></div>`;
  }
  const doses = state.view === "plain" ? plan.plain : plan.jetdose;
  for (const lane of rail.querySelectorAll(".lane")) {
    const mine = doses.filter((d) => d.medId === lane.dataset.med);
    lane.querySelectorAll(".gapbar").forEach((g) => g.remove());
    const pins = [...lane.querySelectorAll(".pin")];
    mine.forEach((d, i) => {
      let pin = pins[i];
      if (!pin) {
        pin = document.createElement("span");
        pin.innerHTML = "<i></i>";
        pin.style.transform = `translateX(${x(d.utc)}%)`;
        lane.append(pin);
      }
      pin.style.transform = `translateX(${x(d.utc)}%)`;
      const asleep = state.view === "plain" ? d.place !== "flight" && inSleep(d.local.time, state.sleep) : Boolean(d.night);
      pin.className = `pin ${d.safe ? "" : "bad"} ${asleep ? "night" : ""}`;
      pin.title = `${d.name} ${d.local.time} · ${hours(d.gapHours)} gap`;
      if (!d.safe) {
        const bar = document.createElement("span");
        bar.className = "gapbar";
        const from = Math.max(0, x(d.utc - d.gapHours * 3600000));
        bar.style.left = `${from}%`;
        bar.style.width = `${x(d.utc) - from}%`;
        lane.prepend(bar);
      }
    });
    pins.slice(mine.length).forEach((p) => p.classList.add("gone"));
  }
  const now = Date.now();
  rail.querySelectorAll(".now-line").forEach((l) => l.remove());
  if (now > tl.start && now < tl.end) {
    for (const lane of rail.querySelectorAll(".lane")) {
      const line = document.createElement("span");
      line.className = "now-line";
      line.style.left = `${x(now)}%`;
      lane.append(line);
    }
  }
}

// ---------- Next dose countdown ----------
let nextTimer = null;
function renderNext(plan) {
  clearInterval(nextTimer);
  const box = $("#next-dose");
  const update = () => {
    const now = Date.now();
    const idx = plan.jetdose.findIndex((d) => d.utc > now);
    if (idx < 0) {
      box.innerHTML = `<div></div><div><div class="label">Trip complete</div><div class="what">Back on your home schedule</div></div>`;
      return clearInterval(nextTimer);
    }
    const d = plan.jetdose[idx];
    const together = plan.jetdose.filter((x) => x.utc === d.utc).map((x) => x.name);
    const left = d.utc - now;
    const days = Math.floor(left / 86400000);
    const hms = new Date(left % 86400000).toISOString().slice(11, 19);
    const prev = d.utc - d.gapHours * 3600000;
    const progress = Math.max(0, Math.min(1, (now - prev) / (d.utc - prev)));
    const R = 24;
    const L = 2 * Math.PI * R;
    const first = idx === 0 && now < plan.timeline.start;
    box.innerHTML = `
      <svg class="ring" viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="${R}"/><circle class="fg" cx="29" cy="29" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - progress)}"/></svg>
      <div>
        <div class="label">${first ? "First dose of your trip" : "Next dose"}</div>
        <div class="what">${escapeHtml(together.join(" + "))}</div>
        <div class="when">${fmtDate(d.utc, d.displayTz)} at ${d.local.time} · ${escapeHtml(placeLabel(d, plan))}</div>
      </div>
      <div class="count">${days ? `${days}d ` : ""}${hms}<small>to go</small></div>`;
  };
  update();
  nextTimer = setInterval(update, 1000);
}

function doseRow(d) {
  const home = homeCity();
  const showHome = d.displayTz !== home.tz;
  return `
    <div class="dose ${d.kind} ${d.safe ? "" : "unsafe"}" style="--c:${colorOf(d.medId)}">
      <div class="t">${d.local.time}${showHome ? `<small>${d.homeClock.time} in ${escapeHtml(home.city)}</small>` : ""}</div>
      <div>
        <div class="what"><b>${escapeHtml(d.name)}</b><span class="d">${escapeHtml(d.dose || "")}</span></div>
        <div class="why">${escapeHtml(d.reason)}</div>
      </div>
      <div class="tags">
        ${d.place === "flight" ? `<span class="inflight">On the plane</span>` : ""}
        ${d.night === "alarm" ? `<span class="alarm">⏰ Set an alarm</span>` : ""}
        <span class="gap ${d.safe ? "ok" : "bad"}" title="Time since previous dose (usual ${hours(d.nominalGap)})">${hours(d.gapHours)} gap</span>
      </div>
    </div>`;
}

// ---------- Calendar and print ----------
function exportCalendar() {
  const plan = currentPlan();
  const ics = dosesToIcs(plan.jetdose);
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `jetdose-${homeCity().code}-${destCity().code}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${plan.jetdose.length} doses saved to a calendar file`, "Open it on your phone: each dose rings 5 minutes early, even offline.", "📅");
}

function printCard() {
  const plan = currentPlan();
  const home = homeCity();
  const dest = destCity();
  let lastDay = "";
  const rows = plan.jetdose
    .map((d) => {
      const day = fmtDate(d.utc, d.displayTz);
      const cell = day !== lastDay ? day : "";
      lastDay = day;
      return `<tr><td class="daycell">${cell}</td><td class="mono">${d.local.time}</td><td class="mono">${d.homeClock.time}</td><td>${escapeHtml(d.name)} <span class="mono">${escapeHtml(d.dose || "")}</span></td><td>${escapeHtml(placeLabel(d, plan))}</td><td>${escapeHtml(d.reason)}</td></tr>`;
    })
    .join("");
  $("#print-sheet").innerHTML = `
    <h1>JetDose travel card · ${home.city} (${home.code}) → ${dest.city} (${dest.code})</h1>
    <p class="sub">Medicines: ${state.medicines.map((m) => `${escapeHtml(m.name)} ${escapeHtml(m.dose || "")}`).join(", ")} · Sleep ${state.sleep.from}–${state.sleep.to}</p>
    <table><thead><tr><th>Day</th><th>Local time</th><th>${home.city} time</th><th>Medicine</th><th>Where</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="foot">JetDose only changes timing, never doses. Doctor or pharmacist check: ____________________ Date: __________</p>`;
  window.print();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Events ----------
function bind() {
  $$(".step").forEach((b) => b.addEventListener("click", () => go(b.dataset.step)));
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));

  $("#home").addEventListener("change", (e) => {
    state.homeCity = e.target.value;
    state.lastPlan = null;
    save();
    renderHome();
  });
  $("#examples").innerHTML = EXAMPLES.map((e) => `<button type="button">${e}</button>`).join("");
  $("#examples").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") $("#med-text").value = e.target.textContent;
  });
  $("#add-med").addEventListener("click", addMedicine);
  $("#med-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addMedicine();
    }
  });
  $("#load-sample").addEventListener("click", () => {
    state = { ...state, ...structuredClone(SAMPLE), lastPlan: null };
    state.trip.departDate = addDays(new Date().toISOString().slice(0, 10), 7);
    save();
    renderHome();
    renderMeds();
    toast("Sample traveller loaded", "A transplant patient flying Mumbai → London with 3 medicines.");
  });

  $("#med-list").addEventListener("change", (e) => {
    const card = e.target.closest(".med");
    if (!card) return;
    const id = card.dataset.id;
    const field = e.target.classList[0];
    if (field === "times") {
      const times = e.target.value.split(/[,\s]+/).map(normaliseTime).filter(Boolean);
      if (times.length) updateMed(id, { times });
      const med = state.medicines.find((m) => m.id === id);
      e.target.value = med.times.join(", ");
      card.querySelector(".mini-clock").innerHTML = miniClock(med, colorOf(id));
    } else if (field === "flex") updateMed(id, { flexHours: Math.max(0.5, Number(e.target.value) || 1) });
    else if (["name", "dose", "type"].includes(field)) updateMed(id, { [field]: e.target.value });
  });
  $("#med-list").addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove")) return;
    const card = e.target.closest(".med");
    const id = card.dataset.id;
    state.medicines = state.medicines.filter((m) => m.id !== id);
    state.lastPlan = null;
    save();
    card.classList.add("leaving");
    setTimeout(renderMeds, reduceMotion ? 0 : 200);
  });

  const tripFields = { "#dest": "destCity", "#depart-date": "departDate", "#depart-time": "departTime", "#flight-hours": "flightHours", "#stay-days": "stayDays" };
  for (const [sel, key] of Object.entries(tripFields)) {
    $(sel).addEventListener("change", (e) => {
      const v = e.target.value;
      state.trip[key] = ["flightHours", "stayDays"].includes(key) ? Math.max(key === "stayDays" ? 1 : 0.5, Number(v) || 1) : v;
      state.lastPlan = null;
      save();
      renderDiff();
      if (key === "destCity") renderHero();
    });
  }
  for (const [sel, key] of [["#sleep-from", "from"], ["#sleep-to", "to"]]) {
    $(sel).addEventListener("change", (e) => {
      const t = normaliseTime(e.target.value);
      if (t) state.sleep[key] = t;
      state.lastPlan = null;
      save();
    });
  }
  $("#make-plan").addEventListener("click", () => {
    state.lastPlan = null;
    go("plan");
  });

  $$(".toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      if (state.view === b.dataset.view) return;
      state.view = b.dataset.view;
      save();
      renderPlan();
    })
  );
  $("#filters").addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]")?.dataset.filter;
    if (!f) return;
    state.filter = f;
    save();
    renderPlan();
  });
  $("#export-ics").addEventListener("click", exportCalendar);
  $("#print-card").addEventListener("click", printCard);
}

function registerOffline() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => ($("#offline-badge").hidden = false))
    .catch(() => {});
}

bind();
renderHome();
renderMeds();
go(state.medicines.length && state.lastPlan ? "plan" : "meds");
setInterval(tickClocks, 1000);
registerOffline();
