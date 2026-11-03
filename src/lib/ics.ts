const esc = (s: string) => s.replace(/[\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
const dt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function icsEvent(o: { uid: string; start: string; end: string; title: string; description: string; lat: number; lng: number; location: string }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lumen Photo Atlas//Planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${o.uid}`, `DTSTAMP:${dt(new Date().toISOString())}`, `DTSTART:${dt(o.start)}`, `DTEND:${dt(o.end)}`,
    `SUMMARY:${esc(o.title)}`, `DESCRIPTION:${esc(o.description)}`, `LOCATION:${esc(o.location)}`, `GEO:${o.lat.toFixed(6)};${o.lng.toFixed(6)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(o.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
