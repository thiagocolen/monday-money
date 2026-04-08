import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

test.describe('E2E Flow: Import and Verify', () => {
  test.beforeEach(async () => {
    // 0. Clean up test-user files from previous runs to ensure fresh import
    const protectedTestUserDir = path.resolve(process.cwd(), '..', 'core', 'protected', 'raw-statement-files', 'test-user');
    if (fs.existsSync(protectedTestUserDir)) {
      fs.rmSync(protectedTestUserDir, { recursive: true, force: true });
    }

    // 1. Reset data to a clean state
    console.log('Running data-reset...');
    execSync('npm run data-reset', { stdio: 'inherit' });
  });

  test('should import files for test-user and verify transactions', async ({ page }) => {
    // Increase timeout for this heavy test
    test.setTimeout(180000); 

    // 1. Open the app and go to import page
    await page.goto('/import');
    await expect(page.getByText('Import Statement Files')).toBeVisible();

    // 2. Add new owner called "test-user"
    await page.getByRole('button', { name: 'Create New' }).click();
    const ownerInput = page.getByPlaceholder('e.g. jessica-account');
    await ownerInput.fill('test-user');

    // 3. Upload the files from raw-statement-files/test-user/**
    const testUserDir = path.resolve(process.cwd(), '..', 'raw-statement-files', 'test-user');
    const files = fs.readdirSync(testUserDir)
      .filter(file => file.endsWith('.csv'))
      .map(file => path.join(testUserDir, file));

    await page.setInputFiles('#file-upload', files);

    // 4. Click import button
    await page.getByRole('button', { name: /Import \d+ File\(s\)/ }).click();

    // 5. After processing, check if all files appear in import history section
    // Wait for success toast with a generous timeout
    await expect(page.getByText(/Successfully imported and processed/)).toBeVisible({ timeout: 120000 });

    // Verify history table contains test-user entries
    // We expect several rows with "test-user" owner
    const historyRows = page.locator('table >> tbody >> tr');
    // Generous timeout for history to load after processing
    await expect(historyRows.filter({ hasText: 'test-user' }).first()).toBeVisible({ timeout: 60000 });

    // 6. Go to transactions page
    await page.goto('/'); // Root is TransactionsPage
    await expect(page.getByText('Monthly Transactions')).toBeVisible();

    // 7. Navigate to Jan 2026
    // Assuming we start at April 2026 (based on session context)
    // We click chevron left until we see "January 2026"
    const monthLabel = page.locator('span.font-mono.font-bold').first();
    let currentMonth = await monthLabel.innerText();
    
    let attempts = 0;
    while (!currentMonth.toLowerCase().includes('january 2026') && attempts < 12) {
      await page.locator('button:has(svg.lucide-chevron-left)').first().click();
      await page.waitForTimeout(100); // Small wait for state update
      currentMonth = await monthLabel.innerText();
      attempts++;
    }
    expect(currentMonth.toLowerCase()).toContain('january 2026');

    // 8. Check if the fake transaction from 1-jan-26 is there
    const searchInput = page.getByPlaceholder('Search all columns...');
    await searchInput.fill('*Fake Transaction');
    
    // Check table for the transaction
    await expect(page.locator('tbody >> tr').filter({ hasText: '*Fake Transaction' }).first()).toBeVisible();

    // 9. Go to investments page
    await page.goto('/investments');
    await expect(page.getByText('Monitor your Binance exchange activity')).toBeVisible();

    // 10. Check if the fake transaction from 1-jan-26 is there
    const investSearchInput = page.getByPlaceholder('Search all columns...');
    await investSearchInput.fill('*Fake Transaction');

    // Check Transaction History tab (default)
    const historyTabResult = page.locator('tbody >> tr').filter({ hasText: '*Fake Transaction' });
    
    // Check Crypto Flow tab
    await page.getByRole('tab', { name: 'Crypto Flow' }).click();
    const cryptoTabResult = page.locator('tbody >> tr').filter({ hasText: '*Fake Transaction' });

    // Check Fiat Flow tab
    await page.getByRole('tab', { name: 'Fiat Flow' }).click();
    const fiatTabResult = page.locator('tbody >> tr').filter({ hasText: '*Fake Transaction' });

    // Assert that it appears at least in one of the tabs
    // Use first() to avoid strict mode violation if multiple matches exist
    const isVisibleInAny = await historyTabResult.first().isVisible() || 
                           await cryptoTabResult.first().isVisible() || 
                           await fiatTabResult.first().isVisible();
    
    expect(isVisibleInAny).toBe(true);
    
    // Final check: it should be visible in the current tab (Fiat Flow)
    await expect(page.locator('tbody >> tr').filter({ hasText: '*Fake Transaction' }).first()).toBeVisible();
  });
});
