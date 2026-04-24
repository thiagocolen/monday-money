import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('import, process, check and delete transaction from: Nubank Credit, Nubank Debit, Mercado Pago, Bradesco', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Import' }).click();
  // Ensure the owner exists by creating it
  await page.getByRole('button', { name: 'Create New' }).click();
  await page.getByPlaceholder('e.g. jessica-account').fill('test-user');
  
  const fixtureDir = path.join(__dirname, 'fixtures', 'import-transactions');
  const filesToUpload = [
    '4d305b23-7f64-46ed-823f-f4aa408230da.csv',
    'account_statement-4b9b9af5-4572-42a1-b994-e35c837c29db.csv',
    'NU_99626330_01FEV2026_28FEV2026.csv',
    'Nubank_2026-01-09.csv'
  ].map(file => path.join(fixtureDir, file));

  await page.locator('#file-upload').setInputFiles(filesToUpload);
  await page.getByRole('button', { name: 'Import 4 File(s)' }).click();
  await expect(page.locator('tbody')).toContainText('Nubank_2026-01-09.csv');
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('NU_99626330_01FEV2026_28FEV2026.csv');
  await expect(page.locator('tbody')).toContainText('1');
  await page.getByRole('cell', { name: '1', exact: true }).nth(3).click();
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('account_statement-4b9b9af5-4572-42a1-b994-e35c837c29db.csv');
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('4d305b23-7f64-46ed-823f-f4aa408230da.csv');
  await expect(page.locator('tbody')).toContainText('1');
  await expect(page.locator('tbody')).toContainText('1');
  await page.getByRole('link', { name: 'Transactions' }).click();
  await page.locator('span').filter({ hasText: 'April' }).click();
  await page.getByRole('button').nth(2).click();
  await page.getByRole('button').nth(2).click();
  await page.getByRole('button').nth(2).click();
  await expect(page.locator('tbody')).toContainText('01/01/2026');
  const bradescoRow = page.getByRole('row', { name: '*Fake Bradesco Transaction' });
  await expect(bradescoRow).toContainText('999,00');

  const nubankDebitRow = page.getByRole('row', { name: '*Fake Nubank Debit Transaction' });
  await expect(nubankDebitRow).toContainText('763,00');

  const nubankCreditRow = page.getByRole('row', { name: '*Fake Nubank Credit Transaction' });
  await expect(nubankCreditRow).toContainText('874,00');

  const mercadoPagoRow = page.getByRole('row', { name: '*Fake Mercado Pago Transaction' });
  await expect(mercadoPagoRow).toContainText('810,00');
  await page.getByRole('link', { name: 'Import' }).click();
  await page.getByRole('row', { name: 'Nubank_2026-01-09.csv' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Remove and Reprocess' }).click();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('row', { name: 'NU_99626330_01FEV2026_28FEV2026.csv' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Remove and Reprocess' }).click();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('row', { name: 'account_statement-4b9b9af5-' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Remove and Reprocess' }).click();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('row', { name: '4d305b23-7f64-46ed-823f-' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Remove and Reprocess' }).click();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByRole('main')).toContainText('No import history found.');
});