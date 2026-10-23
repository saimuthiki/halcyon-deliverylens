import { expect, test } from '@playwright/test';
import { expectLiveData, trackConsoleErrors } from './helpers';

const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /On-time delivery is 71%/ },
  { path: '/why-late', heading: /Five causes explain almost every late delivery/ },
  { path: '/vendor', heading: /The routing vendor fixes the wrong problem/ },
  { path: '/what-if', heading: /What if we fix part of the problem\?/ },
  { path: '/carriers', heading: /Every carrier is fine somewhere/ },
  { path: '/clients', heading: /./ },
  { path: '/order-intake', heading: /Check every email order/ },
  { path: '/ask', heading: /Ask DeliveryLens/ },
  { path: '/activity', heading: /Agent activity/ },
];

for (const p of PAGES) {
  test(`smoke: ${p.path} loads live data with no console errors`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
    // Loading skeletons finish and no section shows an error.
    await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
    await expect(page.getByText('This section could not load.')).toHaveCount(0);
    await expectLiveData(page);
    expect(errors).toEqual([]);
  });
}
