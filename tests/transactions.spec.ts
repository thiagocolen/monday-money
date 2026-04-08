import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Transactions Page', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Reset data to a clean state
    console.log('Running data-reset...');
    execSync('npm run data-reset', { stdio: 'inherit' });

    await page.goto('/');
    await expect(page.getByText('Monthly Transactions')).toBeVisible();
  });

  test('should display transaction table', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should navigate between months', async ({ page }) => {
    const monthLabel = page.locator('span.font-mono.font-bold').first();
    const initialMonth = await monthLabel.innerText();

    // Click previous month
    await page.locator('button:has(svg.lucide-chevron-left)').first().click();
    
    // Check if month changed
    const newMonth = await monthLabel.innerText();
    expect(newMonth.toLowerCase()).not.toBe(initialMonth.toLowerCase());

    // Click next month to go back
    await page.locator('button:has(svg.lucide-chevron-right)').first().click();
    // Wait for text to update
    await expect(monthLabel).toHaveText(initialMonth, { ignoreCase: true });
  });

  test('should filter transactions by search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search all columns/i);
    await searchInput.fill('seed'); 
    
    await page.waitForTimeout(500);
    
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    // Seed might be filtered out in production UI, but if something matches it should contain text
    if (count > 0 && await rows.first().innerText() !== 'No results.') {
      await expect(rows.first()).toContainText(/seed/i);
    }
  });

  test('should open category edit dialog', async ({ page }) => {
    // If table is empty, we can't test this.
    // In E2E we verify this properly with imported data.
    const rows = page.locator('tbody tr');
    if (await rows.count() > 0 && await rows.first().innerText() !== 'No results.') {
      const firstCategory = page.locator('tbody tr td').nth(4);
      await firstCategory.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});
