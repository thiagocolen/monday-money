# Architecture

MondayMoney is built with modern web technologies, packaged as a desktop application.

## Tech Stack

- **Runtime:** [Electron](https://www.electronjs.org/) - Provides the desktop environment and access to the file system.
- **Frontend:** [React 19](https://react.dev/) - UI library for building the interface.
- **Bundler:** [Vite](https://vitejs.dev/) - Fast development server and build tool.
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) - Utility-first CSS framework.
- **UI Components:** [Radix UI](https://www.radix-ui.com/) & [Shadcn/UI](https://ui.shadcn.com/) - Accessible and customizable UI primitives.
- **Charts:** [Recharts](https://recharts.org/) - Composable charting library.

## Data Flow

1. **Backend (Node/Electron):** Handles file system operations, CSV parsing, and data integrity.
2. **IPC (Inter-Process Communication):** The bridge between the Electron main process and the React renderer process.
3. **Frontend (React):** Manages the state and renders the data received from the backend.

## Storage Strategy

We use a **File-based Storage** approach. Instead of a traditional database like SQLite, we store everything in CSV files within the `core/data/` directory. This makes the data:
- **Transparent:** You can open it in Excel or any text editor.
- **Portable:** Easy to backup and move.
- **Versionable:** You could even track your financial data in Git if you wanted to.
