/** Formatting helpers. Rates are fractions (0.71), points are percentage points (6.8). */

export function pct(rate: number | null | undefined, digits = 1): string {
  if (rate == null || Number.isNaN(rate)) return '–';
  return `${(rate * 100).toFixed(digits)}%`;
}

export function pts(points: number | null | undefined, digits = 1): string {
  if (points == null || Number.isNaN(points)) return '–';
  const sign = points > 0 ? '+' : points < 0 ? '−' : '';
  return `${sign}${Math.abs(points).toFixed(digits)} pts`;
}

export function usd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '–';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(value / 1000)}K`;
  if (abs >= 1_000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function usdFull(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '–';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function num(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '–';
  return Math.round(value).toLocaleString('en-US');
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '–';
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return value;
  const hasTime = value.length > 10;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    timeZone: 'UTC',
  });
}
