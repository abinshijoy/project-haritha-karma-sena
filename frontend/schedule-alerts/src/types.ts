export type WasteType =
  | 'general'
  | 'organic'
  | 'plastic'
  | 'ewaste'
  | 'hazardous'
  | 'sanitary';

export type CollectionStatus =
  | 'scheduled'
  | 'in-progress'
  | 'completed'
  | 'holiday';

export type AlertChannel = 'push' | 'sms';

export type ViewMode = 'month' | 'agenda';

export interface Ward {
  id: string;
  name: string;
  code: string;
  panchayatId: string;
}

export interface Panchayat {
  id: string;
  name: string;
  district: string;
  wards: Ward[];
}

/** A recurring pickup pattern. Occurrences are expanded into CollectionEvents. */
export interface CollectionRule {
  id: string;
  wardId: string;
  wasteTypes: WasteType[];
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
  /** 1 = every week, 2 = alternate weeks (measured from anchorDate) */
  intervalWeeks: number;
  /** When set, only these nth weekdays of the month are collected (1–5). */
  monthWeeks?: number[];
  anchorDate: string;
  startTime: string;
  endTime: string;
  crew: string;
  active: boolean;
  notes?: string;
}

export interface CollectionEvent {
  id: string;
  ruleId: string;
  wardId: string;
  panchayatId: string;
  /** Local calendar date, YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  wasteTypes: WasteType[];
  crew: string;
  status: CollectionStatus;
  notes?: string;
}

export interface AlertSettings {
  enabled: boolean;
  channels: Record<AlertChannel, boolean>;
  phone: string;
  /** Minutes before the pickup window starts. */
  leadMinutes: number;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  /** Empty means all waste types. */
  wasteTypes: WasteType[];
  /** Wards the resident has subscribed to. */
  wards: string[];
  /** If the lead time has already passed, remind at once on pickup day. */
  reminderOnDay: boolean;
}

export interface ScheduledAlert {
  id: string;
  eventId: string;
  wardId: string;
  wardName: string;
  panchayatName: string;
  date: string;
  sendAt: Date;
  channel: AlertChannel;
  title: string;
  body: string;
  delayedForQuietHours: boolean;
}

export interface NotificationLogEntry {
  id: string;
  at: string;
  channel: AlertChannel | 'test';
  title: string;
  body: string;
  kind: 'test' | 'scheduled' | 'info';
}

export interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'warning' | 'info';
}
