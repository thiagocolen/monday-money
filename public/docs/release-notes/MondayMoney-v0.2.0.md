# Release Notes - MondayMoney v0.2.0

**Version:** 0.2.0  
**Date:** 2026-04-08  
**Author:** MondayMoney Assistant  

## Description
This major update (v0.2.0) focuses on architectural robustness, enhanced data management, and the introduction of a comprehensive automated testing suite. We have transitioned to a more secure "Source of Truth" model for statement files and added advanced administrative controls to the web interface.

## Feature List

### 📂 Advanced Data Management
*   **Single Source of Truth:** Refactored the ETL pipeline to use `core/protected/raw-statement-files` as the primary source for both storage and processing, eliminating redundant staging areas.
*   **Granular Reset Control:** 
    *   `reset-csv-files.ps1` is now a "Factory Reset" (wipes everything).
    *   New `clear-ledger.ps1` script for safe ledger clearing while preserving original source files.
*   **Import History Analytics:** New aggregate indicators at the top of the Import History section showing the sum of **Total Rows**, **Imported**, and **Skipped** transactions across all statement files.
*   **File Deletion & Reprocessing:**
    *   Delete statement files directly from the UI with a secure confirmation dialog.
    *   Real-time **Reprocessing Logs** modal that shows PowerShell execution output during ledger rebuilds.
    *   Automatic backend sync: deleting a file triggers an immediate, safe re-run of the entire pipeline.

### 🧪 Automated Quality Assurance
*   **E2E Test Suite:** Implemented a full Playwright integration suite (10 scenarios) covering navigation, dashboard filtering, category editing, and the complete import-to-verification flow.
*   **Idempotent Testing:** Tests now automatically perform a data reset before each run to ensure consistency.
*   **CI Readiness:** Configured Playwright for sequential execution to handle local file-system dependencies reliably.

### 🎨 UI/UX Improvements
*   **Contextual Modals:** Replaced browser-native `confirm()` alerts with high-quality `shadcn/ui` Dialog components.
*   **Enhanced Feedback:** Improved loading spinners and dark-mode monospace logs for technical transparency.
*   **Filter Persistence:** Refined search and filter behavior across Transactions and Investments pages.

### 🔍 Technical Refinements
*   **Smart Deduplication:** Enhanced content-hash checking to prevent duplicate transaction entries even if files are renamed.
*   **Documentation Sync:** Fully updated `README.md` and `monday-money-project.md` to reflect the new architecture.
*   **Version Bump:** Incremented project version to 0.2.0.
