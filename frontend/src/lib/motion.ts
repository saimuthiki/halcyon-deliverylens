import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Shared motion helpers. Every animation in the app goes through these so it can be switched off for
 * visitors who asked their system for less motion (prefers-reduced-motion).
 */

/** Natural deceleration for arrivals (DESIGN.md: no bounce or elastic curves). */
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function queryReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** True when the visitor prefers reduced motion; follows changes to the setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(queryReduced);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Whether the element is on screen. With `once`, it stays true after the first time it is seen
 * (for entrance animations); without, it follows visibility (to pause loops that are off screen).
 * Without IntersectionObserver (tests, old browsers) it reports visible, so nothing stays hidden.
 */
export function useInView<T extends Element>(ref: RefObject<T>, { once = true, threshold = 0.25 } = {}): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined' || import.meta.env.MODE === 'test');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          if (once) io.disconnect();
        } else if (!once) setSeen(false);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold]);
  return seen;
}

/**
 * Counts from 0 (or the previous value) to `target` over `ms` with an ease-out, once `start` is true.
 * Later changes to `target` roll smoothly from the current value. Reduced motion jumps straight there.
 */
export function useCountUp(target: number, { ms = 900, start = true }: { ms?: number; start?: boolean } = {}): number {
  // Unit tests read the final numbers straight away.
  const instant = useReducedMotion() || import.meta.env.MODE === 'test';
  const [value, setValue] = useState(instant ? target : 0);
  const from = useRef(value);
  useEffect(() => {
    if (!start) return;
    if (instant || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setValue(target);
      return;
    }
    const begin = from.current;
    let t0: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      // Time from the first frame, clamped: frame timestamps can lag the moment the effect ran.
      if (t0 === null) t0 = now;
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      const eased = 1 - Math.pow(1 - p, 4);
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, start, instant]);
  return value;
}
