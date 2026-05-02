import { test, expect } from "@playwright/test";
import {
  importRawCSV,
  deleteImportedRawCSV,
  searchForTransaction,
} from "./test-utils";

test.describe.configure({ mode: "serial" });
test.use({ navigationTimeout: 60000, actionTimeout: 60000 });
test.setTimeout(120000);

test.beforeEach(async ({ page }) => {
  await importRawCSV(page);
  await searchForTransaction(page, 10);
});

test.afterEach(async ({ page }) => {
  await deleteImportedRawCSV(page);
});

test("Esc key sequence clears filters step-by-step", async ({ page }) => {
  // 1. Setup: Select a row and add a search term
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator(".peer").click(); // Select row
  await expect(firstRow.locator(".peer")).toBeChecked();

  const searchInput = page.getByPlaceholder("Search...");
  await searchInput.fill("Uber");
  await searchInput.blur(); // Ensure focus is out of input so Esc sequence starts correctly
  await page.waitForTimeout(500); // Wait for debounce

  // 2. Press Esc - Should clear selection first
  await page.keyboard.press("Escape");
  await expect(firstRow.locator(".peer")).not.toBeChecked();
  await expect(searchInput).toHaveValue("Uber");

  // 3. Press Esc - Should clear Search field
  await page.keyboard.press("Escape");
  await expect(searchInput).toHaveValue("");
});

test("Multi-layer filters AND/OR logic", async ({ page }) => {
  // Initial state: only one filter layer
  const layers = page.locator("div.sticky").locator("div.flex.flex-wrap.items-center.gap-2");
  await expect(layers).toHaveCount(1);

  // Add another layer
  await page.getByRole("button", { name: "Add Filter Layer" }).click();
  await expect(layers).toHaveCount(2);

  // Change logic to OR
  const logicButton = layers.nth(1).getByRole("button", { name: /Toggle logic/ });
  await logicButton.click();
  await expect(logicButton).toHaveText("OR");
  
  // Remove layer
  await layers.nth(1).getByRole("button", { name: "Remove Filter Layer" }).click();
  await expect(layers).toHaveCount(1);
});

test("Charts reflect selected transactions", async ({ page }) => {
  // Get initial total from chart (Net Total)
  const netTotalLocator = page.locator("p.text-2xl.font-bold").first();
  const initialTotal = await netTotalLocator.innerText();

  // Select one row
  const firstRow = page.locator("tbody tr").first();
  // Amount is in the 4th column (index 3)
  const amountText = await firstRow.locator("td").nth(3).innerText(); 
  
  await firstRow.locator(".peer").click();

  // Total in chart should now match the selected row amount
  // We use a regex to match the value within the formatted currency string
  // and we wait for the total to change from the initial total
  await expect(netTotalLocator).not.toHaveText(initialTotal);
  const newTotal = await netTotalLocator.innerText();

  // Clean strings for comparison (remove R$, non-breaking spaces, etc)
  const cleanAmount = amountText.replace(/[^\d,-]/g, "").replace(/\s/g, "");
  const cleanNewTotal = newTotal.replace(/[^\d,-]/g, "").replace(/\s/g, "");

  expect(cleanNewTotal).toBe(cleanAmount);});

test("Yearly chart uses stacked bars", async ({ page }) => {
  // Switch to yearly view
  await page.getByRole("button", { name: "Yearly" }).click();
  
  // Check if Bar components are present in the chart
  // Recharts Bar components render as <path class="recharts-rectangle" ...>
  const bars = page.locator(".recharts-bar-rectangle");
  await expect(bars.first()).toBeVisible();
});
