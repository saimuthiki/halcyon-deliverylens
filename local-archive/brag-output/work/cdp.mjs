// Minimal Chrome DevTools Protocol driver (no npm installs): launch headless Chrome, evaluate, screenshot.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1187\\chrome-win\\chrome.exe`;

export async function launch({ width = 1920, height = 1080, scale = 1, port = 9333 } = {}) {
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--allow-file-access-from-files', `--user-data-dir=${process.env.TEMP}\\brag-chrome-${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });

  const page = {
    send,
    async goto(url, settleMs = 1500) {
      await send('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete"');
      await sleep(settleMs);
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, timeoutMs = 90000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        try { if (await page.eval(`!!(${expr})`)) return; } catch {}
        await sleep(250);
      }
      throw new Error(`timeout waiting for ${expr}`);
    },
    async shot(path, clip) {
      const p = { format: path.endsWith('.jpg') ? 'jpeg' : 'png', captureBeyondViewport: !!clip };
      if (p.format === 'jpeg') p.quality = 92;
      if (clip) p.clip = { ...clip, scale: 1 };
      const r = await send('Page.captureScreenshot', p);
      writeFileSync(path, Buffer.from(r.data, 'base64'));
    },
    async close() { try { await send('Browser.close'); } catch {} ws.close(); proc.kill(); },
  };
  return page;
}
