import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  handleGetCsvData,
  handleGetOwners,
  handleImportFile,
  handleDeleteImport,
  handleGetImportHistory,
  handleSaveCategory,
  handleBackupCategories,
  handleGetBackupInfo
} from '../backend/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(currentDir, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(currentDir, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC HANDLERS

ipcMain.handle('get-csv-data', async (event, fileName) => {
  return handleGetCsvData(fileName);
});

ipcMain.handle('get-owners', async () => {
  return handleGetOwners();
});

ipcMain.handle('import-file', async (event, { owner, fileName, fileContent }) => {
  return handleImportFile(owner, fileName, fileContent);
});

ipcMain.handle('delete-import', async (event, { owner, fileName }) => {
  return handleDeleteImport(owner, fileName);
});

ipcMain.handle('get-import-history', async () => {
  return handleGetImportHistory();
});

ipcMain.handle('save-category', async (event, { transactionHash, category, tags }) => {
  return handleSaveCategory(transactionHash, category, tags);
});

ipcMain.handle('backup-categories', async () => {
  return handleBackupCategories();
});

ipcMain.handle('get-backup-info', async () => {
  return handleGetBackupInfo();
});
