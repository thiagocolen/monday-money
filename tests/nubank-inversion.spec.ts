import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(async () => {
  execSync('npm run data-reset');
});

test('verify NULLED category and nubank amount inversion', async ({ page }) => {
  test.setTimeout(120000);
  
  // 1. Import Nubank files
  await page.goto('/');
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

  // 2. Go to Transactions and check values
  await page.getByRole('link', { name: 'Transactions' }).click();
  
  // Navigate to January 2026
  await page.getByRole('button', { name: 'Previous Month' }).click();
  await page.getByRole('button', { name: 'Previous Month' }).click();
  await page.getByRole('button', { name: 'Previous Month' }).click();
  
  await expect(page.locator('span').filter({ hasText: 'January 2026' })).toBeVisible();

  // 3. Verify NULLED category exists in Bulk Edit
  // Select first data row to enable bulk edit
  const firstDataRow = page.getByRole('row', { name: '*Fake Nubank Debit Transaction' });
  await firstDataRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Bulk Edit/ }).click();
  await expect(page.getByRole('dialog')).toContainText('NULLED');
  await page.keyboard.press('Escape');

  // 4. Check Nubank Debit Inversion
  // Original CSV: -763.00 -> Should be 763.00
  const nubankDebitRow = page.getByRole('row', { name: '*Fake Nubank Debit Transaction' });
  await expect(nubankDebitRow).toContainText('763,00');
  await expect(nubankDebitRow.locator('div.text-emerald-600')).toContainText('763,00');

  // 5. Check Nubank Credit Inversion
  // Original CSV: 874.00 -> Should be -874.00
  const nubankCreditRow = page.getByRole('row', { name: '*Fake Nubank Credit Transaction' });
  await expect(nubankCreditRow).toContainText('874,00');
  await expect(nubankCreditRow.locator('div.text-destructive')).toContainText('874,00');

  // 6. Verify NULLED transactions are excluded from chart
  // Initial total should be 763.00 - 874.00 = -111.00
  await expect(page.locator('.text-2xl.font-bold', { hasText: '111,00' })).toBeVisible();

  // Clear previous selection and select only Nubank Credit (-874.00)
  await firstDataRow.getByRole('checkbox').uncheck();
  await nubankCreditRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Bulk Edit/ }).click();
  
  // Find NULLED row in dialog and click "Set"
  const nulledRow = page.getByRole('dialog')
    .locator('div')
    .filter({ has: page.getByText('NULLED', { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Set' }) })
    .last();
  await nulledRow.getByRole('button', { name: 'Set' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // Now the chart total should only be the Debit transaction: +763.00
  await expect(page.locator('.text-2xl.font-bold', { hasText: '763,00' })).toBeVisible();
  // And it should be positive (emerald)
  await expect(page.locator('.text-2xl.font-bold.text-emerald-600')).toContainText('763,00');
});
