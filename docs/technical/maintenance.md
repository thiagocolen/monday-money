# Maintenance Tools

The project includes specialized scripts to maintain data health and ensure the reliability of the application.

## Integrity Checks
Run `npm run integrity-check` to validate the consistency of your local CSV files. This script checks for:
- Missing required columns.
- Invalid date formats.
- Negative amounts where they shouldn't be.
- Duplicate transaction IDs.

## Data Reset
For development purposes, you can use `npm run data-reset`.
- **Caution:** This will wipe your current data and replace it with a fresh seed transaction.
- It's useful when you want to start from a clean state or test the initial setup.

## File Protection
The `npm run protect-files` script sets your local data files to a "read-only" or "protected" state at the OS level to prevent accidental modifications by other programs or manual errors.

## Backend Scripts
Most of these tools are located in the `backend/` directory and are written in TypeScript, executed via `tsx`.
- `backend/integrity-check.ts`
- `backend/reset-csv-files.ts`
- `backend/protect-files.ts`
