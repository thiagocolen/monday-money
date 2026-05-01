# Developer Setup

Welcome! We appreciate your interest in contributing to MondayMoney. Follow these steps to get your development environment ready.

## Prerequisites

- **Node.js:** v20 or higher is recommended.
- **npm:** or your preferred package manager (yarn, pnpm).
- **Git:** For version control.

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/thiagocolen/monday-money.git
   cd monday-money
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Initialize data:**
   ```bash
   npm run data-reset
   ```
   This will create the necessary `core/` folder with seed data.

## Running the Application

### Development Mode
To start the application in development mode with hot-reloading:
```bash
npm run dev
```

### Web Mode
If you want to test the UI in a standard browser without Electron features:
```bash
npm run dev:web
```
*Note: Some features like file system access will not work in web mode.*

## Building for Production
To package the application for distribution:
```bash
npm run build
```
The output will be located in `release/${version}/`.
