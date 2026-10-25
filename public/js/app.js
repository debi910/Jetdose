import { CITIES, findCity, wallClock, offsetMinutes, formatDiff, addDays } from "./tz.js";
import { planTrip, DEFAULT_FLEX } from "./planner.js";
import { parseMedicineText } from "./parser.js";

const STORE = "jetdose:v1";
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

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
    lastPlan: null,
    view: "jetdose",
    filter: "all",
  };
}

let state = load();

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

// ---------- Steps ----------
function go(step) {
  $$(".panel").forEach((p) => (p.hidden = p.id !== step));
  $$(".step").forEach((b) => (b.dataset.step === step ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
  if (step === "plan") renderPlan();
  if (step === "trip") renderTrip();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- Medicines ----------
function cityOptions(select, selected) {
  select.innerHTML = CITIES.map((c) => `<option ${c.city === selected ? "selected" : ""}>${c.city}</option>`).join("");
}

function renderHome() {
  cityOptions($("#home"), state.homeCity);
  const tz = findCity(state.homeCity).tz;
  const off = offsetMinutes(Date.now(), tz) / 60;
  $("#home-tz").textContent = `Time zone ${tz} (UTC${formatDiff(off).replace("+0h", "±0h")}). Your usual dose times are in this time.`;
}

function renderMeds() {
  const list = $("#med-list");
  list.innerHTML = "";
  $("#med-empty").hidden = state.medicines.length > 0;
  for (const med of state.medicines) {
    const node = $("#med-card").content.firstElementChild.cloneNode(true);
    node.dataset.id = med.id;
    node.querySelector(".name").value = med.name;
    node.querySelector(".dose").value = med.dose;
    node.querySelector(".type").value = med.type;
    node.querySelector(".times").value = med.times.join(", ");
    node.querySelector(".flex").value = med.flexHours;
    const src = node.querySelector(".source");
    src.textContent = med.source === "llm" ? "Read by Claude" : "Read by built-in rules";
    src.className = `source ${med.source}`;
    node.querySelector(".note").textContent = med.note ?? "";
    if (med.fresh) {
      node.classList.add("flash");
      delete med.fresh;
    }
    list.append(node);
  }
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
  button.textContent = "Reading…";
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
      fresh: true,
    });
  }
  $("#reader-status").textContent =
    parsed.source === "llm" ? "Read by Claude. Check the card below." : "Read by built-in rules (smart reader offline). Check the card below.";
  $("#med-text").value = "";
  button.disabled = false;
  button.textContent = "Add";
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
  const home = findCity(state.homeCity);
  $("#trip-from").textContent = `${home.city} (${home.code})`;
  cityOptions($("#dest"), state.trip.destCity);
  $("#depart-date").value = state.trip.departDate;
  $("#depart-time").value = state.trip.departTime;
  $("#flight-hours").value = state.trip.flightHours;
  $("#stay-days").value = state.trip.stayDays;
  renderDiff();
}

function renderDiff() {
  const home = findCity(state.homeCity);
  const dest = findCity(state.trip.destCity);
  const diff = (offsetMinutes(Date.now(), dest.tz) - offsetMinutes(Date.now(), home.tz)) / 60;
  const label = formatDiff(Math.abs(diff)).slice(1);
  $("#tz-diff").textContent =
    diff === 0 ? `${dest.city} is on the same time as ${home.city}.` : `${dest.city} is ${label} ${diff > 0 ? "ahead of" : "behind"} ${home.city}.`;
}

// ---------- Plan ----------
function makePlan() {
  const home = findCity(state.homeCity).tz;
  const trip = { ...state.trip, dest: findCity(state.trip.destCity).tz };
  const result = planTrip({ home, medicines: state.medicines, trip });
  state.lastPlan = { generatedAt: Date.now(), ...result };
  save();
  return state.lastPlan;
}

function placeLabel(dose, plan) {
  const home = findCity(state.homeCity);
  const dest = findCity(state.trip.destCity);
  if (dose.place === "flight") return dose.utc < plan.timeline.arrive ? `In the air to ${dest.city}` : `In the air to ${home.city}`;
  if (dose.place === "dest") return dest.city;
  return dose.utc >= plan.timeline.returnArrive ? `${home.city}, back home` : home.city;
}

function fmtDate(utc, tz) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(utc));
}

