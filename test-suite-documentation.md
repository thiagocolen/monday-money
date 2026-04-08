# Playwright E2E Test Suite Documentation

This project uses [Playwright](https://playwright.dev/) for end-to-end testing of the frontend. The test suite is located in `web-interface/tests`.

## Prerequisites

Before running the tests, ensure you have:
1.  Node.js installed.
2.  Dependencies installed: `npm install` in `web-interface`.
3.  Playwright browsers installed: `npx playwright install` in `web-interface`.

## Configuration

The Playwright configuration is located at `web-interface/playwright.config.ts`. It is configured to:
-   Start the Vite dev server automatically before running tests.
-   Use `http://localhost:5173` as the base URL.
-   Run tests in parallel.
-   Record traces and screenshots on failure.
-   Target **Chromium** as the primary browser for efficiency.

## How to Run Tests

All commands should be executed from the `web-interface` directory.

### Run All Tests
```bash
npx playwright test
```

### Run Tests in UI Mode
UI mode provides an interactive environment to debug and see the tests running step by step.
```bash
npx playwright test --ui
```

### Run a Specific Test File
```bash
npx playwright test tests/navigation.spec.ts
```

### Debugging Tests
```bash
npx playwright test --debug
```

## Test Scenarios

The current test suite covers:
-   **Navigation**: Verifies that the app can navigate between Transactions, Investments, and Import pages.
-   **Transactions Page**:
    -   Displays the transactions table.
    -   Month navigation (previous/next months).
    -   Global search filtering.
    -   Opening the "Edit Category" dialog.
-   **Import Page**:
    -   Displays the import UI cards.
    -   Toggling between existing/new owners.
    -   Basic form validation.
    -   Selecting files for upload.

## Continuous Integration

The suite is also configured to run on GitHub Actions (`.github/workflows/playwright.yml`). On CI, it will:
1.  Install dependencies.
2.  Install Playwright browsers.
3.  Start the dev server.
4.  Run all tests and upload an HTML report on failure.

## Troubleshooting

If tests fail locally:
-   **Port in Use**: Ensure `localhost:5173` is not being used by another process or that it's the correct port for the Vite server.
-   **Data Consistency**: The tests rely on some seed data being present (created by the project's setup scripts). If the data is empty, some filtering tests might behave differently. You can run `npm run data-reset` in the `web-interface` directory (which calls the core scripts) to restore the baseline state.
-   **Trace Viewer**: If a test fails, Playwright will generate a report. Open it with `npx playwright show-report`.
