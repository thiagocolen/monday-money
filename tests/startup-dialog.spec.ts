import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Startup Dialog", () => {
  const exportFolderPath = path.join(__dirname, "export-folder");

  test.beforeEach(async ({ page }) => {
    // Reset settings to ensure the startup dialog appears
    execSync("npm run settings-reset");
    
    // Ensure the export folder exists
    if (!fs.existsSync(exportFolderPath)) {
      fs.mkdirSync(exportFolderPath, { recursive: true });
    }

    // Mock Electron bridge before navigation
    await page.addInitScript(() => {
      window.electron = {
        invoke: async (channel: string, ...args: any[]) => {
          if (channel === 'set-export-path') {
            localStorage.setItem('mock-export-path', args[0]);
            return { success: true };
          }
          if (channel === 'get-settings') {
            return { exportPath: localStorage.getItem('mock-export-path') || '' };
          }
          if (channel === 'get-csv-data') {
            return ""; // Return empty CSV to prevent load error
          }
          if (channel === 'get-metadata') {
            return { categories: [], tags: [] };
          }
          return { success: true }; // Default for other calls
        }
      };
    });

    await page.goto("http://localhost:5173");
    // Clear mock storage at start of each test
    await page.evaluate(() => localStorage.removeItem('mock-export-path'));
    // Reload to ensure the empty state is picked up
    await page.reload();
  });

  test("should configure export path on first run", async ({ page }) => {
    // 1. Verify dialog is visible
    const welcomeDialog = page.getByRole("dialog", { name: "Welcome to MondayMoney" });
    await expect(welcomeDialog).toBeVisible();

    // 2. Configure the export path
    // The user specifically asked for @tests\export-folder
    // We'll use the absolute path to that folder for the test to be realistic
    await page.getByLabel("Export Folder Path").fill(exportFolderPath);
    
    // 3. Click Get Started
    await page.getByRole("button", { name: "Get Started" }).click();

    // 4. Verify the dialog is closed and we are on the main page
    // Note: The app reloads after configuration
    await expect(welcomeDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();
    
    // 5. Verify the setting was saved by checking the Backup page
    const navLink = page.getByRole("link", { name: "Backup" });
    await navLink.click();
    
    // Wait for Backup page to load
    await expect(page.getByRole("heading", { name: "Data Management" })).toBeVisible();
    
    // Check if the path is displayed correctly in the Backup page
    const backupPathInput = page.getByLabel("Backup Folder Path");
    await expect(backupPathInput).toHaveValue(exportFolderPath);
  });
});