function hours(h) {
  const r = Math.round(h * 2) / 2;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)}h`;
}

function renderPlan() {
  const ready = state.medicines.length > 0 && state.trip.departDate;
  $("#plan-empty").hidden = ready;
  $("#plan-body").hidden = !ready;
  if (!ready) return;
  const plan = state.lastPlan?.jetdose ? state.lastPlan : makePlan();
  const home = findCity(state.homeCity);
  const dest = findCity(state.trip.destCity);
  const tl = plan.timeline;

  if (home.tz === dest.tz) {
    $("#summary").innerHTML = `<div class="stat good"><b>0</b>Same time zone: no changes needed</div>`;
  }

  $("#plan-pass").innerHTML = `
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
      <div><span>Medicines</span><b>${state.medicines.length}</b></div>
    </div>`;

  $$(".toggle button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
  if (home.tz !== dest.tz) {
    $("#summary").innerHTML = `
      <div class="stat ${plan.unsafe.plain ? "bad" : "good"} ${state.view === "plain" ? "active" : ""}"><b>${plan.unsafe.plain}</b>unsafe gaps with a plain converter</div>
      <div class="stat ${plan.unsafe.jetdose ? "bad" : "good"} ${state.view === "jetdose" ? "active" : ""}"><b>${plan.unsafe.jetdose}</b>unsafe gaps with JetDose</div>`;
  }

  const meds = [{ id: "all", name: "All medicines" }, ...state.medicines];
  if (!meds.some((m) => m.id === state.filter)) state.filter = "all";
  $("#filters").innerHTML = meds
    .map((m) => `<button data-filter="${m.id}" aria-pressed="${m.id === state.filter}">${escapeHtml(m.name || "Unnamed")}</button>`)
    .join("");

  const doses = (state.view === "plain" ? plan.plain : plan.jetdose).filter((d) => state.filter === "all" || d.medId === state.filter);
  const days = new Map();
  for (const d of doses) {
    const key = `${d.local.date}|${placeLabel(d, plan)}`;
    if (!days.has(key)) days.set(key, { title: fmtDate(d.utc, d.displayTz), where: placeLabel(d, plan), doses: [] });
    days.get(key).doses.push(d);
  }

  $("#timeline").innerHTML = [...days.values()]
    .map(
      (day) => `
      <li class="day">
        <h3><span>${day.title}</span><span class="where">${escapeHtml(day.where)}</span></h3>
        ${day.doses.map(doseRow).join("")}
      </li>`
    )
    .join("");
}

function doseRow(d) {
  const homeCity = findCity(state.homeCity).city;
  const showHome = d.displayTz !== findCity(state.homeCity).tz;
  return `
    <div class="dose ${d.kind} ${d.safe ? "" : "unsafe"}">
      <div class="t">${d.local.time}${showHome ? `<small>${d.homeClock.time} in ${escapeHtml(homeCity)}</small>` : ""}</div>
      <div>
        <div class="what"><b>${escapeHtml(d.name)}</b><span class="d">${escapeHtml(d.dose || "")}</span></div>
        <div class="why">${escapeHtml(d.reason)}</div>
      </div>
      <div class="tags">
        ${d.place === "flight" ? `<span class="inflight">On the plane</span>` : ""}
        <span class="gap ${d.safe ? "ok" : "bad"}" title="Time since previous dose (usual ${hours(d.nominalGap)})">${hours(d.gapHours)} gap</span>
      </div>
    </div>`;
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
  });

  $("#med-list").addEventListener("change", (e) => {
    const card = e.target.closest(".med");
    if (!card) return;
    const id = card.dataset.id;
    const field = e.target.classList[0];
    if (field === "times") {
      const times = e.target.value.split(/[,\s]+/).map(normaliseTime).filter(Boolean);
      if (times.length) updateMed(id, { times });
      e.target.value = state.medicines.find((m) => m.id === id).times.join(", ");
    } else if (field === "flex") updateMed(id, { flexHours: Math.max(0.5, Number(e.target.value) || 1) });
    else if (["name", "dose", "type"].includes(field)) updateMed(id, { [field]: e.target.value });
  });
  $("#med-list").addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove")) return;
    const id = e.target.closest(".med").dataset.id;
    state.medicines = state.medicines.filter((m) => m.id !== id);
    state.lastPlan = null;
    save();
    renderMeds();
  });

  const tripFields = { "#dest": "destCity", "#depart-date": "departDate", "#depart-time": "departTime", "#flight-hours": "flightHours", "#stay-days": "stayDays" };
  for (const [sel, key] of Object.entries(tripFields)) {
    $(sel).addEventListener("change", (e) => {
      const v = e.target.value;
      state.trip[key] = ["flightHours", "stayDays"].includes(key) ? Math.max(key === "stayDays" ? 1 : 0.5, Number(v) || 1) : v;
      state.lastPlan = null;
      save();
      renderDiff();
    });
  }
  $("#make-plan").addEventListener("click", () => {
    state.lastPlan = null;
    go("plan");
  });

  $$(".toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      state.view = b.dataset.view;
      save();
      renderPlan();
    })
  );
  $("#filters").addEventListener("click", (e) => {
    const f = e.target.dataset?.filter;
    if (!f) return;
    state.filter = f;
    save();
    renderPlan();
  });
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
registerOffline();
