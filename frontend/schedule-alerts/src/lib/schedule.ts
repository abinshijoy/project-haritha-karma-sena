import { WARD_BY_ID, holidayReason } from '../data/mockData';
import type { CollectionEvent, CollectionRule, CollectionStatus } from '../types';
import {
  addDays,
  diffDays,
  minutesFromMidnight,
  nthWeekdayOfMonth,
  toISO,
} from './date';

function matchesRule(rule: CollectionRule, date: Date): boolean {
  if (!rule.weekdays.includes(date.getDay())) return false;

  if (rule.monthWeeks?.length) {
    return rule.monthWeeks.includes(nthWeekdayOfMonth(date));
  }

  const weeksSinceAnchor = Math.floor(diffDays(rule.anchorDate, date) / 7);
  return ((weeksSinceAnchor % rule.intervalWeeks) + rule.intervalWeeks) % rule.intervalWeeks === 0;
}

function statusFor(dateISO: string, startTime: string, now: Date): CollectionStatus {
  const holiday = holidayReason(dateISO);
  if (holiday) return 'holiday';

  const delta = diffDays(now, dateISO);
  if (delta < 0) return 'completed';
  if (delta > 0) return 'scheduled';
  return minutesFromMidnight(startTime) <= now.getHours() * 60 + now.getMinutes()
    ? 'in-progress'
    : 'scheduled';
}

/** Expand recurring rules into concrete pickups across [from, to]. */
export function buildEvents(
  rules: CollectionRule[],
  from: Date,
  to: Date,
  now: Date = new Date(),
): CollectionEvent[] {
  const events: CollectionEvent[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    const panchayatId = WARD_BY_ID.get(rule.wardId)?.panchayatId;
    if (!panchayatId) continue;

    for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
      if (!matchesRule(rule, cursor)) continue;

      const date = toISO(cursor);
      const note = holidayReason(date);
      events.push({
        id: `${rule.id}::${date}`,
        ruleId: rule.id,
        wardId: rule.wardId,
        panchayatId,
        date,
        startTime: rule.startTime,
        endTime: rule.endTime,
        wasteTypes: rule.wasteTypes,
        crew: rule.crew,
        status: statusFor(date, rule.startTime, now),
        notes: note ?? rule.notes,
      });
    }
  }

  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.wardId.localeCompare(b.wardId),
  );
}

export function groupEventsByDate(events: CollectionEvent[]): Map<string, CollectionEvent[]> {
  const grouped = new Map<string, CollectionEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.date);
    if (list) list.push(event);
    else grouped.set(event.date, [event]);
  }
  return grouped;
}
