import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { importRawCSV, searchForTransaction } from "./test-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Backup and Restore", () => {
  const exportFolderPath = path.join(__dirname, "export-folder-br");
  let currentZipPath = "";

  test.beforeEach(async ({ page }) => {
    execSync("npm run settings-reset");
    execSync("npm run data-reset");
    
    if (!fs.existsSync(exportFolderPath)) {
      fs.mkdirSync(exportFolderPath, { recursive: true });
    }

    // Clean up old zips in the export folder
    const files = fs.readdirSync(exportFolderPath);
    for (const file of files) {
      if (file.endsWith(".zip")) {
        fs.unlinkSync(path.join(exportFolderPath, file));
      }
    }

    // Mock the prompt for directory and zip selection globally
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      if (msg.includes("Enter absolute path to directory")) {
        await dialog.accept(exportFolderPath);
      } else if (msg.includes("Enter absolute path to zip file")) {
        await dialog.accept(currentZipPath);
      } else {
        await dialog.dismiss();
      }
    });

    await page.goto("http://localhost:5173");
    
    // Configure export path in startup dialog
    const welcomeDialog = page.getByRole("dialog", { name: "Welcome to MondayMoney" });
    if (await welcomeDialog.isVisible()) {
      await page.getByLabel("Export Folder Path").fill(exportFolderPath);
      
      // Click and wait for the dialog to disappear.
      await page.getByRole("button", { name: "Get Started" }).click();
      await expect(welcomeDialog).toBeHidden();
    }
  });

  test("should backup data, reset, and restore from zip", async ({ page }) => {
    // 1. Import some data
    await importRawCSV(page);
    
    // Verify data is present in Transactions page (must search for the correct month)
    await searchForTransaction(page);
    await expect(page.locator("tbody")).toContainText("test");

    // 2. Go to Backup page and export
    await page.getByRole("link", { name: "Backup" }).click();
    await expect(page.getByRole("heading", { name: "Data Management" })).toBeVisible();
    
    const exportButton = page.getByRole("button", { name: "Export All Data" });
    await exportButton.click();
    
    // Wait for toast success
    await expect(page.getByText(/Backup created:/)).toBeVisible({ timeout: 15000 });
    
    // Verify file exists on disk
    const files = fs.readdirSync(exportFolderPath).filter(f => f.endsWith(".zip"));
    expect(files.length).toBe(1);
    const zipPath = path.join(exportFolderPath, files[0]);

    // 3. Reset application
    await page.getByRole("button", { name: "Reset App" }).click();
    await page.getByRole("button", { name: "Yes, Reset Everything" }).click();
    
    // App should reload and show startup dialog
    const welcomeDialog = page.getByRole("dialog", { name: "Welcome to MondayMoney" });
    await expect(welcomeDialog).toBeVisible();

    // 4. Restore from zip in startup dialog
    currentZipPath = zipPath; // Set the path for the global listener
    await page.getByRole("button", { name: "Import .zip Backup" }).click();
    await expect(page.getByText("Backup restored successfully")).toBeVisible();

    // 5. Complete startup (must set path again after reset)
    await page.getByLabel("Export Folder Path").fill(exportFolderPath);
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(welcomeDialog).toBeHidden();

    // 6. Verify data is back
    await searchForTransaction(page);
    await expect(page.locator("tbody")).toContainText("test");
  });
});
