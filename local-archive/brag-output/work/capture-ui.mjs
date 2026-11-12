// Capture clean, real UI panels from the running app (http://localhost:5173) for the video.
import { launch } from './cdp.mjs';

const APP = 'http://localhost:5173';
const OUT = new URL('./ui/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const page = await launch({ width: 1440, height: 1000, scale: 2 });

const rectOf = (expr) => page.eval(`(() => { const el = ${expr}; if (!el) return null;
  el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
const panelWith = (text) => `[...document.querySelectorAll('.panel')].find(p => p.innerText.includes(${JSON.stringify(text)}))`;

async function capture(name, expr) {
  const r = await rectOf(expr);
  if (!r) throw new Error(`not found: ${name}`);
  await new Promise((s) => setTimeout(s, 400));
  await page.shot(`${OUT}${name}.png`, r);
  console.log('captured', name, Math.round(r.width), 'x', Math.round(r.height));
}

// Charts: let Recharts finish its entry animation.
await page.goto(`${APP}/why-late`, 3500);
await capture('why-late-chart', panelWith('From 71% today'));
await page.goto(`${APP}/vendor`, 3500);
await capture('vendor-chart', panelWith('The vendor alone stays far below the benchmark'));

// Order desk: run M01 live, then capture each trace step on its own.
await page.goto(`${APP}/order-desk`, 2500);
await page.eval(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Run DeliveryLens on this email')).click()`);
await page.waitFor(`document.querySelectorAll('[data-testid=trace-step]').length >= 10`, 150000);
await page.eval(`(() => { const s = document.createElement('style');
  s.textContent = '[data-testid=trace-step] button[aria-expanded=false]{display:none!important}'; document.head.appendChild(s); })()`);
for (const key of ['extract', 'identify_client', 'address_check', 'promise_check', 'stock_check', 'carrier_choice', 'decision', 'client_message']) {
  await capture(`step-${key}`, `document.querySelector('[data-testid=trace-step][data-key=${key}]')`);
}
await page.eval(`document.querySelector('[data-testid=trace-step][data-key=carrier_choice] button[aria-expanded]').click()`);
await capture('step-carrier_choice-open', `document.querySelector('[data-testid=trace-step][data-key=carrier_choice]')`);
await page.close();
