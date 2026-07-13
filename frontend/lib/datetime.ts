// The backend serializes UTC timestamps with `datetime.utcnow().isoformat()`,
// which has NO timezone marker (e.g. "2026-07-13T18:05:00"). The browser's
// `new Date()` treats such date-time strings as *local* time, corrupting the
// instant before any formatting runs. This normalizes them to real UTC so that
// downstream `toLocaleString(..., { timeZone: "Asia/Kolkata" })` shows correct IST.
export function parseServerDate(value: string): Date {
  // Only date-time strings that lack an explicit zone need the fix.
  // Leave date-only ("2026-07-13") and already-zoned strings untouched.
  if (/\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(value + "Z");
  }
  return new Date(value);
}
