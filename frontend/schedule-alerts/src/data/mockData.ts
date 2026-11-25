import type { CollectionRule, Panchayat, Ward, WasteType } from '../types';
import { fromISO } from '../lib/date';

const ward = (id: string, name: string, panchayatId: string): Ward => ({
  id,
  name,
  panchayatId,
  code: id.toUpperCase(),
});

export const PANCHAYATS: Panchayat[] = [
  {
    id: 'kdm',
    name: 'Kadinamkulam Grama Panchayat',
    district: 'Thiruvananthapuram',
    wards: [
      ward('kdm-01', 'Kadinamkulam', 'kdm'),
      ward('kdm-02', 'Puthiyathura', 'kdm'),
      ward('kdm-03', 'Perumathura', 'kdm'),
      ward('kdm-04', 'Anjuthengu', 'kdm'),
      ward('kdm-05', 'Vakkom', 'kdm'),
      ward('kdm-06', 'Alamcode', 'kdm'),
    ],
  },
  {
    id: 'vka',
    name: 'Varkala Grama Panchayat',
    district: 'Thiruvananthapuram',
    wards: [
      ward('vka-01', 'Varkala Town', 'vka'),
      ward('vka-02', 'Edava', 'vka'),
      ward('vka-03', 'Kappil', 'vka'),
      ward('vka-04', 'Odayam', 'vka'),
      ward('vka-05', 'Janathipuram', 'vka'),
      ward('vka-06', 'Akkattuvila', 'vka'),
    ],
  },
  {
    id: 'nmd',
    name: 'Nedumangad Grama Panchayat',
    district: 'Thiruvananthapuram',
    wards: [
      ward('nmd-01', 'Nedumangad Town', 'nmd'),
      ward('nmd-02', 'Pananchora', 'nmd'),
      ward('nmd-03', 'Karankode', 'nmd'),
      ward('nmd-04', 'Palode', 'nmd'),
      ward('nmd-05', 'Vithura', 'nmd'),
    ],
  },
];

export const ALL_WARDS: Ward[] = PANCHAYATS.flatMap((p) => p.wards);

export const WARD_BY_ID = new Map(ALL_WARDS.map((w) => [w.id, w]));
export const PANCHAYAT_BY_ID = new Map(PANCHAYATS.map((p) => [p.id, p]));

const ANCHOR_MONDAY = '2026-01-05';

function makeRule(
  id: string,
  wardId: string,
  wasteTypes: WasteType[],
  weekdays: number[],
  startTime: string,
  endTime: string,
  crew: string,
  options: {
    intervalWeeks?: number;
    monthWeeks?: number[];
    notes?: string;
  } = {},
): CollectionRule {
  return {
    id,
    wardId,
    wasteTypes,
    weekdays,
    intervalWeeks: options.intervalWeeks ?? 1,
    monthWeeks: options.monthWeeks,
    anchorDate: ANCHOR_MONDAY,
    startTime,
    endTime,
    crew,
    active: true,
    notes: options.notes,
  };
}

const KDM_CREW = 'HKS Unit 4 · Kadinamkulam';
const VKA_CREW = 'HKS Unit 7 · Varkala';
const NMD_CREW = 'HKS Unit 2 · Nedumangad';

