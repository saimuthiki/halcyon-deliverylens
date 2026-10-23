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

test('stock & routes: stock-outs by warehouse, worst clients and route deviation by carrier and region', async ({ page }, testInfo) => {
  const stock = page.waitForResponse((r) => r.url().includes('/api/stock/placement'));
  const routes = page.waitForResponse((r) => r.url().includes('/api/routes/deviation'));
  await page.goto('/overview');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stock & routes' }).click();
  await expect(page).toHaveURL(/\/stock-routes$/);
  expect((await stock).status()).toBe(200);
  expect((await routes).status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1, name: /Stock-outs and long routes happen everywhere/ })).toBeVisible();

  // Five warehouses W1-W5, each with a stock-out rate and on time with vs without stock.
  const wh = page.getByRole('table', { name: 'Stock-outs by warehouse' });
  await expect(wh.locator('tbody tr')).toHaveCount(5);
  for (const id of ['W1', 'W2', 'W3', 'W4', 'W5']) await expect(wh.getByText(new RegExp(`^${id},`))).toBeVisible();
  for (const h of ['Stock-out rate', 'On time, stock-out', 'On time, stocked']) await expect(wh.getByRole('columnheader', { name: h })).toBeVisible();
  // Every rate is a percentage, and stock-outs are worse than stocked in every warehouse.
  const rows = wh.locator('tbody tr');
  for (let i = 0; i < 5; i++) {
    const cells = rows.nth(i).getByRole('cell');
    const pctOf = async (n: number) => Number(/([\d.]+)%/.exec((await cells.nth(n).textContent()) ?? '')?.[1]);
    expect(await pctOf(1)).toBeGreaterThan(0); // stock-out rate
    expect(await pctOf(2)).toBeLessThan(await pctOf(3)); // on time with stock-out < stocked
  }

  const clients = page.getByRole('table', { name: 'Clients hit hardest by stock-outs' }).locator('tbody tr');
  expect(await clients.count()).toBeGreaterThanOrEqual(1);
  expect(await clients.count()).toBeLessThanOrEqual(10);

  const byCarrier = page.getByRole('table', { name: 'By carrier' });
  await expect(byCarrier.locator('tbody tr')).toHaveCount(6);
  for (const c of ['A', 'B', 'C', 'D', 'E', 'F']) await expect(byCarrier.getByRole('rowheader', { name: `Carrier ${c}` })).toBeVisible();
  await expect(byCarrier.getByRole('columnheader', { name: 'No route record' })).toBeVisible();

  const byRegion = page.getByRole('table', { name: 'By destination region' });
  await expect(byRegion.locator('tbody tr')).toHaveCount(4);
  for (const r of ['Midwest', 'Northeast', 'Southeast', 'West']) await expect(byRegion.getByRole('rowheader', { name: r, exact: true })).toBeVisible();

  await expect(page.getByText('This section could not load.')).toHaveCount(0);
  await expectLiveData(page);
  await evidenceShot(page, testInfo, '05b-stock-and-routes');
});
