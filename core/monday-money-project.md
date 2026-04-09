# MondayMoney Project

- name: MondayMoney

- description: finance web project

- structure:
  - web-interface/ (react app & backend modules)
    - backend/ (Node.js/TypeScript automation suite)
    - core/
      - data/ (stores all generated .csv files)
        - monthly-transactions.csv (stores all transactions from all owners)
        - monthly-transactions-category.csv (stores all categories for transactions)
        - binance-transaction-history.csv (stores all transactions from binance)
        - binance-deposit-withdraw-history.csv (stores all deposits and withdraws from binance)
        - binance-fiat-deposit-withdraw-history.csv (stores all fiat deposits and withdraws from binance)
      - protected/ (critical data protected from deletion)
        - monthly-transactions-category-bkp/ (timestamped backups of category data)
        - raw-statement-files/ (secure storage and source for processing)
          - thiago/
          - jessica/
          - nelio/
      - monday-money-project.md (this file)

- elements:
  - generated-csv-files (located in core/data/)
    - monthly-transactions.csv
      - should have the following columns and allowed values:
        - date: yyyy-mm-dd
        - description: description of the transaction (for chain-transactions, stores the hash)
        - amount: amount of the transaction in decimal format, e.g. -6264373.47 or 6264373.47
        - owner: thiago-nubank-account, thiago-nubank-credit-card, thiago-mercadopago-account, thiago-investment, jessica, nelio, seed-transaction
        - row-hash: sha256 hash of the entire row (excluding the hash itself)
      - the rows can be of two types:
        - transaction: a regular transaction row that was extracted and translated from source-statement-files
        - chain-transaction: (not editable, not shown in table)
          - date: the date of the last transaction from the same owner (or 26-01-01 for seed)
          - description: a sha256 hash (firstHash, secondHash, or seedHash)
          - amount: 0
          - owner: the identified owner or 'seed-transaction'
          - category: (stored in monthly-transactions-category.csv as 'chain-transaction')

    - monthly-transactions-category.csv
      - used to store user-assigned categories and tags for transactions and identify chain-transactions
      - columns:
        - transaction-hash: the row-hash of the transaction in monthly-transactions.csv
        - category: INCOME, HOUSE, ONLINE_SERVICES, HEALTH, SUPERMARKET, FOOD, TRANSPORTATION, INVESTMENTS, OTHERS, chain-transaction
        - tags: comma-separated strings for custom labels
        - row-hash: sha256 hash of the entire row (transaction-hash + "," + category + "," + tags)

    - binance-transaction-history.csv
      - should have the following columns:
        - User ID, Time, Account, Operation, Coin, Change, Remark, row-hash

    - binance-deposit-withdraw-history.csv
      - should have the following columns:
        - Time, Coin, Network, Amount, Fee, Address, TXID, Status, Type, row-hash

    - binance-fiat-deposit-withdraw-history.csv
      - should have the following columns:
        - Time, Method, Amount, Receive Amount, Fee, Status, Transaction ID, Type, row-hash

  - raw-statement-files (located in core/protected/raw-statement-files/)
    - csv-mercadopago-account-statement:
      - csv-file: @account_statement-\*.csv
        - csv separator is semicolon (`;`)
        - columns: RELEASE_DATE, TRANSACTION_TYPE, REFERENCE_ID, TRANSACTION_NET_AMOUNT, PARTIAL_BALANCE
        - translate: date(RELEASE_DATE), description(TRANSACTION_TYPE), amount(TRANSACTION_NET_AMOUNT)
        - destination-file: monthly-transactions.csv

    - csv-nubank-account-statement:
      - csv-file: @NU\_\*.csv
        - csv separator is comma (`,`)
        - columns: Data, Valor, Identificador, Descrição
        - translate: date(Data), description(Descrição), amount(Valor)
        - destination-file: monthly-transactions.csv

    - csv-nubank-credit-card-statement:
      - csv-file: @Nubank\_\*.csv
        - csv separator is comma (`,`)
        - columns: date, title, amount
        - translate: date(date), description(title), amount(amount)
        - destination-file: monthly-transactions.csv

    - csv-binance-transaction-history:
      - csv-file: @Binance-Transaction-History-\*.csv
        - csv separator is comma (`,`)
        - columns: User ID, Time, Account, Operation, Coin, Change, Remark
        - translate: all columns remain the same
        - destination-file: binance-transaction-history.csv

    - csv-binance-deposit-history:
      - csv-file: @Binance-Deposit-History-\*.csv
        - csv separator is comma (`,`)
        - columns: Time, Coin, Network, Amount, Address, TXID, Status
        - translate: all columns remain the same, Type is 'Deposit', Fee is 0
        - destination-file: binance-deposit-withdraw-history.csv

    - csv-binance-withdraw-history:
      - csv-file: @Binance-Withdraw-History-\*.csv
        - csv separator is comma (`,`)
        - columns: Time, Coin, Network, Amount, Fee, Address, TXID, Status
        - translate: all columns remain the same, Type is 'Withdraw'
        - destination-file: binance-deposit-withdraw-history.csv

    - csv-binance-fiat-deposit-history:
      - csv-file: @Binance-Fiat-Deposit-History-\*.csv
        - csv separator is comma (`,`)
        - columns: Time, Method, Deposit Amount, Receive Amount, Fee, Status, Transaction ID
        - translate: Deposit Amount(Amount) , all other columns remain the same, Type is 'Deposit'
        - destination-file: binance-fiat-deposit-withdraw-history.csv

    - csv-binance-fiat-withdraw-history:
      - csv-file: @Binance-Fiat-Withdraw-History-\*.csv
        - csv separator is comma (`,`)
        - columns: Time, Method, Withdraw Amount, Receive Amount, Fee, Status, Transaction ID
        - translate: Withdraw Amount(Amount), all other columns remain the same, Type is 'Withdraw'
        - destination-file: binance-fiat-deposit-withdraw-history.csv

    - csv-bradesco-account-statement:
      - csv-file: @"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$"
        - csv separator is semicolon (`;`)
        - ignore
          - everything before the first occurrence of `;;;;;`
          - everything after the second occurrence of `;;;;;`
        - columns: Data, Histórico, Docto., Crédito (R$), Débito (R$), Saldo (R$)
        - translate: date(Data), description(Histórico), amount(Crédito (R$) or Débito (R$))
          - amount is positive if Crédito (R$) is not empty
          - amount is negative if Débito (R$) is not empty
          - if both Crédito (R$) and Débito (R$) are empty, the row should be ignored
        - destination-file: monthly-transactions.csv

