# Haritha Karma Sena — Collection Schedule & Notifications

A self-contained React + TypeScript app for the **Collection Schedule & Notifications** feature
(`feature/schedule-alerts`). It shows exact waste pickup dates, lets residents narrow them by
panchayat and ward, and plans push/SMS reminders ahead of each pickup.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
```

No API keys or external services are required. All data is local mock data and preferences are
stored in `localStorage`.

## What is included

- **Month calendar** with exact dates, time windows, waste-type chips, holiday markers and a
  day-detail dialog listing every pickup for that date.
- **Agenda view** for the next 30 days, grouped by date, with one-tap ward alert subscription.
- **Filters** for panchayat, ward, waste type, status and free-text search (ward, crew, notes,
  waste type). Filter results update both views.
- **Alert preferences**: master switch, push and SMS channels, Indian mobile-number validation,
  lead time (1 hour – 2 days), quiet hours, waste-type selection and per-ward subscriptions.
- **Upcoming alerts**: the next deliveries computed from each exact pickup start time, including
  quiet-hour deferral and a channel label. A test button writes a delivery-log entry and fires a
  real browser notification when permission has been granted.
- **Persistence**: alert settings and delivery log survive reloads.

## Domain model

| Concept | Meaning |
| --- | --- |
| `Panchayat` | Local body with a list of `Ward`s (Kadinamkulam, Varkala, Nedumangad) |
| `CollectionRule` | Recurring pickup pattern: weekdays, weekly/alternate-week or nth-weekday-of-month, time window, crew, waste types |
| `CollectionEvent` | Concrete occurrence of a rule on an exact `YYYY-MM-DD` date with a computed status |
| `AlertSettings` | Resident's channel, timing and subscription choices |
| `ScheduledAlert` | A planned delivery at `pickupStart - leadMinutes`, shifted out of quiet hours if needed |

Recurring rules live in `src/data/mockData.ts`; expansion and status logic live in
`src/lib/schedule.ts`; reminder derivation lives in `src/lib/alerts.ts`. A pickup on a public
holiday is marked `holiday` and never generates a reminder.

## Wiring real services

The UI is deliberately decoupled from delivery. To connect real providers:

1. Replace the mock collections in `src/data/mockData.ts` with API responses that satisfy the
   `CollectionRule` / `Ward` types, or have the server return `CollectionEvent[]` directly and skip
   `buildEvents`.
2. In `src/App.tsx`, send the entries produced by `sendTestAlert` and `buildUpcomingAlerts` to a
   scheduler (e.g. an SMS provider such as Twilio and a Web Push service worker). Keep
   `isValidIndianMobile` on both client and server.
3. Request notification permission from a service worker for background push; the current
   `enablePush` flow only covers foreground notifications.

## Project layout

```
src/
  App.tsx                  state, filtering, orchestration
  types.ts                 shared domain types
  data/mockData.ts         panchayats, wards, recurring rules, holidays
  lib/date.ts              timezone-safe local-date helpers
  lib/schedule.ts          rule → exact event expansion
  lib/alerts.ts            reminder scheduling and validation
  hooks/useLocalStorage.ts persisted preferences
  components/              calendar, agenda, filters, alerts, dialogs, toasts
```
