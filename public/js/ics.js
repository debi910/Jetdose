// Calendar export: one event per dose, with a reminder, so the phone's own calendar
// rings at the right moment even with no internet and no JetDose tab open.

function stamp(utc) {
  return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function text(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

// Long lines must be folded at 75 octets.
function fold(line) {
  const out = [];
  while (line.length > 74) {
    out.push(line.slice(0, 74));
    line = " " + line.slice(74);
  }
  out.push(line);
  return out.join("\r\n");
}

export function dosesToIcs(doses, { now = Date.now(), reminderMinutes = 5 } = {}) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JetDose//Dose plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:JetDose"];
  for (const d of doses) {
    const title = `${d.name}${d.dose ? ` ${d.dose}` : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.medId}-${d.utc}@jetdose`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(d.utc)}`,
      `DTEND:${stamp(d.utc + 10 * 60000)}`,
      fold(`SUMMARY:Take ${text(title)}`),
      fold(`DESCRIPTION:${text(`${d.reason}. Gap since last dose: ${d.gapHours.toFixed(1)} h. JetDose only changes timing, never doses.`)}`),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:Time for ${text(title)}`),
      `TRIGGER:-PT${reminderMinutes}M`,
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
