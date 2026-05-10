# Implementation Plan: Folder-based CSV Import

## Overview
Replace the manual file upload import process with an automated folder-based approach. Users will configure a root folder, and the application will scan its subfolders (representing owners) for CSV files to import.

## Functional Changes
### 1. New Import Process
- **Root Folder Configuration:** Add a setting for `raw_csv_folder_path`.
- **Owner Mapping:** The first level of sub-folders under the root will be treated as the transaction "owner".
- **Scanning:** Implement logic to scan the root folder and identify .csv files within owner sub-folders.
- **Import History:** The `Import History` table will show all processed files, regardless of whether they were manually uploaded (previous system) or found in the folder.

### 2. UI Updates
- **Startup Dialog:**
    - Add a configuration field for the `raw csv files folder path`.
- **Import Page:**
    - Remove the "Import New File" dropzone/area.
    - Replace it with a configuration input/button for the `raw csv files folder path`.
    - Enhance the `Import History` table:
        - Add a search filter.
        - Add an owner filter.
        - Enable sorting on all columns.

## Technical Tasks
- [ ] Update backend settings to store `raw_csv_folder_path`.
- [ ] Implement a file system crawler in the backend (Electron) to detect new CSV files.
- [ ] Modify the import logic to use the sub-folder name as the owner.
- [ ] Refactor `ImportPage.tsx` to remove the file dropzone and add the folder path setting.
- [ ] Update `StartupDialog.tsx` to include the new configuration.
- [ ] Enhance the data table component or usage in `ImportPage` to support filters and sorting.
