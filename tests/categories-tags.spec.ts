import { test } from "@playwright/test";
import {
  importRawCSV,
  deleteImportedRawCSV,
  searchForTransaction,
  createMetadata,
  applyMetadata,
  verifyFirstTransactionMetadata,
  deleteMetadata,
} from "./test-utils";

// Tests in this file share state (the backend) and must run serially
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

test("rule: a transaction can have only one category", async ({ page }) => {
  const cat1 = `CAT1-${Date.now()}`;
  const cat2 = `CAT2-${Date.now()}`;

  // Create both categories
  await createMetadata(page, "Categories", cat1);
  await createMetadata(page, "Categories", cat2);

  // Apply first category
  await applyMetadata(page, "Categories", cat1);
  await verifyFirstTransactionMetadata(page, "Categories", cat1, true);

  // Apply second category - should replace the first
  await applyMetadata(page, "Categories", cat2);
  await verifyFirstTransactionMetadata(page, "Categories", cat2, true);
  await verifyFirstTransactionMetadata(page, "Categories", cat1, false);

  // Cleanup
  await deleteMetadata(page, "Categories", cat1);
  await deleteMetadata(page, "Categories", cat2);
});

test("rule: a transaction can have many tags", async ({ page }) => {
  const tag1 = `TAG1-${Date.now()}`;
  const tag2 = `TAG2-${Date.now()}`;

  // Create both tags
  await createMetadata(page, "Tags", tag1);
  await createMetadata(page, "Tags", tag2);

  // Apply first tag
  await applyMetadata(page, "Tags", tag1);
  await verifyFirstTransactionMetadata(page, "Tags", tag1, true);

  // Apply second tag - should append to the first
  await applyMetadata(page, "Tags", tag2);
  await verifyFirstTransactionMetadata(page, "Tags", tag2, true);
  await verifyFirstTransactionMetadata(page, "Tags", tag1, true);

  // Cleanup
  await deleteMetadata(page, "Tags", tag1);
  await deleteMetadata(page, "Tags", tag2);
});