export const COLLECTION_RULES: CollectionRule[] = [
  // Kadinamkulam
  makeRule('kdm-01-gen', 'kdm-01', ['general'], [1, 4], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-01-org', 'kdm-01', ['organic'], [2, 5], '07:30', '09:30', KDM_CREW, {
    notes: 'Separate wet waste in green bins.',
  }),
  makeRule('kdm-01-pla', 'kdm-01', ['plastic'], [3], '08:00', '10:00', KDM_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('kdm-01-ewa', 'kdm-01', ['ewaste'], [6], '09:00', '11:00', 'HKS E-waste Cell', {
    monthWeeks: [1],
    notes: 'Doorstep e-waste collection at the ward office.',
  }),
  makeRule('kdm-02-gen', 'kdm-02', ['general'], [2, 5], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-02-org', 'kdm-02', ['organic'], [1, 3, 6], '07:30', '09:30', KDM_CREW),
  makeRule('kdm-02-pla', 'kdm-02', ['plastic'], [4], '08:00', '10:00', KDM_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('kdm-02-san', 'kdm-02', ['sanitary'], [6], '08:00', '09:30', KDM_CREW, {
    monthWeeks: [4],
  }),
  makeRule('kdm-03-gen', 'kdm-03', ['general'], [1, 4], '06:30', '08:30', KDM_CREW),
  makeRule('kdm-03-org', 'kdm-03', ['organic'], [2, 5], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-03-pla', 'kdm-03', ['plastic'], [6], '08:00', '10:00', KDM_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('kdm-04-gen', 'kdm-04', ['general'], [3, 6], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-04-org', 'kdm-04', ['organic'], [1, 4], '07:30', '09:30', KDM_CREW),
  makeRule('kdm-04-haz', 'kdm-04', ['hazardous'], [0], '09:00', '11:00', 'HKS Hazardous Waste Cell', {
    monthWeeks: [2],
    notes: 'Paint, solvent and pesticide containers accepted.',
  }),
  makeRule('kdm-05-gen', 'kdm-05', ['general'], [2, 5], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-05-org', 'kdm-05', ['organic'], [3, 6], '07:30', '09:30', KDM_CREW),
  makeRule('kdm-06-gen', 'kdm-06', ['general'], [1, 4], '07:00', '09:00', KDM_CREW),
  makeRule('kdm-06-org', 'kdm-06', ['organic'], [2, 5], '07:30', '09:30', KDM_CREW),
  makeRule('kdm-06-pla', 'kdm-06', ['plastic'], [3], '08:00', '10:00', KDM_CREW, {
    intervalWeeks: 2,
  }),

  // Varkala
  makeRule('vka-01-gen', 'vka-01', ['general'], [1, 4], '06:30', '08:30', VKA_CREW),
  makeRule('vka-01-org', 'vka-01', ['organic'], [3, 6], '07:00', '09:00', VKA_CREW),
  makeRule('vka-01-pla', 'vka-01', ['plastic'], [2], '08:00', '10:00', VKA_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('vka-01-ewa', 'vka-01', ['ewaste'], [0], '09:00', '11:00', 'HKS E-waste Cell', {
    monthWeeks: [1],
  }),
  makeRule('vka-02-gen', 'vka-02', ['general'], [2, 5], '07:00', '09:00', VKA_CREW),
  makeRule('vka-02-org', 'vka-02', ['organic'], [1, 4], '07:30', '09:30', VKA_CREW),
  makeRule('vka-03-gen', 'vka-03', ['general'], [3, 6], '07:00', '09:00', VKA_CREW),
  makeRule('vka-03-org', 'vka-03', ['organic'], [2, 5], '07:30', '09:30', VKA_CREW),
  makeRule('vka-03-san', 'vka-03', ['sanitary'], [6], '08:00', '09:30', VKA_CREW, {
    monthWeeks: [3],
  }),
  makeRule('vka-04-gen', 'vka-04', ['general'], [1, 4], '06:30', '08:30', VKA_CREW),
  makeRule('vka-04-org', 'vka-04', ['organic'], [3, 6], '07:00', '09:00', VKA_CREW),
  makeRule('vka-05-gen', 'vka-05', ['general'], [2, 5], '07:00', '09:00', VKA_CREW),
  makeRule('vka-05-org', 'vka-05', ['organic'], [1, 4], '07:30', '09:30', VKA_CREW),
  makeRule('vka-05-pla', 'vka-05', ['plastic'], [3], '08:00', '10:00', VKA_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('vka-06-gen', 'vka-06', ['general'], [1, 4], '07:00', '09:00', VKA_CREW),
  makeRule('vka-06-org', 'vka-06', ['organic'], [2, 5], '07:30', '09:30', VKA_CREW),

  // Nedumangad
  makeRule('nmd-01-gen', 'nmd-01', ['general'], [1, 4], '07:00', '09:00', NMD_CREW),
  makeRule('nmd-01-org', 'nmd-01', ['organic'], [2, 5], '07:30', '09:30', NMD_CREW),
  makeRule('nmd-01-pla', 'nmd-01', ['plastic'], [3], '08:00', '10:00', NMD_CREW, {
    intervalWeeks: 2,
  }),
  makeRule('nmd-02-gen', 'nmd-02', ['general'], [2, 5], '07:00', '09:00', NMD_CREW),
  makeRule('nmd-02-org', 'nmd-02', ['organic'], [3, 6], '07:30', '09:30', NMD_CREW),
  makeRule('nmd-02-haz', 'nmd-02', ['hazardous'], [1], '09:00', '11:00', 'HKS Hazardous Waste Cell', {
    monthWeeks: [1],
  }),
  makeRule('nmd-03-gen', 'nmd-03', ['general'], [1, 4], '06:30', '08:30', NMD_CREW),
  makeRule('nmd-03-org', 'nmd-03', ['organic'], [2, 5], '07:00', '09:00', NMD_CREW),
  makeRule('nmd-04-gen', 'nmd-04', ['general'], [3, 6], '07:00', '09:00', NMD_CREW),
  makeRule('nmd-04-org', 'nmd-04', ['organic'], [1, 4], '07:30', '09:30', NMD_CREW),
  makeRule('nmd-05-gen', 'nmd-05', ['general'], [2, 5], '07:00', '09:00', NMD_CREW),
  makeRule('nmd-05-org', 'nmd-05', ['organic'], [3, 6], '07:30', '09:30', NMD_CREW),
];

/** Fixed public holidays observed across the project area. */
export function holidayReason(iso: string): string | undefined {
  const date = fromISO(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  // Onam is a two-day holiday in most panchayats.
  if (month === 8 && (day === 26 || day === 27)) return 'Onam holiday';
  if (month === 5 && day === 1) return 'Labour Day';
  if (month === 8 && day === 15) return 'Independence Day';
  if (month === 10 && day === 2) return 'Gandhi Jayanti';
  if (month === 12 && day === 25) return 'Christmas';
  if (month === 1 && day === 1) return 'New Year';
  if (year % 4 === 0 && month === 4 && day === 14) return 'Vishu';
  return undefined;
}
