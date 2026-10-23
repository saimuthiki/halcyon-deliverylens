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
  await expect(page.getByRole('figure', { name: /today 71\.0%.*all five fixes, realistic 90\.2%; ceiling if every cause were fully removed 99\.0%/ })).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();

  await evidenceShot(page, testInfo, '10-api-down-sample-data');

  // Every agent result says it is a sample, not only the global banner.
  await page.goto('/ask');
  await page.getByRole('button', { name: 'What is the biggest cause of late deliveries?' }).click();
  const answer = page.getByRole('listitem').filter({ hasText: 'DeliveryLens:' }).first();
  await expect(answer.getByText('Sample response — API offline.')).toBeVisible();

  await page.goto('/order-intake');
  await page.getByRole('button', { name: 'Check this order' }).click();
  await expect(page.getByRole('region', { name: 'Agent result' }).getByText('Sample response — API offline.')).toBeVisible();

  // The new page works from the saved analysis too.
  await page.goto('/stock-routes');
  await expect(page.getByRole('table', { name: 'Stock-outs by warehouse' }).locator('tbody tr')).toHaveCount(5);
});
