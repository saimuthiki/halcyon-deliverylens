import { expect, test } from '@playwright/test';
import { evidenceShot, expectLiveData, trackConsoleErrors } from './helpers';

test.describe('The decision pages', () => {
  test('overview shows 71.0% today, 96.6% with all fixes and $14.2M at risk', async ({ page }, testInfo) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /On-time delivery is 71%\. The benchmark is 94%\./ })).toBeVisible();
    const track = page.getByRole('figure', { name: /today 71\.0%.*all five causes fixed 96\.6%/ });
    await expect(track).toBeVisible();
    await expect(track.getByText('71.0%', { exact: true }).first()).toBeVisible();
    await expect(track.getByText('96.6%', { exact: true }).first()).toBeVisible();

    const atRisk = page.locator('dl > div').filter({ hasText: 'Annual revenue at risk' });
    await expect(atRisk.getByText('$14.2M')).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '01-overview');
    expect(errors).toEqual([]);
  });

  test('why-late: waterfall, cause drill-down, delivery drawer and delay alert', async ({ page }, testInfo) => {
    await page.goto('/why-late');

    await expect(page.getByRole('img', { name: /On-time delivery waterfall/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /From 71% today to 96\.6% with every cause fixed/ })).toBeVisible();
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
    await expect(drawer.locator('pre')).toContainText(/\S{20,}|.{40,}/);
    await expect(drawer.getByRole('button', { name: 'Draft again' })).toBeVisible();

    await expectLiveData(page);
    await drawer.locator('pre').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    // Viewport shot: the drawer is fixed-position, so a full-page shot would cut it.
    await evidenceShot(page, testInfo, '02-why-late-delay-alert', false);
  });

  test('vendor decision shows the 78.6% routing-only ceiling and the recommendation', async ({ page }, testInfo) => {
    await page.goto('/vendor');

    await expect(page.getByRole('heading', { level: 1, name: 'The routing vendor fixes the wrong problem' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Routing vendor only: 78\.6%/ })).toBeVisible();
    await expect(page.getByText('78.6%', { exact: true })).toBeVisible();

    const rec = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Our recommendation' }) });
    await expect(rec).toBeVisible();
    await expect(rec).toContainText(/Do not sign as scoped/i);
    await expect(page.getByText('$680K').first()).toBeVisible();
    await expect(page.getByText('$14.2M').first()).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '03-vendor-decision');
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
