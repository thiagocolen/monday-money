# Release Notes - MondayMoney v0.3.0

**Version:** 0.3.0  
**Date:** 2026-04-08  
**Author:** MondayMoney Assistant  

## Description
This major update (v0.3.0) marks a significant architectural shift towards a unified, cross-platform ready codebase. We have consolidated the entire project structure and replaced the legacy PowerShell ETL pipeline with a high-performance, modular Node.js/TypeScript backend. This prepares MondayMoney for its next evolution into a standalone desktop application.

## Feature List

### 🏗️ Workspace Consolidation
*   **Unified Structure:** The `core` data directory has been moved inside the `web-interface` folder, creating a single, self-contained project root.
*   **Path Resolution:** All internal references, API endpoints, and configuration files have been updated to resolve paths relative to the new consolidated structure.

### 🚀 Node.js Backend Migration
*   **PowerShell Deprecation:** The entire PowerShell automation suite (`.ps1` scripts) has been retired and deleted.
*   **TypeScript ETL Pipeline:** Reimplemented all data processing logic in pure TypeScript (`backend/` directory):
    *   `data-import-registration.ts`: Enhanced ETL engine using `papaparse` for server-side processing.
    *   `create-seed-transaction.ts`: Cryptographically secure ledger initialization.
    *   `integrity-check.ts`: Audits ledger row hashes and cryptographic chaining.
    *   `clear-ledger.ts`, `reset-csv-files.ts`, `protect-files.ts`: Automated data management utilities.
*   **Vite Integration:** The Vite dev server now executes these Node.js modules directly via TypeScript, removing external shell dependencies and improving performance.

### 🧪 Enhanced Reliability
*   **E2E Test Stability:** Fixed a critical race condition where Vite reloads would clear UI toasts during imports. The `core` directory is now ignored by the Vite watcher.
*   **Path Correction:** Updated the Playwright test suite to reflect the consolidated folder structure.
*   **Full Pipeline Validation:** Verified the complete "Reset -> Seed -> Import -> Integrity Check" flow with the new Node.js engine.

### 🔍 Technical Refinements
*   **Cross-Platform Ready:** By removing PowerShell, the ETL pipeline is now fully compatible with macOS and Linux.
*   **Desktop App Foundation:** The modular backend design allows for direct integration with Electron IPC or Tauri commands in future versions.
*   **Documentation Sync:** Fully updated `README.md` and `monday-money-project.md` to reflect the Node.js architecture.
*   **Version Bump:** Incremented project version to 0.3.0.

## How to Run
1.  **Install Dependencies:** `npm install` (now includes `tsx` and `papaparse` for backend).
2.  **Start Dev Server:** `npm run dev`.
3.  **Reset/Import Data:** `npm run data-reset`.
4.  **Run Tests:** `npm test`.