import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL || 'http://localhost:8000';
export const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'evidence', 'e2e-screenshots');

/** Save a full-page screenshot as evidence and attach it to the test report. */
export async function evidenceShot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/** The app is talking to the live API: no "Showing sample data" banner. */
export async function expectLiveData(page: Page) {
  await expect(page.getByText('Showing sample data.')).toHaveCount(0);
}

/** Collect browser console errors so a test can assert the page ran cleanly. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
