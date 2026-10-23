import { expect, test } from '@playwright/test';
import { API_URL, evidenceShot } from './helpers';

test('API down: the "Showing sample data" banner appears and pages still work', async ({ page }, testInfo) => {
  // Make the API unreachable for this browser only (the build points at it; every request fails).
  await page.route(`${API_URL}/**`, (route) => route.abort('connectionrefused'));

  await page.goto('/');
  const banner = page.getByRole('status').filter({ hasText: 'Showing sample data.' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Try again' })).toBeVisible();
  // The saved analysis still gives the headline numbers.
  await expect(page.getByRole('figure', { name: /today 71\.0%.*all five causes fixed 96\.6%/ })).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();

  await evidenceShot(page, testInfo, '10-api-down-sample-data');
});
