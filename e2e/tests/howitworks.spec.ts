import { expect, test } from '@playwright/test';
import { evidenceShot, expectLiveData, trackConsoleErrors } from './helpers';

test.describe('How it works (landing page)', () => {
  test('problem, 10-step journey, causes, routing bracket, legend and start-here path', async ({ page }, testInfo) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1, name: /How an order travels/ })).toBeVisible();

    // The problem in one sentence + the three numbers.
    await expect(page.getByRole('heading', { name: 'The problem in one sentence' })).toBeVisible();
    const numbers = page.getByTestId('problem-numbers');
    for (const v of ['71%', '94%', '$14.2M']) await expect(numbers.getByText(v, { exact: true })).toBeVisible();

    // Ten steps; the five causes with their points; the routing tool only on the road.
    const map = page.getByTestId('process-map');
    await expect(map.getByTestId('process-step')).toHaveCount(10);
    await expect(map.getByTestId('cause-marker')).toHaveCount(5);
    for (const p of ['−6.9 pts', '−5.4 pts', '−4.9 pts', '−7.7 pts', '−3.1 pts']) await expect(map.getByText(p)).toBeVisible();
    await expect(map.getByTestId('routing-tool')).toHaveCount(1);
    await expect(map.getByTestId('routing-tool')).toContainText('$680K routing tool');
    await expect(map.getByTestId('act-badge')).toHaveCount(0);
    await evidenceShot(page, testInfo, '14-how-it-works-today');

    // With DeliveryLens: a badge on each step where we act, linking to the page that shows it.
    await page.getByRole('button', { name: 'With DeliveryLens' }).click();
    await expect(page.getByRole('button', { name: 'With DeliveryLens' })).toHaveAttribute('aria-pressed', 'true');
    const badges = map.getByTestId('act-badge');
    for (const n of ['Order Intake Agent', 'Address check', 'Promise check', 'Stock check', 'Carrier advisor', 'Delay Alert Agent', 'Ask DeliveryLens']) {
      await expect(badges.filter({ hasText: n })).toHaveCount(1);
    }
    await expect(page.getByTestId('legend').getByText('AI agent', { exact: true })).toBeVisible();
    await expect(page.getByTestId('start-here').getByRole('listitem')).toHaveCount(9);
    await evidenceShot(page, testInfo, '15-how-it-works-with-deliverylens');

    await badges.filter({ hasText: 'Carrier advisor' }).click();
    await expect(page).toHaveURL(/\/carriers$/);

    await expectLiveData(page);
    expect(errors).toEqual([]);
  });

  test('help panel is closed by default and remembered after opening', async ({ page }) => {
    await page.goto('/how-it-works');
    const toggle = page.getByRole('button', { name: /What am I looking at\?/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(page.getByTestId('help-panel')).toContainText('Amber "pts" markers');
    await page.reload();
    await expect(page.getByRole('button', { name: /What am I looking at\?/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('header shows which AI provider is answering', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.getByTestId('ai-badge').filter({ visible: true })).toHaveText(/^AI: (Mock \(canned\)|Gemini .+|Bedrock)/);
  });
});
