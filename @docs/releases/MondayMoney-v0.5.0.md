# Release Notes - MondayMoney v0.5.0

**Version:** 0.5.0
**Date:** 2026-04-10
**Author:** MondayMoney Assistant

## Description
This minor update (v0.5.0) focuses on backend architectural refinement and optimization for the Electron desktop environment. We have decoupled the API logic from the Vite server configuration and improved the routing and state management for a more robust standalone experience.

## Feature List

### 🏗️ Backend Refactoring & Modularization
*   **API Core Extraction:** Introduced `backend/api-core.ts` to house core data logic, separating it from the transport layer.
*   **Vite Configuration Cleanup:** Refactored `vite.config.ts` to use modular handlers (`handleGetCsvData`, `handleImportFile`, etc.), significantly reducing complexity in the dev server setup.
*   **Robust Data Handling:** Centralized CSV processing and owner management in the backend core.

### 🖥️ Electron & Routing Optimization
*   **Memory Routing:** Switched to `createMemoryRouter` in `App.tsx` to provide a more stable and predictable routing experience within the Electron shell.
*   **Path Resolution:** Improved relative path handling in the `Layout` component and navigation links.

### 🎨 UI/UX Improvements
*   **Delete Dialog Fix:** Enhanced the state management of the "Remove Statement File" dialog to prevent UI flickering and ensure proper cleanup of local state.
*   **Theme Consistency:** Continued refinement of shadcn/ui components integration.

### 🔍 Project Maintenance
*   **Documentation Centralization:** Migrated release notes to the `@docs/releases/` directory and cleaned up legacy documentation files.
*   **Git hygiene:** Updated `.gitignore` to protect the new documentation structure.
*   **Version Bump:** Incremented project version to 0.5.0.
