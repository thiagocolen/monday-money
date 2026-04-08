import { test, expect } from '@playwright/test';
import path from 'path';
import { execSync } from 'child_process';

test.describe('Import Page', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Reset data to a clean state
    console.log('Running data-reset...');
    execSync('npm run data-reset', { stdio: 'inherit' });

    await page.goto('/import');
  });

  test('should display import options', async ({ page }) => {
    await expect(page.getByText('Import Statement Files')).toBeVisible();
    await expect(page.getByText('Import New File')).toBeVisible();
  });

  test('should allow selecting owner or creating new one', async ({ page }) => {
    // Check toggle to new owner
    await page.getByRole('button', { name: 'Create New' }).click();
    await expect(page.getByPlaceholder('e.g. jessica-account')).toBeVisible();

    // Toggle back to existing
    await page.getByRole('button', { name: 'Choose Existing' }).click();
    // Use combobox role to avoid ambiguity with card description
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByRole('combobox')).toContainText('Select owner');
  });

  test('should show validation error when fields are missing', async ({ page }) => {
    // Use a more flexible regex for the button
    const importButton = page.getByRole('button', { name: /Import.*File\(s\)/ });
    await expect(importButton).toBeDisabled();
  });

  test('should allow file selection', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('input[type="file"]').click();
    const fileChooser = await fileChooserPromise;
    const filePath = path.resolve(process.cwd(), 'tests', 'test-data.csv');
    await fileChooser.setFiles(filePath);
    
    // Check if file count is updated in the UI
    await expect(page.getByText('1 file(s) selected')).toBeVisible();
  });
});
