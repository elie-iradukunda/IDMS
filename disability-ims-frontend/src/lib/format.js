// Relative "time ago" formatting for timelines, notifications and the audit log.
// The API returns ISO timestamps (createdAt); the UI shows them human-readably.
export function timeAgo(input, lang = 'en') {
  if (!input) return '';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  const rw = lang === 'rw';
  if (secs < 45) return rw ? 'ubu' : 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return rw ? `iminota ${mins} ishize` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return rw ? `amasaha ${hrs} ashize` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return rw ? `iminsi ${days} ishize` : `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return rw ? `ibyumweru ${weeks} bishize` : `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return rw ? `amezi ${months} ashize` : `${months}mo ago`;
  return new Date(then).toLocaleDateString();
}

// Whole days from today until a YYYY-MM-DD closing date; negative once it has
// passed, null when there is no date. A deadline day counts as still open, so
// "closes today" is a warning rather than a refusal.
export function daysUntil(dateOnly) {
  if (!dateOnly) return null;
  const end = new Date(`${dateOnly}T23:59:59`).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 864e5) - 1;
}

// First name / short label helper (e.g. "Mukamana Alice" → "Alice").
export function shortName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[1] : parts[0] || '';
}
