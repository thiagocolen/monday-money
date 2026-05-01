import { expect, Page, Locator } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MetadataType = "Categories" | "Tags";

const BASE_URL = "http://localhost:5173";

/**
 * Since the app uses createMemoryRouter, page.goto() only works for the initial load.
 * Subsequent navigation must be done by clicking on UI elements.
 */
async function navigateTo(page: Page, target: "Transactions" | "Investments" | "Import") {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(BASE_URL)) {
    await page.goto(BASE_URL);
  }
  
  const navLink = page.getByRole("link", { name: target });
  await navLink.click();
  
  // Verify navigation success by checking for a unique heading/element
  if (target === "Import") {
    await expect(page.getByRole("heading", { name: "Import Statement Files" })).toBeVisible();
  } else if (target === "Transactions") {
    await expect(page.getByRole("heading", { name: "Monthly Transactions" })).toBeVisible();
  }
}

export async function importRawCSV(page: Page) {
  await navigateTo(page, "Import");
  
  // Wait for the toggle button to be visible to ensure the component is loaded
  const toggleButton = page.getByRole("button", { name: /Create New|Choose Existing/i });
  await expect(toggleButton).toBeVisible();
  
  // Click only if we are not already in "Create New" mode
  // Using getByRole with a string name is case-insensitive by default in Playwright
  const createNewButton = page.getByRole("button", { name: "Create New" });
  if (await createNewButton.isVisible()) {
    await createNewButton.click();
  }

  await page
    .getByRole("textbox", { name: "e.g. jessica-account" })
    .fill("test");

  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "tags-categories",
    "Nubank_2026-01-09.csv",
  );
  
  // Use the actual file input element
  await page.locator("#file-upload").setInputFiles(fixturePath);
  
  // Wait for the button to be enabled and show the file count
  const importButton = page.getByRole("button", { name: "Import 1 File(s)" });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  
  // Wait for history to appear with a generous timeout for processing
  await expect(page.locator("tbody")).toContainText("Nubank_2026-01-09.csv", { timeout: 10000 });
  await expect(page.locator("tbody")).toContainText("28");
}

export async function deleteImportedRawCSV(page: Page) {
  await navigateTo(page, "Import");
  
  // Wait for history to load
  const main = page.getByRole("main");
  await expect(main).not.toContainText("Loading...");
  
  const row = page.getByRole("row", { name: "Nubank_2026-01-09.csv" });
  
  // Conditional check allows cleanup to be idempotent and resilient to previous test failures
  if (await row.isVisible()) {
    await row.getByRole("button").click();
    await page.getByRole("button", { name: "Remove and Reprocess" }).click();
    
    // Fix strict mode violation: there are two "Close" buttons (the button and the X icon)
    await page.getByRole("button", { name: "Close" }).first().click();
    
    await expect(main).toContainText("No import history found.");
  }
}

export async function searchForTransaction(page: Page, minTransactions: number = 1) {
  await navigateTo(page, "Transactions");

  for (let i = 0; i < 24; i++) {
    // Wait for the table to finish loading
    await expect(page.getByText("Loading transactions...")).not.toBeVisible();
    
    // Slight wait to allow React to finish rendering the filtered data
    await page.waitForTimeout(300);

    // Check if we have actual transaction rows
    const transactionCount = await page
      .locator("tbody tr")
      .filter({ hasNotText: "No results." })
      .count();
      
    if (transactionCount >= minTransactions) {
      return;
    }

    const prevMonthButton = page.getByRole("button", { name: "Previous Month" });
    if (await prevMonthButton.isVisible()) {
      await prevMonthButton.click();
    } else {
      break;
    }
  }
}

