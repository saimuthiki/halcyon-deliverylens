import { expect, test } from '@playwright/test';
import { API_URL, DEMO_TOKEN_HEADERS, evidenceShot, expectLiveData } from './helpers';

test.describe('AI agents (mock provider)', () => {
  test('order desk: an email typed by hand runs the same steps', async ({ page }, testInfo) => {
    await page.goto('/order-intake'); // the old page now opens the Order desk
    await expect(page).toHaveURL(/\/order-desk$/);
    await page.getByRole('button', { name: 'Type your own' }).click();
    await page.getByLabel('Received today at').fill('07:30');
    const resp = page.waitForResponse((r) => r.url().includes('/api/desk/own-email'));
    await page.getByRole('button', { name: 'Run DeliveryLens on this email' }).click();
    expect((await resp).status()).toBe(200);
    await expect(page.getByTestId('trace-step')).toHaveCount(10);
    await expect(page.getByRole('list', { name: 'Client emails' }).getByText('Your own email')).toBeVisible();
    await expectLiveData(page);
    await evidenceShot(page, testInfo, '06-order-desk-own-email');
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