- features:
  - add/edit category:
    - allowing the user to click a transaction row in the web interface to assign/change a category.
    - categories are persisted in @core/data/monthly-transactions-category.csv.

  - add/edit tags:
    - allowing the user to click an "Edit Tags" action in the web interface to manage custom labels.
    - tags are comma-separated and persisted in @core/data/monthly-transactions-category.csv.

  - bulk edit categories:
    - select multiple transactions via checkboxes and update their category in one action.

  - category backup:
    - manual backup action via web interface that creates a timestamped copy of category data in `core/protected/monthly-transactions-category-bkp/`.
    - filename format: `monthly-transactions-category-YYYY-MM-DD-HH-MM-SS-bkp.csv`.

  - import raw statement files:
    - Dedicated "Import" page allowing selection of owner (existing or new) and multiple CSV files.
    - Automatic duplicate detection using filename check and content SHA256 hash comparison against the ledger's cryptographic chain.
    - Successful imports trigger the full automation pipeline (reset, seed, import, check) via the Vite dev server.
    - Import history table showing processed files, transaction counts, and timestamps.

  - financial dashboard:
    - Bar Chart: Daily transaction activity with conditional coloring (Green for positive, Red for negative).
    - Pie Chart - Label: Category distribution (amounts and percentages) with a detailed legend.
    - The Pie Chart is the default view.
    - Tabs to switch between activity and category views.

  - data navigation:
    - Monthly filtering with "Previous", "Next" controls.
    - Hover over the month label to reveal a "Current Month" reset action.
    - Search by description, filter by category, tags, or owner (in that order).
    - Interactive Charts: clicking a day in the bar chart filters the transaction list.

  - visual & integrity:
    - Loading states: Centralized "Processing..." overlay for tables and "Calculating..." overlay for charts.
    - Table Responsiveness: Description column uses dynamic shrink-to-fit logic to prevent horizontal overflow on smaller screens.
    - System rows (seed-transactions, chain-transactions) are hidden from the UI.
    - Dark/Light mode support.
    - Responsive design for mobile and desktop.
    - Standardized date parsing using `parseISO` to prevent timezone offsets.
    - Brazilian localization (pt-BR) for currency and date formats.

- web-interface:
  - technology-stack:
    - framework: React 19 (TypeScript) with Vite.
    - styling: Tailwind CSS v4 for utility-first design and modern CSS features.
    - component-library: shadcn/ui (Radix UI) providing accessible, high-quality primitives (Dialog, Tabs, Select, etc.).
    - charts: Recharts for interactive and responsive data visualization.
    - icons: Lucide React for consistent and crisp iconography.
    - notifications: Sonner for non-blocking toast feedback.
  - visual-branding:
    - Application Title: "Monday Money" (visible in browser tab).
    - Favicon: Custom branded icons for various devices (ICO, PNG, Apple Touch Icon).

- automation-routines (located in web-interface/backend/):
  - data-import-registration.ts:
    - description: extract and translate csv files from `core/protected/raw-statement-files/` to target destination files in `core/data/`
    - steps:
      - read all .csv files in `../core/protected/raw-statement-files/`
      - check for duplicates by comparing file content hash against ledger entries
      - translate based on owner-specific patterns
      - generate and append two chain-transaction rows (firstHash and secondHash) per file
      - update monthly-transactions-category.csv with chain-transaction tags (for monthly-transactions only)

  - create-seed-transaction.ts:
    - description: initialize target CSV files in `core/data/` with headers and seed chain-transactions
    - steps:
      - create files with headers
      - generate seed-transaction for each destination file
      - store seedHash in the destination file's description/remark column

  - reset-csv-files.ts:
    - description: clear all processed data and all protected statement files
    - steps:
      - remove all `.csv` files from `core/data/`
      - remove everything from `core/protected/raw-statement-files/`

  - clear-ledger.ts:
    - description: clear only the generated ledger CSV files in `core/data/` while preserving source files
    - steps:
      - remove all `.csv` files from `core/data/`

  - protect-files.ts:
    - description: set all files in `core/protected/` to read-only
    - steps:
      - recursively find all files in `core/protected/`
      - set file permissions to read-only

  - integrity-check.ts:
    - description: audits CSV files for tampering by verifying row hashes and cryptographic chaining
    - steps:
      - recalculate and compare SHA256 hashes for every row
      - verify the "Linked List" chain integrity for every owner batch

- overall-backend-architecture:
  - The Node.js/TypeScript suite implements a semi-automated ETL (Extract, Transform, Load) pipeline with a heavy focus on **Data Integrity**. By utilizing SHA256 hashing and a "Linked List" batching approach, the system ensures that any change to a historical transaction would break the chain, making tampering immediately detectable. The modular design prepares the system for a future desktop application transition.
