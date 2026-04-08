import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Navigation', () => {
  test.beforeEach(async () => {
    // 1. Reset data to a clean state
    console.log('Running data-reset...');
    execSync('npm run data-reset', { stdio: 'inherit' });
  });

  test('should navigate between pages', async ({ page }) => {
    // Start at Transactions page
    await page.goto('/');
    await expect(page).toHaveTitle(/Monday Money/);
    await expect(page.getByRole('link', { name: 'Transactions' })).toHaveClass(/text-primary/);

    // Navigate to Investments
    await page.getByRole('link', { name: 'Investments' }).click();
    await expect(page).toHaveURL(/\/investments/);
    await expect(page.getByRole('link', { name: 'Investments' })).toHaveClass(/text-primary/);

    // Navigate to Import
    await page.getByRole('link', { name: 'Import' }).click();
    await expect(page).toHaveURL(/\/import/);
    await expect(page.getByRole('link', { name: 'Import' })).toHaveClass(/text-primary/);

    // Back to Transactions
    await page.getByRole('link', { name: 'Transactions' }).click();
    await expect(page).toHaveURL(/\//);
  });
});
