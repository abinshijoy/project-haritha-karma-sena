import { PANCHAYAT_BY_ID, WARD_BY_ID } from '../data/mockData';
import type { AlertSettings, CollectionEvent, ScheduledAlert } from '../types';
import { WASTE_TYPES } from './constants';
import {
  addDays,
  diffDays,
  formatMediumDate,
  formatTime,
  minutesFromMidnight,
  withTime,
} from './date';

const LOOKAHEAD_DAYS = 14;
const MAX_ALERTS = 12;

function isInQuietHours(date: Date, settings: AlertSettings): boolean {
  if (!settings.quietHours.enabled) return false;
  const start = minutesFromMidnight(settings.quietHours.start);
  const end = minutesFromMidnight(settings.quietHours.end);
  const now = date.getHours() * 60 + date.getMinutes();
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/** Move a delivery out of quiet hours and report whether it was delayed. */
function applyQuietHours(date: Date, settings: AlertSettings): { date: Date; delayed: boolean } {
  if (!isInQuietHours(date, settings)) return { date, delayed: false };

  const start = minutesFromMidnight(settings.quietHours.start);
  const end = minutesFromMidnight(settings.quietHours.end);
  const result = new Date(date);

  for (let i = 0; i < 3 && isInQuietHours(result, settings); i += 1) {
    // For an overnight window (e.g. 21:00–06:00), a time after the start
    // belongs to tonight and must wait until tomorrow morning.
    const hour = result.getHours() * 60 + result.getMinutes();
    const overnight = start > end;
    const target = overnight && hour >= start ? addDays(result, 1) : result;
    target.setHours(Math.floor(end / 60), end % 60, 0, 0);
    result.setTime(target.getTime());
  }

  return { date: result, delayed: true };
}

function describePickup(event: CollectionEvent, now: Date) {
  const ward = WARD_BY_ID.get(event.wardId);
  const wardName = ward?.name ?? event.wardId;
  const typeLabels = event.wasteTypes.map((t) => WASTE_TYPES[t].label.toLowerCase()).join(' and ');
  const daysAway = diffDays(now, event.date);
  const when =
    daysAway === 0
      ? 'today'
      : daysAway === 1
        ? 'tomorrow'
        : `on ${formatMediumDate(event.date)}`;

  return {
    wardName,
    title: `${wardName}: ${WASTE_TYPES[event.wasteTypes[0]].short} pickup ${when}`,
    body: `${event.crew} will collect ${typeLabels} between ${formatTime(event.startTime)} and ${formatTime(event.endTime)}. Keep bins at the gate by ${formatTime(event.startTime)}.`,
  };
}

/** Derive the notifications that would be delivered for subscribed wards. */
export function buildUpcomingAlerts(
  events: CollectionEvent[],
  settings: AlertSettings,
  now: Date = new Date(),
): ScheduledAlert[] {
  if (!settings.enabled || settings.wards.length === 0) return [];

  const subscribed = new Set(settings.wards);
  const horizon = addDays(now, LOOKAHEAD_DAYS);
  const alerts: ScheduledAlert[] = [];

  for (const event of events) {
    if (!subscribed.has(event.wardId)) continue;
    if (event.status === 'holiday' || event.status === 'completed') continue;

    if (settings.wasteTypes.length > 0) {
      const wanted = settings.wasteTypes.some((type) => event.wasteTypes.includes(type));
      if (!wanted) continue;
    }

    const pickupStart = withTime(event.date, event.startTime);
    if (pickupStart <= now || pickupStart > horizon) continue;

    let sendAt = new Date(pickupStart.getTime() - settings.leadMinutes * 60_000);
    if (sendAt <= now) {
      if (!settings.reminderOnDay) continue;
      sendAt = new Date(now);
    }

    const adjusted = applyQuietHours(sendAt, settings);
    if (adjusted.date > pickupStart) continue;

    const { wardName, title, body } = describePickup(event, now);
    const panchayatName = PANCHAYAT_BY_ID.get(event.panchayatId)?.name ?? 'Panchayat';

    for (const channel of ['push', 'sms'] as const) {
      if (!settings.channels[channel]) continue;
      if (channel === 'sms' && settings.phone.trim().length < 10) continue;

      alerts.push({
        id: `${event.id}::${channel}`,
        eventId: event.id,
        wardId: event.wardId,
        wardName,
        panchayatName,
        date: event.date,
        sendAt: adjusted.date,
        channel,
        title,
        body,
        delayedForQuietHours: adjusted.delayed,
      });
    }
  }

  return alerts.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime()).slice(0, MAX_ALERTS);
}

export function isValidIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value.replace(/[\s-]/g, ''));
}
