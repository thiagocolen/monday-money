import { test, expect, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tests in this file share state (the backend) and must run serially
test.describe.configure({ mode: "serial" });

async function importRawCSV(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.getByRole("link", { name: "Import" }).click();
  await page.getByRole("button", { name: "Create New" }).click();
  await page
    .getByRole("textbox", { name: "e.g. jessica-account" })
    .fill("test");

  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "tags-categories",
    "Nubank_2026-01-09.csv",
  );
  await page
    .getByRole("button", { name: "Choose File" })
    .setInputFiles(fixturePath);
  await page.getByRole("button", { name: "Import 1 File(s)" }).click();
  await expect(page.locator("tbody")).toContainText("Nubank_2026-01-09.csv");
  await expect(page.locator("tbody")).toContainText("28");
  await expect(page.locator("tbody")).toContainText("28");
}

async function deleteImportedRawCSV(page: Page) {
  await page.goto("http://localhost:5173/");
  await page.getByRole("link", { name: "Import" }).click();
  await expect(page.locator("tbody")).toContainText("Nubank_2026-01-09.csv");
  await page
    .getByRole("row", { name: "Nubank_2026-01-09.csv" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Remove and Reprocess" }).click();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByRole("main")).toContainText(
    "No import history found.",
  );
}

async function searchForTransaction(page: Page, minTransactions: number = 1) {
  await page.goto("http://localhost:5173/");

  for (let i = 0; i < 24; i++) {
    // Wait for the table to finish loading
    await expect(page.getByText("Processing...")).not.toBeVisible();

    // Check if we have actual transaction rows
    const transactionCount = await page
      .locator("tbody tr")
      .filter({ hasNotText: "No results." })
      .count();
    if (transactionCount >= minTransactions) {
      break;
    }

    await page.getByRole("button", { name: "Previous Month" }).click();

    // Slight wait to allow React to trigger the loading state on month change
    await page.waitForTimeout(200);
  }
}

async function createCategory(page: Page, name: string) {
  // select transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // confirm transaction is selected
  await expect(page.locator("tbody tr").first().locator(".peer")).toBeChecked();
  // open dialog for bulk editing
  await page.getByRole("button", { name: "Bulk Edit (1)" }).click();

  const dialog = page.getByLabel("Bulk Edit Transactions");
  await expect(dialog).toBeVisible();

  // add new category
  await dialog.getByRole("button", { name: "add-button" }).click();
  // set category name and color
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("button", { name: "Green" }).click();
  // create category
  await dialog.getByRole("button", { name: "Save category" }).click();
  // confirm category was created
  await expect(dialog).toContainText(name);
  // close dialog
  await dialog.getByRole("button", { name: "Done" }).click();
  // unselect transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // confirm transaction is not selected
  await expect(
    page.locator("tbody tr").first().locator(".peer"),
  ).not.toBeChecked();
}

async function searchForCategory(page: Page, name: string) {
  // select transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // open dialog for bulk editing
  await page.getByRole("button", { name: "Bulk Edit (1)" }).click();

  const dialog = page.getByLabel("Bulk Edit Transactions");
  await expect(dialog).toBeVisible();

  // search for category
  const searchInput = dialog.getByRole("textbox", {
    name: "Search categories...",
  });
  await searchInput.click();
  await searchInput.fill(name);
  // confirm category was found
  await expect(dialog).toContainText(name);
  // close dialog
  await dialog.getByRole("button", { name: "Done" }).click();
  // unselect transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // confirm transaction is not selected
  await expect(
    page.locator("tbody tr").first().locator(".peer"),
  ).not.toBeChecked();
}

// todo: add a click on categorries tab

async function deleteCategory(page: Page, name: string) {
  // select transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // open dialog for bulk editing
  await page.getByRole("button", { name: "Bulk Edit (1)" }).click();

  // confirm dialog is visible
  const dialog = page.getByLabel("Bulk Edit Transactions");
  await expect(dialog).toBeVisible();

  // search for category
  const searchInput = dialog.getByRole("textbox", {
    name: "Search categories...",
  });
  await searchInput.fill(name);

  // confirm category was found
  await expect(dialog).toContainText(name);
  // Target the specific item row and click its delete button
  const categoryItem = dialog.locator("div.group").filter({ hasText: name });
  await categoryItem.getByRole("button").last().click();

  // confirm delete by checking the item is gone from the list
  await expect(categoryItem).toBeHidden();

  // clear search to ensure the text is gone from the dialog
  await searchInput.fill("");
  await expect(dialog).not.toContainText(name);
  // close dialog
  await dialog.getByRole("button", { name: "Done" }).click();

  // unselect transaction
  await page.locator("tbody tr").first().locator(".peer").click();
  // confirm transaction is not selected
  await expect(
    page.locator("tbody tr").first().locator(".peer"),
  ).not.toBeChecked();
}

test.only("create, search and delete a category", async ({ page }) => {
  await importRawCSV(page);
  const category_name = `CAT-TEST-${Date.now().toString()}`;
  await searchForTransaction(page, 10);
  await createCategory(page, category_name);
  await searchForCategory(page, category_name);
  await deleteCategory(page, category_name);
  await deleteImportedRawCSV(page);
});
