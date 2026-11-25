import type { AlertSettings, CollectionStatus, WasteType } from '../types';

interface WasteTypeMeta {
  label: string;
  short: string;
  color: string;
  tint: string;
}

export const WASTE_TYPES: Record<WasteType, WasteTypeMeta> = {
  general: {
    label: 'General waste',
    short: 'General',
    color: '#2563eb',
    tint: '#dbeafe',
  },
  organic: {
    label: 'Organic / wet waste',
    short: 'Organic',
    color: '#15803d',
    tint: '#dcfce7',
  },
  plastic: {
    label: 'Plastic waste',
    short: 'Plastic',
    color: '#c2410c',
    tint: '#ffedd5',
  },
  ewaste: {
    label: 'E-waste',
    short: 'E-waste',
    color: '#7c3aed',
    tint: '#ede9fe',
  },
  hazardous: {
    label: 'Household hazardous waste',
    short: 'Hazardous',
    color: '#be123c',
    tint: '#ffe4e6',
  },
  sanitary: {
    label: 'Sanitary waste',
    short: 'Sanitary',
    color: '#0f766e',
    tint: '#ccfbf1',
  },
};

export const WASTE_TYPE_KEYS = Object.keys(WASTE_TYPES) as WasteType[];

export const STATUS_LABELS: Record<CollectionStatus, string> = {
  scheduled: 'Scheduled',
  'in-progress': 'On route',
  completed: 'Completed',
  holiday: 'Holiday — no pickup',
};

export const LEAD_TIME_OPTIONS = [
  { value: 60, label: '1 hour before' },
  { value: 180, label: '3 hours before' },
  { value: 360, label: '6 hours before' },
  { value: 720, label: '12 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
];

export const DEFAULT_SETTINGS: AlertSettings = {
  enabled: true,
  channels: { push: true, sms: false },
  phone: '',
  leadMinutes: 720,
  quietHours: { enabled: true, start: '21:00', end: '06:00' },
  wasteTypes: [],
  wards: ['kdm-01', 'kdm-02', 'vka-01'],
  reminderOnDay: true,
};

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