async function openBulkEditDialog(page: Page) {
  // Wait for the table to finish loading to ensure we select an actual transaction
  await expect(page.getByText("Loading transactions...")).not.toBeVisible();

  // select transaction
  const firstRow = page.locator("tbody tr").first();
  const checkbox = firstRow.locator(".peer");
  
  if (!(await checkbox.isChecked())) {
    await checkbox.click();
  }
  
  // confirm transaction is selected
  await expect(checkbox).toBeChecked();
  // open dialog for bulk editing
  await page.getByRole("button", { name: /Bulk Edit \(\d+\)/ }).click();

  // confirm dialog is visible
  const dialog = page.getByRole("dialog", { name: "Bulk Edit Transactions" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeBulkEditDialog(page: Page, dialog: Locator) {
  // close dialog
  await dialog.getByRole("button", { name: "Done" }).click();
  
  // Ensure dialog is closed before proceeding to avoid state contamination
  await expect(dialog).toBeHidden();
  
  // unselect transaction - use a fresh locator and check visibility
  // to avoid errors if the table refreshed or page navigated during cleanup
  const firstRow = page.locator("tbody tr").first();
  const checkbox = firstRow.locator(".peer");
  
  if (await checkbox.isVisible()) {
    await checkbox.click();
    // confirm transaction is not selected if still on the same page
    if (await checkbox.isVisible()) {
      await expect(checkbox).not.toBeChecked();
    }
  }
}

export async function createMetadata(page: Page, type: MetadataType, name: string) {
  const dialog = await openBulkEditDialog(page);

  // switch to tab
  await page.getByRole("tab", { name: type }).click();

  // add new item
  await dialog.getByRole("button", { name: "add-button" }).click();
  // set item name and color
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("button", { name: "Green" }).click();
  
  // create item
  const saveButtonName = `Save ${type === "Categories" ? "category" : "tag"}`;
  await dialog.getByRole("button", { name: saveButtonName }).click();
  
  // confirm item was created
  await expect(dialog).toContainText(name);
  
  await closeBulkEditDialog(page, dialog);
}

export async function applyMetadata(page: Page, type: MetadataType, name: string) {
  const dialog = await openBulkEditDialog(page);
  
  // switch to tab
  await page.getByRole("tab", { name: type }).click();

  // search for item to ensure it's visible
  const searchInput = dialog.getByRole("textbox", {
    name: `Search ${type.toLowerCase()}...`,
  });
  await searchInput.clear();
  await searchInput.fill(name);

  // find the item row and click the action button
  const itemRow = dialog.locator("div.group").filter({ hasText: name });
  const actionButton = type === "Categories" 
    ? itemRow.getByRole("button", { name: "Set" })
    : itemRow.getByRole("button", { name: "Add" });
  
  await actionButton.click();
  
  await closeBulkEditDialog(page, dialog);
}

export async function verifyFirstTransactionMetadata(page: Page, type: MetadataType, name: string, shouldBePresent: boolean = true) {
  const firstRow = page.locator("tbody tr").first();
  const cellIndex = type === "Categories" ? 4 : 5; // Based on columns.tsx
  const cell = firstRow.locator("td").nth(cellIndex);
  
  if (shouldBePresent) {
    await expect(cell).toContainText(name);
  } else {
    await expect(cell).not.toContainText(name);
  }
}

export async function searchMetadata(page: Page, type: MetadataType, name: string) {
  const dialog = await openBulkEditDialog(page);
  
  // switch to tab
  await page.getByRole("tab", { name: type }).click();

  // search for item
  const searchInput = dialog.getByRole("textbox", {
    name: `Search ${type.toLowerCase()}...`,
  });
  await searchInput.click();
  await searchInput.fill(name);
  
  // confirm item was found
  await expect(dialog).toContainText(name);
  
  await closeBulkEditDialog(page, dialog);
}

export async function deleteMetadata(page: Page, type: MetadataType, name: string) {
  const dialog = await openBulkEditDialog(page);

  // switch to tab
  await page.getByRole("tab", { name: type }).click();

  // search for item
  const searchInput = dialog.getByRole("textbox", {
    name: `Search ${type.toLowerCase()}...`,
  });
  await searchInput.fill(name);

  // confirm item was found
  await expect(dialog).toContainText(name);
  // Target the specific item row and click its delete button
  const itemRow = dialog.locator("div.group").filter({ hasText: name });
  await itemRow.getByRole("button").last().click();

  // confirm delete by checking the item is gone from the list
  await expect(itemRow).toBeHidden();

  // clear search to ensure the text is gone from the dialog
  await searchInput.fill("");
  await expect(dialog).not.toContainText(name);
  
  await closeBulkEditDialog(page, dialog);
}

// Backward compatibility wrappers
export async function createCategory(page: Page, name: string) {
  return createMetadata(page, "Categories", name);
}

export async function searchForCategory(page: Page, name: string) {
  return searchMetadata(page, "Categories", name);
}

export async function deleteCategory(page: Page, name: string) {
  return deleteMetadata(page, "Categories", name);
}
