import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(async () => {
  execSync("npm run data-reset");
});

test.afterEach(async () => {
  execSync("npm run data-reset");
});

/**
 * Binance re-exports of overlapping date ranges relabel volatile display fields
 * (e.g. "Method": "Bank Transfer (PIX)" -> "Transferência Bancária ( Pix )") and
 * reformat amounts. The importer must still recognise a transaction it already
 * has via its stable "Transaction ID" and not create a duplicate.
 */
test("overlapping Binance-Fiat-*-History exports do not duplicate transactions", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 60000 });

  const welcomeDialog = page.getByRole("dialog", { name: "Welcome to MondayMoney" });
  try {
    await expect(welcomeDialog).toBeVisible({ timeout: 5000 });
    await welcomeDialog.getByRole("button", { name: "Close" }).click();
    await expect(welcomeDialog).toBeHidden();
  } catch {
    /* no dialog */
  }

  await page.getByRole("link", { name: "Import" }).click();
  await page.getByRole("button", { name: "Create New" }).click();
  await page.getByPlaceholder("e.g. jessica-account").fill("binance-user");

  const fixtureDir = path.join(__dirname, "fixtures", "import-transactions");
  // Two exports of the same deposit — second one relabels Method + reformats Receive Amount.
  const files = [
    "Binance-Fiat-Deposit-History-202604041700(UTC--3).csv",
    "Binance-Fiat-Deposit-History-202604041710(UTC--3).csv",
    "Binance-Fiat-Withdraw-History-202604041703(UTC--3).csv",
  ].map((f) => path.join(fixtureDir, f));

  await page.locator("#file-upload").setInputFiles(files);
  await page.getByRole("button", { name: /Import \d+ File\(s\)/ }).click();
  await expect(page.locator("tbody")).toContainText(
    "Binance-Fiat-Deposit-History-202604041710(UTC--3).csv"
  );

  await page.getByRole("link", { name: "Investments" }).click();
  await expect(page.getByText("Synchronizing with Binance...")).toBeHidden({ timeout: 15000 });
  await page.getByRole("tab", { name: "Fiat Flow" }).click();

  // 1 deposit (deduped from 2 files) + 1 withdraw = 2 rows, not 3.
  await expect(page.getByText(/Showing 2 of 2 records/)).toBeVisible();
});
