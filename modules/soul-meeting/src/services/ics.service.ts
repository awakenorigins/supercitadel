/**
 * SOUL-MEETING 1A — ics.service (zero-dep, tập con RFC5545 đủ cho lời mời họp)
 * VCALENDAR/VEVENT: UID ổn định theo meeting id, DTSTART/DTEND UTC, escape
 * (\\ ; , newline), fold dòng >74 octet, CRLF. Import được vào Google/Outlook/Apple.
 */

type MeetingLike = {
  id: string; title: string; goal?: string | null;
  startAt: Date; endAt: Date; status: string;
  location?: string | null; onlineLink?: string | null;
  createdAt?: Date;
};

const esc = (s: string) => s
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const dtUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Fold dòng dài theo RFC5545: tối đa 75 octet, dòng nối bắt đầu bằng 1 space */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 74) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (curBytes + b > 74) { out.push(cur); cur = ' ' + ch; curBytes = 1 + b; }
    else { cur += ch; curBytes += b; }
  }
  if (cur) out.push(cur);
  return out.join('\r\n');
}

export function buildMeetingIcs(m: MeetingLike): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SuperCitadel//Soul-Meeting 1A//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${m.id}@soul-meeting.supercitadel`,
    `DTSTAMP:${dtUtc(m.createdAt ?? new Date())}`,
    `DTSTART:${dtUtc(m.startAt)}`,
    `DTEND:${dtUtc(m.endAt)}`,
    `SUMMARY:${esc(m.title)}`,
  ];
  if (m.location) lines.push(`LOCATION:${esc(m.location)}`);
  const descParts = [m.goal ?? '', m.onlineLink ? `Link họp: ${m.onlineLink}` : ''].filter(Boolean);
  if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join('\n'))}`);
  if (m.onlineLink) lines.push(`URL:${m.onlineLink}`);
  lines.push(`STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
