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
 * Binance "Transaction History" exports carry no per-row transaction id, and a
 * single trade routinely produces several byte-identical sub-fills. Overlapping
 * exports must therefore:
 *  - keep every legitimate repeat within an export (no row-hash collapsing), and
 *  - not re-add a transaction already imported from an earlier export, even when
 *    the later export reformats it (2- vs 4-digit year, amount notation).
 *
 * Fixtures (same trades, second file reformats + adds rows):
 *   file A: 5x "Buy SUI 1.4"  + 1x "Fee BNB -0.00000645"           (2-digit year)
 *   file B: 7x "Buy SUI 1.40" + 1x "Fee BNB -6.45E-6" + 1x "Deposit BRL 3000" (4-digit year)
 *
 * Expected merge: 7 SUI buys + 1 BNB fee + 1 BRL deposit = 9 rows.
 */
test("overlapping Binance-Transaction-History exports keep repeats but never duplicate", async ({ page }) => {
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
  const files = [
    "Binance-Transaction-History-202608010900(UTC--3).csv",
    "Binance-Transaction-History-202608020900(UTC--3).csv",
  ].map((f) => path.join(fixtureDir, f));

  await page.locator("#file-upload").setInputFiles(files);
  await page.getByRole("button", { name: /Import \d+ File\(s\)/ }).click();
  await expect(page.locator("tbody")).toContainText(
    "Binance-Transaction-History-202608020900(UTC--3).csv"
  );

  await page.getByRole("link", { name: "Investments" }).click();
  await expect(page.getByText("Synchronizing with Binance...")).toBeHidden({ timeout: 15000 });

  // Transaction History is the default tab.
  await expect(page.getByText(/Showing 9 of 9 records/)).toBeVisible();
});
