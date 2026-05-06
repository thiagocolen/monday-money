import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(async ({ page }) => {
  execSync('npm run data-reset');
  execSync('npm run settings-reset');

  const exportFolderPath = path.join(__dirname, 'export-folder');
  if (!fs.existsSync(exportFolderPath)) {
    fs.mkdirSync(exportFolderPath, { recursive: true });
  }

  // Mock Electron bridge to delegate to real API via fetch
  await page.addInitScript(() => {
    window.electron = {
      invoke: async (channel: string, ...args: any[]) => {
        // Map Electron channels to API endpoints
        const channelMap: Record<string, { url: string, method: string }> = {
          'get-csv-data': { url: `/api/data/${args[0]}`, method: 'GET' },
          'get-owners': { url: '/api/owners', method: 'GET' },
          'import-file': { url: '/api/import-file', method: 'POST' },
          'delete-import': { url: '/api/delete-import', method: 'POST' },
          'get-import-history': { url: '/api/import-history', method: 'GET' },
          'save-category': { url: '/api/save-category', method: 'POST' },
          'bulk-save-metadata': { url: '/api/bulk-save-metadata', method: 'POST' },
          'get-metadata': { url: '/api/metadata', method: 'GET' },
          'save-metadata': { url: '/api/metadata', method: 'POST' },
          'full-backup': { url: '/api/full-backup', method: 'POST' },
          'get-backup-info': { url: '/api/backup-info', method: 'GET' },
          'get-settings': { url: '/api/settings', method: 'GET' },
          'set-export-path': { url: '/api/settings', method: 'POST' },
          'restore-backup': { url: '/api/restore-backup', method: 'POST' },
          'reset-app': { url: '/api/reset-app', method: 'POST' }
        };

        const config = channelMap[channel];
        if (!config) {
          if (channel === 'select-directory') return 'C:\\mock-path';
          return { success: true };
        }

        const options: RequestInit = { method: config.method };
        let requestBody = args[0];
        if (channel === 'set-export-path') requestBody = { exportPath: args[0] };
        if (channel === 'restore-backup') requestBody = { zipPath: args[0] };

        if (config.method === 'POST' && requestBody !== undefined) {
          options.headers = { 'Content-Type': 'application/json' };
          options.body = JSON.stringify(requestBody);
        }

        const response = await fetch(config.url, options);
        if (config.url.includes('.csv')) return await response.text();
        return await response.json();
      }
    };
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('mock-export-path'));
  await page.reload();
});

test.afterEach(async () => {
  execSync('npm run data-reset');
});

test('verify NULLED category and nubank amount inversion', async ({ page }) => {
  test.setTimeout(120000);
  
  // 1. Handle onboarding dialog if it appears
  const welcomeDialog = page.getByRole('dialog', { name: 'Welcome to MondayMoney' });
  const exportFolderPath = path.join(__dirname, 'export-folder');
  
  if (await welcomeDialog.isVisible()) {
    await page.getByLabel("Export Folder Path").fill(exportFolderPath);
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(welcomeDialog).toBeHidden();
  }

  // 2. Import Nubank files
  await page.getByRole('link', { name: 'Import' }).click();
  await page.getByRole('button', { name: 'Create New' }).click();
  await page.getByPlaceholder('e.g. jessica-account').fill('test-user');
  
  const fixtureDir = path.join(__dirname, 'fixtures', 'import-transactions');
  const filesToUpload = [
    'NU_99626330_01FEV2026_28FEV2026.csv',
    'Nubank_2026-01-09.csv'
  ].map(file => path.join(fixtureDir, file));

  await page.locator('#file-upload').setInputFiles(filesToUpload);
  await page.getByRole('button', { name: 'Import 2 File(s)' }).click();
  
  await expect(page.locator('tbody')).toContainText('NU_99626330_01FEV2026_28FEV2026.csv');
  await expect(page.locator('tbody')).toContainText('Nubank_2026-01-09.csv');

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();

  // Navigate to January 2026
  const monthLabel = page.locator('span.font-mono.font-bold').filter({ hasText: /202/ }).first();
  for (let i = 0; i < 24; i++) {
    await expect(monthLabel).toBeVisible();
    const currentMonth = (await monthLabel.innerText()).toUpperCase();

    // Support both English and Portuguese
    if ((currentMonth.includes('JANUARY') || currentMonth.includes('JANEIRO')) && currentMonth.includes('2026')) break;

    await page.getByRole('button', { name: 'Previous Month' }).click();
    await expect(monthLabel).not.toHaveText(currentMonth, { ignoreCase: true });
    await expect(page.getByText(/Loading/i)).not.toBeVisible();
  }

  await expect(monthLabel).toContainText(/Jan/i);
  // 3. Verify NULLED category exists in Bulk Edit
  // Select first data row to enable bulk edit
  const firstDataRow = page.getByRole('row', { name: '*Fake Nubank Debit Transaction' });
  await firstDataRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Bulk Edit/ }).click();
  await expect(page.getByRole('dialog')).toContainText('NULLED');
  await page.keyboard.press('Escape');

  // 4. Check Nubank Debit Inversion (NO LONGER INVERTED)
  // Original CSV: -763.00 -> Should be -763.00
  const nubankDebitRow = page.getByRole('row', { name: '*Fake Nubank Debit Transaction' });
  await expect(nubankDebitRow).toContainText('763,00');
  // Check the div inside the cell that has the color class (should be destructive now)
  await expect(nubankDebitRow.locator('div.text-destructive')).toBeVisible();

  // 5. Check Nubank Credit Inversion (STAYS INVERTED)
  // Original CSV: 874.00 -> Should be -874.00
  const nubankCreditRow = page.getByRole('row', { name: '*Fake Nubank Credit Transaction' });
  await expect(nubankCreditRow).toContainText('874,00');
  await expect(nubankCreditRow.locator('div.text-destructive')).toBeVisible();

  // 6. Verify NULLED transactions are excluded from chart
  // Initial total should be -763.00 - 874.00 = -1637.00
  await expect(page.locator('.text-2xl.font-bold', { hasText: '1.637,00' })).toBeVisible();

  // Clear previous selection and select only Nubank Credit (-874.00)
  await firstDataRow.getByRole('checkbox').uncheck();
  await nubankCreditRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Bulk Edit/ }).click();
  
  // Find NULLED row in dialog and click it
  // Use a regex that allows trailing text (like the "Default" badge)
  const nulledRow = page.getByRole('dialog')
    .locator('div.group')
    .filter({ hasText: /^NULLED/ })
    .last();
  await nulledRow.click();
  await page.getByRole("button", { name: "Done" }).click();

  // Clear selection so the chart shows all (non-NULLED) filtered data
  await nubankCreditRow.getByRole("checkbox").uncheck();

  // Now the chart total should only be the Debit transaction: -763.00
  await expect(page.locator(".text-2xl.font-bold", { hasText: "763,00" })).toBeVisible({ timeout: 10000 });
  // And it should be negative (destructive)
  await expect(page.locator('.text-2xl.font-bold.text-destructive')).toContainText('763,00');
});
