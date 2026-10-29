import { useRef } from 'react';
import { useCountUp } from '../lib/motion';

/**
 * Rolls to `target` whenever it changes, but starts on it (no count from zero on first render).
 * Built on useCountUp by animating only the change since mount, so reduced motion and tests stay instant.
 */
export function useRolling(target: number, ms = 400): number {
  const base = useRef(target).current;
  return base + useCountUp(target - base, { ms });
}

/**
 * Money formatter that keeps the unit of the final figure while counting ($0.0M → $14.2M rather than
 * $0 → $523 → $45K → $14.2M). Matches `usd` from lib/format for the final value.
 */
export function usdIn(target: number): (v: number) => string {
  const abs = Math.abs(target);
  if (abs >= 1_000_000) return (v) => `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return (v) => `$${Math.round(v / 1000)}K`;
  if (abs >= 1_000) return (v) => `$${(v / 1000).toFixed(1)}K`;
  return (v) => `$${Math.round(v).toLocaleString('en-US')}`;
}

/**
 * A number that counts up from zero when the page opens. Once finished it shows exactly `format(value)`,
 * so the text is identical to the static version. `during` formats the in-between values when the final
 * formatter would jump between units.
 */
export default function CountUp({
  value,
  format,
  during,
  ms = 900,
  start = true,
  className,
}: {
  value: number;
  format: (v: number) => string;
  during?: (v: number) => string;
  ms?: number;
  start?: boolean;
  className?: string;
}) {
  const v = useCountUp(value, { ms, start });
  const text = v === value ? format(value) : (during ?? format)(v);
  return <span className={className}>{text}</span>;
}
