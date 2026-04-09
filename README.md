# MondayMoney Documentation

## What it is
MondayMoney is a personal finance web application designed to consolidate, track, and categorize financial transactions from various sources. It offers a secure, offline-first approach to managing personal finances, with an emphasis on data integrity. The system consists of a Node.js/TypeScript ETL (Extract, Transform, Load) pipeline for processing raw banking and exchange statements, and a modern React web interface for data visualization and categorization.

## How to use it
1.  **Data Extraction:** Export your transaction statements (CSV format) from your supported banks (e.g., Nubank, Bradesco, Mercado Pago) or exchanges (Binance).
2.  **Importing:** 
    *   **Option A (Web UI - Recommended):** Use the new **Import** page in the web interface to select an owner and upload your CSV files. The system will automatically verify integrity and process them.
    *   **Option B (Manual Staging):** Place these raw statement files into the appropriate owner's directory within `core/protected/raw-statement-files/` (e.g., `core/protected/raw-statement-files/thiago/`) and run the processing scripts manually.
3.  **Processing:** If using Option B, run `npm run data-reset`.
4.  **Visualization:** Start the web interface (`npm run dev` in the `web-interface` folder) to view your dashboard.
5.  **Categorization:** Use the web interface to assign categories to your transactions individually or in bulk. Categorization changes are saved locally to `monthly-transactions-category.csv`.

## Folder Structure
-   `backend/`: Node.js/TypeScript logic for the ETL pipeline.
-   `core/`: Contains the data.
    -   `data/`: Stores the processed, normalized `.csv` files used by the web application.
    -   `protected/`: Secure storage for critical data.
        -   `monthly-transactions-category-bkp/`: Timestamped backups of user-assigned categories.
        -   `raw-statement-files/`: Secure storage and source for original, raw statement files.
-   `src/`: The React-based frontend application.

## Scripts
The Node.js automation suite located in `backend/` handles the data pipeline:
-   `data-import-registration.ts`: The primary ETL script. It reads CSV files from `core/protected/raw-statement-files/`, maps their varied columns to a standardized format, checks for duplicates using hashing, calculates cryptographic chains to ensure integrity, and appends the data to the destination files in `core/data/`.
-   `create-seed-transaction.ts`: Initializes the target CSV files (if missing) with headers and a secure "seed" chain-transaction to start the cryptographic chain.
-   `reset-csv-files.ts`: A destructive script used for a clean slate. It deletes all processed data and all protected statement files.
-   `protect-files.ts`: A utility script that recursively sets all files in the `core/protected/` directory to read-only, providing an extra layer of protection for original statement files and backups.
-   `integrity-check.ts`: A data validation script that audits all CSV files in `core/data/` for tampering. It recalculates row-level SHA256 hashes and verifies the cryptographic "Linked List" chain per owner, ensuring data remains unaltered.

## Web Interface
The web interface is a fast, responsive dashboard built with React 19, TypeScript, and Vite.
-   **Dashboard:** Features interactive Recharts (Bar Charts for daily activity, Pie Charts for category distribution).
-   **Data Navigation:** Allows filtering by month, day, owner, and category, alongside a global search.
-   **Categorization:** Click on rows to assign a category via a dialog, or use checkboxes for bulk updates.
-   **Tags:** Manage custom comma-separated labels for transactions via a dedicated "Edit Tags" action.
-   **Visual Branding:** Branded as "Monday Money" with custom favicons and a consistent professional aesthetic.
-   **Data Integrity:** System reserved "chain-transaction" rows are automatically filtered out from the UI. The backend maintains cryptographic verification using a `row-hash` that includes transaction data, category, and tags.
-   **Styling:** Styled with Tailwind CSS v4 and utilizes `shadcn/ui` components for a modern, accessible user experience (supporting both light and dark modes).

## Data Flow
1.  **Raw Data:** Financial institutions provide CSV statements.
2.  **Staging:** Files are dropped into `core/protected/raw-statement-files/[owner]/`.
3.  **ETL Pipeline:** Node.js backend scripts parse the CSVs.
4.  **Normalization:** Columns are standardized (e.g., date formats, amount decimals).
5.  **Integrity Layer:** SHA256 hashes are generated for each row, and a "Linked List" structure (chain-transactions) is created to guarantee that historical data is not altered.
6.  **Storage:** Normalized data is appended to `core/data/*.csv`.
7.  **Frontend Consumption:** The React app reads the CSV files via an internal API abstraction to render the UI.
8.  **User Input:** User-assigned categories from the UI are written back to `core/data/monthly-transactions-category.csv`.

