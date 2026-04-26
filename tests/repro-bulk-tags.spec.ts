import { test, expect } from "@playwright/test";
import {
  importRawCSV,
  deleteImportedRawCSV,
  searchForTransaction,
  createMetadata,
  deleteMetadata,
} from "./test-utils";

test.describe.configure({ mode: "serial" });
test.use({ navigationTimeout: 60000, actionTimeout: 60000 });
test.setTimeout(120000);

test.beforeEach(async ({ page }) => {
  await importRawCSV(page);
  await searchForTransaction(page, 5); // Ensure at least 5 transactions
});

test.afterEach(async ({ page }) => {
  await deleteImportedRawCSV(page);
});

test("is allowed to remove/add a tag, from/to multiple transactions, in a bulk operation", async ({ page }) => {
  const tag1 = `BULK-TAG-${Date.now()}`;
  
  // 1. Create the tag
  await createMetadata(page, "Tags", tag1);

  // 2. Select multiple transactions
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  
  // Select first 3 transactions
  for (let i = 0; i < 3; i++) {
    const checkbox = rows.nth(i).locator(".peer");
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
    }
  }
  
  // 3. Open bulk edit and apply tag
  await page.getByRole("button", { name: /Bulk Edit \(3\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk Edit Transactions" });
  await page.getByRole("tab", { name: "Tags" }).click();
  
  const itemRow = dialog.locator("div.group").filter({ hasText: tag1 });
  await itemRow.getByRole("button", { name: "Add" }).click();
  
  // Wait for success toast to ensure backend processing is done
  const successToast = page.getByText("Updated 3 transactions");
  await expect(successToast.first()).toBeVisible();
  await expect(successToast.first()).toBeHidden(); // Ensure toast is gone before next operation
  await dialog.getByRole("button", { name: "Done" }).click();

  // 4. Verify tag is added to all selected transactions
  for (let i = 0; i < 3; i++) {
    const cell = rows.nth(i).locator("td").nth(5);
    await expect(cell).toContainText(tag1);
  }

  // 5. Select them again if needed (they should remain selected)
  
  // 6. Bulk remove the tag
  await page.getByRole("button", { name: /Bulk Edit \(3\)/ }).click();
  await page.getByRole("tab", { name: "Tags" }).click();
  const itemRowRemove = dialog.locator("div.group").filter({ hasText: tag1 });
  await itemRowRemove.getByRole("button", { name: "Remove" }).click();
  
  // Wait for success toast
  await expect(page.getByText("Updated 3 transactions").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // 7. Verify tag is removed from all
  for (let i = 0; i < 3; i++) {
    const cell = rows.nth(i).locator("td").nth(5);
    await expect(cell).not.toContainText(tag1);
  }

  // Cleanup
  // Re-select one to open bulk edit for cleanup
  const checkbox = rows.first().locator(".peer");
  if (!(await checkbox.isChecked())) await checkbox.click();
  await deleteMetadata(page, "Tags", tag1);
});
