import { expect, test } from '@playwright/test';
import { expectLiveData, trackConsoleErrors } from './helpers';

const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /On-time delivery is 71%/ },
  { path: '/why-late', heading: /Five causes account for 28 of the 29 points lost/ },
  { path: '/vendor', heading: /The routing vendor fixes the wrong problem/ },
  { path: '/what-if', heading: /What if we fix part of the problem\?/ },
  { path: '/carriers', heading: /Carrier D is weak in every region/ },
  { path: '/clients', heading: /./ },
  { path: '/stock-routes', heading: /Stock-outs and long routes happen everywhere/ },
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
