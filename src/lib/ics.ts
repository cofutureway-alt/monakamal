/**
 * Minimal .ics builder for live sessions (VEVENT, UTC times).
 * The URL always points at the platform session page — never the Zoom join URL.
 */

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string | null;
  startAt: string | Date;
  durationMinutes: number;
  url: string;
  organizerName?: string;
}

function utcStamp(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long lines at 75 octets as required by RFC 5545. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return out.join("\r\n");
}

export function buildLiveSessionIcs(event: IcsEventInput): string {
  const start = event.startAt instanceof Date ? event.startAt : new Date(event.startAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Al-Saae Journey//Live Sessions//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    fold(`SUMMARY:${escapeText(event.title)}`),
  ];

  if (event.description) {
    lines.push(fold(`DESCRIPTION:${escapeText(event.description)}`));
  }
  if (event.organizerName) {
    lines.push(fold(`ORGANIZER;CN=${escapeText(event.organizerName)}:mailto:noreply@miss-mona-kamel.com`));
  }
  lines.push(fold(`URL:${event.url}`));
  lines.push("BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:تذكير بالجلسة", "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
