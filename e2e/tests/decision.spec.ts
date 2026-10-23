import { expect, test } from '@playwright/test';
import { evidenceShot, expectLiveData, trackConsoleErrors } from './helpers';

test.describe('The decision pages', () => {
  test('overview shows 71.0% today, 90.2% realistic, the 99.0% ceiling and $14.2M at risk', async ({ page }, testInfo) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/overview');

    await expect(page.getByRole('heading', { level: 1, name: /On-time delivery is 71%\. The benchmark is 94%\./ })).toBeVisible();
    const track = page.getByRole('figure', {
      name: /today 71\.0%; routing vendor only 80\.2%; process fixes only 86\.7%; all five fixes, realistic 90\.2%; ceiling if every cause were fully removed 99\.0%; benchmark 94%/,
    });
    await expect(track).toBeVisible();
    for (const value of ['71.0%', '80.2%', '86.7%', '90.2%', '99.0%']) await expect(track.getByText(value, { exact: true }).first()).toBeVisible();
    await expect(track.getByText('Ceiling, if every cause were fully removed').first()).toBeVisible();
    // The headline is the realistic case; the ceiling is labelled as a ceiling.
    const lede = page.locator('header p').first();
    await expect(lede).toContainText('90.2%');
    await expect(lede).toContainText('99.0% is the ceiling');

    const atRisk = page.locator('dl > div').filter({ hasText: 'Annual revenue at risk' });
    await expect(atRisk.getByText('$14.2M')).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '01-overview');
    expect(errors).toEqual([]);
  });

  test('why-late: waterfall, cause drill-down, delivery drawer and delay alert', async ({ page }, testInfo) => {
    await page.goto('/why-late');

    await expect(page.getByRole('img', { name: /On-time delivery waterfall/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /From 71% today to a ceiling of 99\.0% if every cause were fully removed/ })).toBeVisible();
    await expect(page.getByText(/the realistic outcome is\s*90\.2%/)).toBeVisible();
    // The chart itself draws bars (SVG rectangles), not just an empty frame.
    const bars = page.locator('.recharts-bar-rectangle path');
    await expect(bars.first()).toBeVisible();
    // Start bar + five cause bars + end bar.
    expect(await bars.count()).toBeGreaterThanOrEqual(7);

    // Select a cause from the cause table.
    const causeButton = page.getByRole('button', { name: 'Incomplete address', exact: true });
    await causeButton.click();
    await expect(causeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/cause=incomplete_address/);

    const samples = page.locator('section#samples');
    await expect(samples.getByRole('heading', { name: 'Late deliveries caused by: Incomplete address' })).toBeVisible();
    const firstDelivery = samples.getByRole('button', { name: /^D\d+$/ }).first();
    await expect(firstDelivery).toBeVisible();
    const deliveryId = (await firstDelivery.textContent())!.trim();

    // Open the delivery: timeline and explanation appear in the drawer.
    await firstDelivery.click();
    const drawer = page.getByRole('dialog', { name: `Delivery ${deliveryId}` });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Why it was late' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'What happened' })).toBeVisible();
    await expect(drawer.getByRole('listitem').first()).toBeVisible();
    expect(await drawer.locator('ol > li').count()).toBeGreaterThanOrEqual(3);

    // Draft the delay alert through the agent.
    const alertResponse = page.waitForResponse((r) => r.url().includes('/api/agents/delay-alert') && r.request().method() === 'POST');
    await drawer.getByRole('button', { name: 'Draft delay alert' }).click();
    expect((await alertResponse).status()).toBe(200);
    await expect(drawer.getByText('Draft for review, not sent')).toBeVisible();
    // The alert now forecasts the delay (predicted_delay_days, predicted_date, basis).
    const forecast = drawer.getByTestId('delay-forecast');
    await expect(forecast).toBeVisible();
    await expect(forecast.getByText('Expected delay')).toBeVisible();
    await expect(forecast.getByText('Expected arrival')).toBeVisible();
    await expect(forecast).toContainText(/\d+ days?/);
    await expect(drawer.getByTestId('sample-response')).toHaveCount(0);
    await expect(drawer.locator('pre')).toContainText(/\S{20,}|.{40,}/);
    await expect(drawer.getByRole('button', { name: 'Draft again' })).toBeVisible();

    await expectLiveData(page);
    await drawer.locator('pre').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    // Viewport shot: the drawer is fixed-position, so a full-page shot would cut it.
    await evidenceShot(page, testInfo, '02-why-late-delay-alert', false);
  });

  test('vendor decision shows the 80.2% routing-only ceiling, the vendor\'s real contribution and the recommendation', async ({ page }, testInfo) => {
    await page.goto('/vendor');

    await expect(page.getByRole('heading', { level: 1, name: 'The routing vendor fixes the wrong problem' })).toBeVisible();
    await expect(
      page.getByRole('img', { name: /Today: 71\.0%; Routing vendor only: 80\.2%; Process fixes only: 86\.7%; All five, realistic: 90\.2%; Ceiling, all fully removed: 99\.0%; benchmark 94%/ }),
    ).toBeVisible();
    await expect(page.getByText('80.2%', { exact: true }).first()).toBeVisible();

    // The vendor's unique contribution is route deviation; carrier switching needs no software.
    const adds = page.locator('section').filter({ has: page.getByRole('heading', { name: 'What the vendor actually adds' }) });
    await expect(adds).toContainText(/Route deviation, about 3\.1 points/);
    await expect(adds).toContainText(/Carrier switching\s+needs no software/);

    const rec = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Our recommendation' }) });
    await expect(rec).toBeVisible();
    await expect(rec).toContainText(/Do not sign as scoped/i);
    await expect(page.getByText('$680K').first()).toBeVisible();
    await expect(page.getByText('$14.2M').first()).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '03-vendor-decision');
  });

  test('vendor decision: business case table from /api/roi', async ({ page }, testInfo) => {
    const roi = page.waitForResponse((r) => r.url().includes('/api/roi') && r.request().method() === 'GET');
    await page.goto('/vendor');
    expect((await roi).status()).toBe(200);

    await expect(page.getByTestId('effectiveness-needed')).toContainText('Each fix must work ~84% of the time to reach 94%.');

    const table = page.getByRole('table', { name: 'Business case' });
    await expect(table).toBeVisible();
    for (const header of ['On time', 'Penalties avoided / yr', 'Redelivery avoided / yr', 'Cost / yr (estimate)', 'Net benefit / yr', 'Net, penalties only']) {
      await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }
    // One row per scenario in findings.json, with the yearly figures it holds.
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(4);
    const row = (name: RegExp) => rows.filter({ has: page.getByRole('rowheader', { name }) });
    const expectCells = async (name: RegExp, cells: string[]) => {
      const r = row(name);
      await expect(r).toHaveCount(1);
      for (const c of cells) await expect(r.getByRole('cell', { name: c, exact: true })).toBeVisible();
    };
    await expectCells(/^Routing vendor only/, ['80.2%', '$520K', '$314K', '$680K', '$154K', '−$160K']);
    await expectCells(/^Process fixes only/, ['86.7%', '$993K', '$516K', '$175K', '$1.3M', '$818K']);
    await expectCells(/^All five fixes, realistic/, ['90.2%', '$1.2M', '$633K', '$359K', '$1.4M', '$806K']);
    await expectCells(/^All five fixes, ceiling/, ['99.0%', '$1.7M', '$920K', '$359K', '$2.2M', '$1.3M']);
    await expect(page.getByTestId('roi-summary')).toContainText('the routing vendor loses $160K a year');

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '03b-vendor-business-case');
  });

  test('simulator: moving a slider changes the projected on-time rate', async ({ page }, testInfo) => {
    await page.goto('/what-if');
    const gauge = page.getByRole('img', { name: /Projected on-time delivery/ });
    await expect(gauge).toBeVisible();
    // Wait for the exact API projection for the starting position.
    await expect(page.getByText('Calculated by the API')).toBeVisible();
    const before = await gauge.getAttribute('aria-label');

    const simulate = page.waitForResponse((r) => r.url().includes('/api/simulate') && r.status() === 200);
    await page.getByLabel('Stock not at nearest warehouse').fill('100');
    await expect(page.getByLabel('Stock not at nearest warehouse')).toHaveValue('100');
    await simulate;

    await expect(gauge).not.toHaveAttribute('aria-label', before!);
    await expect(page.getByText('Calculated by the API')).toBeVisible();
    const parse = (s: string | null) => Number(/([\d.]+)%/.exec(s ?? '')?.[1]);
    const after = await gauge.getAttribute('aria-label');
    expect(parse(after)).toBeGreaterThan(parse(before));

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '04-simulator');
  });
});
