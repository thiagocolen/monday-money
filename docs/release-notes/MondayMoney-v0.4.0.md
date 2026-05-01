# Release Notes - MondayMoney v0.4.0

**Version:** 0.4.0  
**Date:** 2026-04-09  
**Author:** MondayMoney Assistant  

## Description
This landmark update (v0.4.0) transforms MondayMoney from a web-based utility into a standalone **Desktop Application** using the Electron framework. By leveraging the modular Node.js backend established in v0.3.0, the application now runs natively on the desktop with direct access to local files and a dedicated system window.

## Feature List

### 🖥️ Electron Desktop Integration
*   **Standalone Shell:** The application now launches in its own dedicated window, removing the dependency on a standard web browser.
*   **Main Process Architecture:** Implemented a robust Electron Main Process (`electron/main.ts`) that manages the window lifecycle and executes backend logic natively.
*   **IPC Bridge:** Established a secure Inter-Process Communication (IPC) bridge using a preload script (`electron/preload.ts`). This allows the React frontend to communicate safely with the Node.js backend.

### 🔌 Hybrid API Layer
*   **Smart Detection:** The frontend API (`src/lib/api.ts`) now automatically detects if it is running inside Electron.
*   **NATIVE vs. WEB:**
    *   **Native Mode:** Uses Electron IPC handlers for high-speed local data access and ETL processing.
    *   **Web Mode:** Continues to support standard `fetch` via the Vite dev server, ensuring developers can still work in a browser if desired.

### 📦 Distribution Ready
*   **Portable Executable:** Configured `electron-builder` to generate a portable Windows executable.
*   **Build Pipeline:** Integrated Electron compilation into the standard Vite build process.
*   **Consolidated Workspace:** Successfully bundled the `core` data directory within the application package.

### 🔍 Technical Refinements
*   **Vite Plugin Electron:** Integrated `vite-plugin-electron` for seamless hot-reloading of both frontend and backend code during development.
*   **Ignored Watcher:** Refined Vite's watcher to ignore the `core` folder, preventing unnecessary reloads during data processing.
*   **Version Bump:** Incremented project version to 0.4.0.

## How to Run
1.  **Install Dependencies:** `npm install`.
2.  **Start Desktop App (Dev):** `npm run dev` (This will now open the Electron window automatically).
3.  **Build Desktop App:** `npm run build` (Creates a portable executable in `release/0.4.0/`).
4.  **Reset/Import Data:** Still available via `npm run data-reset` or directly within the desktop UI.