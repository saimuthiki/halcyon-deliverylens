import { expect, test } from '@playwright/test';
import { API_URL, DEMO_TOKEN_HEADERS, evidenceShot, expectLiveData } from './helpers';

test.describe('AI agents (mock provider)', () => {
  test('order intake: incomplete address is flagged and a follow-up is drafted', async ({ page }, testInfo) => {
    await page.goto('/order-intake');
    await page.getByLabel('Start from a sample').selectOption('02_incomplete_address');

    const resp = page.waitForResponse((r) => r.url().includes('/api/agents/order-intake'));
    await page.getByRole('button', { name: 'Check this order' }).click();
    expect((await resp).status()).toBe(200);

    const result = page.getByRole('region', { name: 'Agent result' });
    await expect(result.getByText('Client 117').first()).toBeVisible();
    // Country is no longer required (defaults to US, recorded as an assumption), so 2 fields are missing.
    await expect(result.getByText('2 fields missing')).toBeVisible();
    for (const field of ['Street', 'ZIP code']) {
      const tile = result.locator('dl > div').filter({ has: page.getByText(field, { exact: true }) });
      await expect(tile.getByText('Missing')).toBeVisible();
    }
    await expect(result.getByText('Draft follow-up to the client')).toBeVisible();
    await expect(result.locator('pre')).toContainText('street address');
    await expect(result.getByRole('alert')).toHaveCount(0);
    // A live agent answer never carries the offline label.
    await expect(result.getByTestId('sample-response')).toHaveCount(0);

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '06-order-intake-incomplete-address');
  });

  test('order intake: same-day order after the 08:00 cutoff shows a warning', async ({ page }, testInfo) => {
    await page.goto('/order-intake');
    await page.getByLabel('Start from a sample').selectOption('03_same_day_after_cutoff');

    const resp = page.waitForResponse((r) => r.url().includes('/api/agents/order-intake'));
    await page.getByRole('button', { name: 'Check this order' }).click();
    expect((await resp).status()).toBe(200);

    const result = page.getByRole('region', { name: 'Agent result' });
    const warning = result.getByRole('alert');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Same-day order after the 08:00 cutoff');
    await expect(warning).toContainText('09:40');
    await expect(result.getByText('Ready for the pick list')).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '07-order-intake-after-cutoff');
  });

  test('ask: a suggested question returns an answer with a number', async ({ page }, testInfo) => {
    await page.goto('/ask');
    const resp = page.waitForResponse((r) => r.url().includes('/api/agents/ask') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'What is the biggest cause of late deliveries?' }).click();
    expect((await resp).status()).toBe(200);

    const answer = page.getByRole('listitem').filter({ hasText: 'DeliveryLens:' }).first();
    await expect(answer).toBeVisible();
    await expect(answer).toContainText(/\d/);
    await expect(answer).not.toContainText('could not be answered');

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '08-ask');
  });

  test('agent activity lists the agent runs', async ({ page, request }, testInfo) => {
    // Own the data: make a run through the API first so this test does not depend on test order.
    const ask = await request.post(`${API_URL}/api/agents/ask`, { data: { question: 'Which carriers are weak, and where?' }, headers: DEMO_TOKEN_HEADERS });
    expect(ask.ok()).toBeTruthy();

    await page.goto('/activity');
    await expect(page.getByRole('heading', { level: 1, name: 'Agent activity' })).toBeVisible();
    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByRole('cell', { name: 'Ask DeliveryLens' }).first()).toBeVisible();
    await expect(page.getByText('Done').first()).toBeVisible();

    await expectLiveData(page);
    await evidenceShot(page, testInfo, '09-agent-activity');
  });
});
