// node render.mjs stills 1.2 4.8 ...   -> work/stills/t-<time>.jpg
// node render.mjs frames               -> work/frames/f-00000.jpg ... (30 fps)
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { launch } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const [mode, ...times] = process.argv.slice(2);
const page = await launch({ width: 1920, height: 1080, port: 9334 });
await page.goto(pathToFileURL(join(HERE, 'video.html')).href, 500);
await page.eval('window.ready.then(() => true)');
const duration = await page.eval('window.DURATION');

async function frame(t, path) {
  await page.eval(`render(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await page.shot(path);
}

if (mode === 'stills') {
  mkdirSync(join(HERE, 'stills'), { recursive: true });
  for (const t of times) await frame(Number(t), join(HERE, 'stills', `t-${t}.jpg`));
  console.log('stills', times.length);
} else {
  mkdirSync(join(HERE, 'frames'), { recursive: true });
  const n = Math.round(duration * FPS);
  for (let i = 0; i < n; i++) {
    await frame(i / FPS, join(HERE, 'frames', `f-${String(i).padStart(5, '0')}.jpg`));
    if (i % 90 === 0) console.log(`frame ${i}/${n}`);
  }
  console.log('frames', n);
}
await page.close();
