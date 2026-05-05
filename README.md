# MondayMoney 💰

[![Version](https://img.shields.io/badge/version-0.5.10-blue.svg)](package.json)
[![License: Existential](https://img.shields.io/badge/License-Existential-purple.svg)](#-license)

**MondayMoney** is a lightweight, privacy-focused desktop application for personal finance management. Built with Electron and React, it allows you to track transactions, visualize spending, and manage your data locally via CSV files.

---

## ✨ Features

- **Privacy First:** All data stays on your machine. No cloud sync, no trackers.
- **Data Security:** Enforced internal data storage with full `.zip` system backups.
- **CSV Integration:** Easily import and manage transaction history using standard formats (supports Binance, Nubank, and generic CSVs).
- **Data Visualization:** Interactive charts powered by Recharts to understand your spending habits.
- **Integrity Checks:** Built-in tools to ensure your ledger remains consistent.
- **Developer Friendly:** Extensible architecture with a full E2E test suite.

---

## 🚀 Getting Started

### For Users

Welcome to MondayMoney! This application is designed to give you complete control over your financial data. Here is a quick tour of your new financial hub:

#### 1. The First Launch
MondayMoney is distributed as a **Portable Windows Application**. Download the latest `MondayMoney.exe` from the Releases page and run it. 

On your very first run, you will be greeted by the **Startup Dialog**. Because your privacy and data security are our top priorities, the app requires you to configure an **Export Folder**. This is a safe location on your computer (like `C:\Backups\MondayMoney`) where the application will save your `.zip` backup files. 

*Got an old backup?* The Startup Dialog also gives you a quick option to import an existing `.zip` file right away to restore your previous state!

#### 2. Importing Your Data
Once configured, head over to the **Import** page from the top navigation. 
Here you can drag and drop your bank statements (CSVs). MondayMoney currently supports specific formats (like Binance and Nubank) as well as generic statement structures. The app automatically processes these files, removes duplicates, and securely stores the raw data internally.

#### 3. Categorizing and Visualizing
Now, visit the **Transactions** page. This is your command center.
- **Visualize:** Toggle between Monthly and Yearly views to see beautiful charts of your spending and income.
- **Categorize:** Select transactions and use the **Bulk Edit** feature to assign custom categories and colorful tags.
- **Filter:** Use the powerful multi-layer filter system to drill down into specific owners, tags, categories, or search terms.

#### 4. Managing Your Data (Backups!)
Your actual data lives safely inside the application's internal storage (`%APPDATA%/MondayMoney/core` on Windows). 

When you want to secure your progress, navigate to the **Backup** page. 
- Click **Export All Data** to generate a complete `.zip` archive of your ledger, tags, categories, and settings in your configured Export Folder.
- **Starting Fresh:** If you ever want to wipe the slate clean, the Backup page features a "Danger Zone" where you can permanently reset all application data.

Enjoy taking back control of your money!

### For Developers

**Prerequisites:**

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

**Setup:**

1. Clone the repository:

   ```bash
   git clone https://github.com/thiagocolen/monday-money.git
   cd monday-money
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🛠️ Tech Stack

- **Runtime:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS 4](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/), [Shadcn/UI](https://ui.shadcn.com/)
- **Charts:** [Recharts](https://recharts.org/)
- **Data Parsing:** [PapaParse](https://www.papaparse.com/)
- **Testing:** [Playwright](https://playwright.dev/)

---

## 🧪 Maintenance & Tools

The project includes specialized scripts to maintain data health:

- **`npm run integrity-check`**: Validates the consistency of your local CSV files.
- **`npm run data-reset`**: Wipes current data and creates a fresh seed transaction.
- **`npm run protect-files`**: Sets local data files to a protected state.
- **`npm run test`**: Executes the full E2E test suite via Playwright.
- **`npm run test:file`**: Executes a single test file via Playwright in headed mode.

---

## 🔒 Data Architecture

MondayMoney enforces internal data storage for security and consistency. 
- In **Production**, data is stored in the system's user data directory (e.g., `%APPDATA%/MondayMoney/core`).
- In **Development**, data is stored in the `core/` directory at the project root.

Users manage their data portability via the **Backup Page**, which creates and restores full `.zip` archives of the internal state.

---

## 📄 License

<sub>By using this project, you accept a license written in the ink of cosmic indifference, where life is a temporary variable, aliens are your true auditors, and the universe is a simulation with 42 as its root password. Everything you track is mere digital dust; ownership is a firmware bug, and we are all just bytes in a celestial ledger awaiting the final garbage collection of the Great Refactor.</sub>
