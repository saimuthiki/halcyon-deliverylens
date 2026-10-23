import { expect, test, type Page } from '@playwright/test';
import { API_URL, DEMO_TOKEN_HEADERS, evidenceShot, expectLiveData, trackConsoleErrors } from './helpers';

// These tests share the desk state on the API (inbox status and WMS orders), so they run one after another.
test.describe.configure({ mode: 'serial' });

async function resetDesk(page: Page) {
  const r = await page.request.post(`${API_URL}/api/desk/reset`, { headers: DEMO_TOKEN_HEADERS });
  expect(r.ok()).toBeTruthy();
}

test.describe('Order desk (live)', () => {
  test.beforeEach(async ({ page }) => resetDesk(page));
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await resetDesk(page);
    await page.close();
  });

  test('process one email: 10-step trace, decision, draft and a WMS order', async ({ page }, testInfo) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/order-desk');
    await expect(page.getByRole('heading', { level: 1, name: /Order desk/ })).toBeVisible();
    const inbox = page.getByRole('list', { name: 'Client emails' });
    await expect(inbox.getByRole('button')).toHaveCount(12);
    await expect(page.getByTestId('desk-model')).toHaveText(/^AI: /);
    await expect(page.getByTestId('wms-empty')).toBeVisible();

    // The missing-postcode email (the scenario label comes from the API).
    await inbox.getByRole('button').filter({ hasText: /postcode/i }).first().click();
    const resp = page.waitForResponse((r) => r.url().includes('/api/desk/process/') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run DeliveryLens on this email' }).click();
    expect((await resp).status()).toBe(200);

    const steps = page.getByTestId('trace-step');
    await expect(steps).toHaveCount(10);
    const keys = await steps.evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
    expect(keys).toEqual(['receive', 'guardrail', 'extract', 'identify_client', 'address_check', 'promise_check', 'stock_check', 'carrier_choice', 'decision', 'client_message']);
    await expect(page.locator('[data-testid="trace-step"][data-key="address_check"]')).toHaveAttribute('data-status', 'fail');

    // Expand a step's details.
    const extract = page.locator('[data-testid="trace-step"][data-key="extract"]');
    await extract.getByRole('button', { name: 'Details' }).click();
    await expect(extract.getByText('Hide details')).toBeVisible();

    const card = page.getByTestId('decision-card');
    await expect(card).toHaveAttribute('data-decision', 'on_hold');
    await expect(page.getByTestId('matches-expected')).toHaveText('Matches expected');
    await expect(page.getByTestId('draft')).toContainText('DRAFT — needs approval');

    const wms = page.getByRole('table', { name: 'WMS orders' });
    await expect(wms.locator('tbody tr')).toHaveCount(1);
    await expect(wms.getByTestId('wms-status')).toHaveText('On hold');
    await expect(page.getByTestId('sample-response')).toHaveCount(0);

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '16-order-desk-one-email');
    expect(errors).toEqual([]);
  });

  test('run all 12: every decision matches, WMS fills, then reset empties it', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/order-desk');
    const inbox = page.getByRole('list', { name: 'Client emails' });
    await expect(inbox.getByRole('button')).toHaveCount(12);

    const resp = page.waitForResponse((r) => r.url().includes('/api/desk/process-all'), { timeout: 110_000 });
    await page.getByRole('button', { name: /^Run all/ }).click();
    expect((await resp).status()).toBe(200);

    await expect(page.getByTestId('batch-summary')).toContainText('12 of 12', { timeout: 30_000 });
    await expect(inbox.getByTestId('inbox-status').filter({ hasText: 'New' })).toHaveCount(0);

    const wms = page.getByRole('table', { name: 'WMS orders' });
    // Every email except the blocked prompt-injection one creates a WMS order.
    await expect(wms.locator('tbody tr')).toHaveCount(11);
    await expect(wms.getByTestId('wms-status').filter({ hasText: 'Ready for pick list' })).toHaveCount(8);
    await expect(wms.getByTestId('wms-status').filter({ hasText: 'Needs review' })).toHaveCount(1);
    await evidenceShot(page, testInfo, '17-order-desk-run-all');

    // The prompt-injection email is blocked with nothing sent to the WMS.
    await inbox.getByRole('button').filter({ hasText: /injection/i }).first().click();
    await page.getByRole('button', { name: 'Run DeliveryLens on this email' }).click();
    await expect(page.getByTestId('decision-card')).toHaveAttribute('data-decision', 'blocked');

    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByTestId('wms-empty')).toBeVisible();
    await expect(inbox.getByTestId('inbox-status').filter({ hasText: 'New' })).toHaveCount(12);
  });
});
