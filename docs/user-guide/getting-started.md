# Getting Started

MondayMoney is designed to be simple to set up and use. Currently, it is distributed as a **Portable Windows Application**.

## Installation

1. Go to the [Releases](https://github.com/thiagocolen/monday-money/releases) page on GitHub.
2. Download the latest `MondayMoney-vX.Y.Z.exe`.
3. Move the executable to a folder where you want to keep your data (e.g., `Documents/MondayMoney`).
4. Run the executable.

!!! note
    Since the application is not signed, Windows might show a "Windows protected your PC" warning. Click on **More info** and then **Run anyway**.

## First Run

When you first open MondayMoney, it will create a `core/` directory in the same folder as the executable. This directory contains your database (CSV files) and configurations.

- `core/data/`: Contains your transaction history.
- `core/protected/`: Contains internal configuration and backup data.

## Basic Usage

1. **Dashboard:** View your overall financial health and recent transactions.
2. **Transactions:** List of all your recorded transactions. You can filter, search, and edit them here.
3. **Import:** This is where you bring in data from your bank. See the [Importing Data](imports.md) guide for more details.
