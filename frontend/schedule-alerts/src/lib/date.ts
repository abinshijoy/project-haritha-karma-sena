const pad = (n: number) => String(n).padStart(2, '0');

/** Local-calendar ISO date (never uses toISOString, which shifts by timezone). */
export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse YYYY-MM-DD at local noon so DST transitions cannot change the day. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

/** Monday-based start of week. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

/** Whole-day difference b - a, DST safe. */
export function diffDays(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? fromISO(a) : a;
  const db = typeof b === 'string' ? fromISO(b) : b;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  return diffDays(a, b) === 0;
}

export function minutesFromMidnight(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function withTime(date: Date | string, time: string): Date {
  const d = typeof date === 'string' ? fromISO(date) : new Date(date);
  const [h, m] = time.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${suffix}`;
}

const longFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const mediumFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const monthFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
});

export const formatLongDate = (date: Date | string): string =>
  longFormatter.format(typeof date === 'string' ? fromISO(date) : date);

export const formatMediumDate = (date: Date | string): string =>
  mediumFormatter.format(typeof date === 'string' ? fromISO(date) : date);

export const formatMonth = (date: Date): string => monthFormatter.format(date);

export const formatClock = (date: Date): string => timeFormatter.format(date);

/** "Tomorrow", "Today", "in 3 days" or a medium date. */
export function relativeDayLabel(iso: string, now = new Date()): string {
  const delta = diffDays(now, iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta <= 7) return `In ${delta} days`;
  return formatMediumDate(iso);
}

/** Nth occurrence (1-based) of a weekday within its month. */
export function nthWeekdayOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}
