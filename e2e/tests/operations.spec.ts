import { expect, test } from '@playwright/test';
import { evidenceShot, expectLiveData } from './helpers';

test('carriers heatmap renders with a recommended carrier per region', async ({ page }, testInfo) => {
  await page.goto('/carriers');
  const heat = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Where each carrier delivers on time' }) });
  const table = heat.getByRole('table');
  await expect(table).toBeVisible();
  // Column headers are exposed to assistive tech (scope="col"), so each cell is announced with its carrier.
  await expect(table.getByRole('columnheader', { name: 'Recommended' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Carrier A' })).toBeVisible();

  const regionRows = table.locator('tbody tr');
  const count = await regionRows.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const row = regionRows.nth(i);
    // Every region names a recommended carrier, and that carrier's cell is marked as recommended.
    await expect(row.locator('td').last()).toContainText(/Carrier \w+ instead of \w+/);
    await expect(row.getByText('(recommended)')).toHaveCount(1);
  }
  await expect(page.getByRole('heading', { name: 'Carrier scorecard' })).toBeVisible();

  await expectLiveData(page);
  await evidenceShot(page, testInfo, '05-carriers-heatmap');
});