## Database Schema (CSV based)
The primary "database" consists of plain text CSV files:
-   `monthly-transactions.csv`: `date`, `description`, `amount`, `owner`, `row-hash`
-   `monthly-transactions-category.csv`: `transaction-hash`, `category`, `row-hash`
-   `binance-transaction-history.csv`: `User ID`, `Time`, `Account`, `Operation`, `Coin`, `Change`, `Remark`, `row-hash`
-   `binance-deposit-withdraw-history.csv`: `Time`, `Coin`, `Network`, `Amount`, `Fee`, `Address`, `TXID`, `Status`, `Type`, `row-hash`
-   `binance-fiat-deposit-withdraw-history.csv`: `Time`, `Method`, `Amount`, `Receive Amount`, `Fee`, `Status`, `Transaction ID`, `Type`, `row-hash`

Categories supported: `INCOME`, `HOUSE`, `ONLINE_SERVICES`, `HEALTH`, `SUPERMARKET`, `FOOD`, `TRANSPORTATION`, `INVESTMENTS`, `OTHERS`, and `chain-transaction` (system reserved).

## API
The application operates locally without a traditional backend server. The "API" layer in the React application (`lib/api.ts`) contains asynchronous functions that interface directly with the local file system (through Vite's dev server middleware) to read CSV data and write category updates or backups.

## Tests
Currently, the primary testing mechanism is data integrity verification and a Playwright E2E suite. The cryptographic chaining (SHA256) ensures that any manual tampering with historical CSV data breaks the chain, which can be audited via scripts. 

## Deployment
MondayMoney is designed as a local, offline-first application for personal privacy.
-   **Requirements:** Node.js (for the web interface and backend).
-   **Execution:** Run `npm run dev` in the `web-interface` folder to start the application locally.
-   *Note: Because it writes to the local file system for categories, it is not currently intended to be hosted on static web hosts (like Vercel or Netlify) without an accompanying backend service.*

## Maintenance
-   **Backups:** Regularly use the "Backup Categories" button in the UI to safeguard your manual categorization work. Store your `protected/raw-statement-files/` securely.
-   **Updates:** When financial institutions change their CSV export formats, the parsing logic within `backend/data-import-registration.ts` must be updated to match the new headers or delimiters.

## Troubleshooting
-   **Transactions not showing:** Ensure the raw CSV file was placed in the correct owner folder and matches the naming pattern expected by `data-import-registration.ts`.
-   **Encoding Issues:** If descriptions appear with strange characters, ensure the source CSV was downloaded in UTF-8 encoding. The Node.js scripts attempt to force UTF-8 processing.
-   **Data Corruption:** If the application state seems invalid, run `npm run data-reset` to rebuild the entire database from the raw protected files. Note that this preserves your categories as long as you haven't deleted the category file.

## Best Practices
-   **Never delete raw statements:** Always keep a copy in `core/protected/raw-statement-files/` to allow for full database rebuilds.
-   **Regular Backups:** Frequently backup your categorization file.
-   **Review Unknown Patterns:** The backend scripts will warn if a file pattern is unknown. Inspect the console output when running imports.

## Limitations
-   **Local Only:** Designed for local execution; no multi-device sync out-of-the-box unless the file system is synced (e.g., via Google Drive/Dropbox).
-   **Format Fragility:** Tightly coupled to the exact CSV export formats of specific banks. Bank updates will require script maintenance.
-   **Performance:** Parsing large CSV files on the fly might become slower as years of data accumulate.

## Future Features
-   Transformation into a standalone Desktop application (Electron/Tauri).
-   Support for more banks and credit card providers.
-   Customizable budgeting goals and alerts.
-   More granular analytics and custom date range pickers.
-   Automated integrity check UI dashboard.

## Known Issues
-   Financial institutions occasionally change their CSV column headers or delimiters without notice, which will cause the import script to skip those files until updated.
-   Timezone conversions on dates from different banks may require strict ISO parsing to prevent off-by-one-day errors.

## Dependencies
-   **Frontend:** React 19, Vite, Tailwind CSS v4, shadcn/ui (Radix UI), Recharts, date-fns, lucide-react, sonner.
-   **Backend/Data:** Node.js, `tsx` (for script execution), `papaparse` (for server-side CSV parsing).

## Requirements
-   Node.js installed (v18+ recommended).
-   Any modern OS (Windows, macOS, Linux).
