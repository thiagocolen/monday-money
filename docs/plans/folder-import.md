# Implementation Plan: Folder-based CSV Import

## Overview
Replace the manual file upload import process with an automated folder-based approach. Users will configure a root folder, and the application will scan its subfolders (representing owners) for CSV files to import.

## Technical Architecture

### 1. Settings Management
- **File:** `backend/utils.ts`
- **Action:** Update `getSettings` and `saveSettings` to include `rawCsvFolderPath`.
- **Action:** Update `ensureCoreStructure` to ensure any new required directories exist.

### 2. Backend Logic: Folder Scanner
- **New File:** `backend/folder-import.ts` (or integrate into `data-import-registration.ts`)
- **Logic:**
    - Read `rawCsvFolderPath` from settings.
    - Iterate through first-level directories of `rawCsvFolderPath`. Each directory name is an `owner`.
    - Within each owner directory, find all `.csv` files.
    - For each file:
        - Check if it has already been imported (using file hash or filename tracking).
        - If new, use existing `PARSERS` from `data-import-registration.ts` to parse and import transactions.
        - Move/copy the file to the `protected/raw-statement-files` directory (as the current manual import does).

### 3. API Bridge
- **File:** `src/lib/api.ts`
- **New Functions:**
    - `getRawCsvFolderPath()`: Fetches the configured path.
    - `setRawCsvFolderPath(path: string)`: Saves the new path.
    - `scanFolder()`: Triggers the backend scanning process.

### 4. UI Components

#### Startup Dialog
- **File:** `src/components/StartupDialog.tsx`
- **Changes:**
    - Add a new input field and "Browse" button for "Raw CSV Folder Path".
    - Update the `handleSave` logic to persist both the export path and the raw CSV path.

#### Import Page
- **File:** `src/pages/ImportPage.tsx`
- **Changes:**
    - **Remove:** The file dropzone and manual owner selection for new imports.
    - **Add:** A configuration section showing the current `rawCsvFolderPath` with a "Change" button and a "Scan Folder" button.
    - **Update Table:** Enhance the `Import History` table with:
        - **Search Filter:** Filter by filename.
        - **Owner Filter:** A multi-select or dropdown filter for owners.
        - **Sorting:** Enable sorting on all columns (Date, Filename, Owner, Transactions).

## Implementation Steps

### Phase 1: Backend & API
1. [ ] Update settings schema and utils.
2. [ ] Implement the folder scanning logic.
3. [ ] Expose new API endpoints.

### Phase 2: UI Foundation
1. [ ] Update `StartupDialog` to collect the new path.
2. [ ] Update `ImportPage` layout to show the folder path and scan button.

### Phase 3: Table Enhancements
1. [ ] Implement sorting in the `Import History` table.
2. [ ] Add search and owner filters to the table.

### Phase 4: Validation
1. [ ] Verify manual import history is still visible.
2. [ ] Test folder scanning with various owners and file formats.
3. [ ] Ensure no regressions in transaction processing.
