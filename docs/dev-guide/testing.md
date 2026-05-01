# Testing

Quality is a priority for MondayMoney. We use **Playwright** for end-to-end (E2E) testing.

## Running Tests

### Full Test Suite
Executes all tests in the `tests/` directory:
```bash
npm run test
```

### Single Test File
To run a specific test file (e.g., for faster feedback during development):
```bash
npm run test:file tests/categories-tags.spec.ts
```

## Writing Tests
New tests should be added to the `tests/` directory with the `.spec.ts` extension. Use the existing tests as templates.

### Fixtures
If your test requires specific CSV files, place them in `tests/fixtures/` and use them in your tests.

## Continuous Integration
Tests are automatically run on every push and pull request via GitHub Actions. Check `.github/workflows/playwright.yml` for the configuration.
