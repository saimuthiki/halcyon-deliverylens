import type { CauseKey } from '../api/types';

export interface CauseMeta {
  key: CauseKey;
  short: string;
  owner: 'process' | 'routing';
  fix: string;
}

/** Display metadata for the five causes. Order = order shown in the waterfall. */
export const CAUSE_META: Record<CauseKey, CauseMeta> = {
  incomplete_address: {
    key: 'incomplete_address',
    short: 'Incomplete address',
    owner: 'process',
    fix: 'Order intake agent checks the address before the order reaches the pick list and asks the client for missing fields.',
  },
  same_day_after_cutoff: {
    key: 'same_day_after_cutoff',
    short: 'Same-day order after 08:00',
    owner: 'process',
    fix: 'Flag same-day orders received after the 08:00 pick-list cutoff at intake and agree a realistic date with the client.',
  },
  weak_carrier_lane: {
    key: 'weak_carrier_lane',
    short: 'Weak carrier on lane',
    owner: 'routing',
    fix: 'Move volume on weak lanes to the best carrier for that region using the carrier scorecard.',
  },
  stock_not_at_nearest: {
    key: 'stock_not_at_nearest',
    short: 'Stock not at nearest warehouse',
    owner: 'process',
    fix: 'Rebalance fast-moving stock to the warehouse nearest each region before it runs out.',
  },
  route_deviation: {
    key: 'route_deviation',
    short: 'Route deviation',
    owner: 'routing',
    fix: 'Alert dispatch when a driver goes more than 20% beyond the planned route.',
  },
};

export const CAUSE_ORDER: CauseKey[] = [
  'incomplete_address',
  'weak_carrier_lane',
  'same_day_after_cutoff',
  'stock_not_at_nearest',
  'route_deviation',
];

export function causeShort(key: string): string {
  return (CAUSE_META as Record<string, CauseMeta>)[key]?.short ?? key.replace(/_/g, ' ');
}

export const BENCHMARK = 0.94;
