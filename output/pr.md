# Implementation Plan: Documentation Website

## Overview
This PR introduces a documentation website for MondayMoney using MkDocs and the Material theme, deployed via GitHub Pages.

## Proposed Changes
1.  **Project Initialization**:
    - Install `mkdocs` and `mkdocs-material` (can be done via a dedicated environment or simple `pip` install in CI).
    - Create `mkdocs.yml` configuration file.
    - Create the `docs/` directory for Markdown content.
2.  **Content Migration & Creation**:
    - Move/Adapt existing documentation from `README.md` and `docs/release-notes/` into the new MkDocs structure.
    - Create new pages:
        - `index.md`: Homepage with project overview.
        - `features.md`: Detailed feature list.
        - `user-guide/getting-started.md`: Installation and first steps.
        - `user-guide/imports.md`: Guide on importing CSVs from different banks.
        - `technical/architecture.md`: System design and tech stack.
        - `dev-guide/setup.md`: Dev environment setup.
3.  **Deployment Setup**:
    - Create `.github/workflows/deploy-docs.yml` to automate deployment to the `gh-pages` branch on push to `master`.
4.  **Branding**:
    - Customize the Material theme with MondayMoney colors and logo (using existing assets if possible).

## Verification Plan
- **Local Preview**: Run `mkdocs serve` to verify content and styling locally.
- **CI/CD**: Verify the GitHub Action triggers and correctly builds the site.
- **Link Check**: Ensure all internal and external links are functional.
