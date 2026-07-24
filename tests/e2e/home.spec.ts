import { test, expect } from '@playwright/test';

test('home page loads with the state picker', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByPlaceholder(/search your state/i)).toBeVisible();
  // California should be reachable from the directory.
  await expect(page.getByRole('link', { name: /California/ })).toBeVisible();
});

test('state search filters the list', async ({ page }) => {
  await page.goto('./');
  await page.getByPlaceholder(/search your state/i).fill('texas');
  await expect(page.getByRole('link', { name: /Texas/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /California/ })).toBeHidden();
});
