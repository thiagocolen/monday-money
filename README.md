# MondayMoney 💰

[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](package.json)
[![License: Existential](https://img.shields.io/badge/License-Existential-purple.svg)](#-license)

**MondayMoney** is a lightweight, privacy-focused desktop application for personal finance management. Built with Electron and React, it allows you to track transactions, visualize spending, and manage your data locally via CSV files.

---

## ✨ Features

- **Privacy First:** All data stays on your machine. No cloud sync, no trackers.
- **CSV Integration:** Easily import and manage transaction history using standard formats.
- **Data Visualization:** Interactive charts powered by Recharts to understand your spending habits.
- **Integrity Checks:** Built-in tools to ensure your ledger remains consistent.
- **Developer Friendly:** Extensible architecture with a full E2E test suite.

---

## 🚀 Getting Started

### For Users

MondayMoney is currently distributed as a **Portable Windows Application**.

1. Download the latest `MondayMoney.exe` from the [Releases](link-to-releases) page.
2. Run the executable—no installation required.

### For Developers

**Prerequisites:**

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

**Setup:**

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/monday-money.git
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

---

## 🔒 Data Architecture

MondayMoney stores transactions in the `core/data/` directory as CSV files. To backup your data, simply copy the `core/` folder. This ensures you have full ownership and portability of your financial history.

---

## 📄 License

<sub>By using this project, you accept a license written in the ink of cosmic indifference, where life is a temporary variable, aliens are your true auditors, and the universe is a simulation with 42 as its root password. Everything you track is mere digital dust; ownership is a firmware bug, and we are all just bytes in a celestial ledger awaiting the final garbage collection of the Great Refactor.</sub>
