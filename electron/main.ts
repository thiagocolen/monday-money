import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from "url";
import { 
  handleGetCsvData,
  handleGetOwners,
  handleImportFile,
  handleDeleteImport,
  handleGetImportHistory,
  handleSaveCategory,
  handleBulkSaveMetadata,
  handleGetMetadata,
  handleSaveMetadata,
  handleFullBackup,
  handleRestoreBackup,
  handleResetApp,
  handleGetBackupInfo,
  createSeedTransaction,
  dataImportRegistration,
  integrityCheck,
  getCoreDir,
  getSettings,
  saveSettings,
  ensureCoreStructure
} from '../backend/index.js';
import fs from 'fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function initializeCore() {
  const coreDir = getCoreDir();
  const mainLedgerPath = path.join(coreDir, 'data', 'monthly-transactions.csv');
  
  ensureCoreStructure(coreDir);
  if (!fs.existsSync(mainLedgerPath)) {
    console.log('Initializing fresh data directory...');
    createSeedTransaction();
    dataImportRegistration();
    integrityCheck();
  }
}

function createWindow() {
  initializeCore();

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
    win.maximize();
    win.webContents.openDevTools();
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

ipcMain.handle('full-backup', async () => {
  return handleFullBackup();
});

ipcMain.handle('restore-backup', async (event, zipPath) => {
  return handleRestoreBackup(zipPath);
});

ipcMain.handle('reset-app', async () => {
  return handleResetApp();
});

ipcMain.handle('get-backup-info', async () => {
  return handleGetBackupInfo();
});

ipcMain.handle('bulk-save-metadata', async (event, updates) => {
  return handleBulkSaveMetadata(updates);
});

ipcMain.handle('get-metadata', async () => {
  return handleGetMetadata();
});

ipcMain.handle('save-metadata', async (event, { type, data }) => {
  return handleSaveMetadata(type, data);
});

ipcMain.handle('get-settings', async () => {
  try {
    const settings = getSettings();
    return settings;
  } catch (error) {
    console.error('Main: Error in get-settings', error);
    throw error;
  }
});

ipcMain.handle('select-directory', async (event, title = 'Select Folder') => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: title,
      buttonLabel: 'Select Folder'
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error('Main: Error in select-directory', error);
    throw error;
  }
});

ipcMain.handle('select-zip-file', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Zip Files', extensions: ['zip'] }],
      title: 'Select Backup File',
      buttonLabel: 'Import Backup'
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error('Main: Error in select-zip-file', error);
    throw error;
  }
});

ipcMain.handle('set-export-path', async (event, exportPath) => {
  try {
    if (!exportPath) throw new Error('No path provided');
    saveSettings({ exportPath });
    return { success: true };
  } catch (error) {
    console.error('Main: Error in set-export-path', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('get-raw-csv-folder-path', async () => {
  const { handleGetRawCsvFolderPath } = await import('../backend/index.js');
  return handleGetRawCsvFolderPath();
});

ipcMain.handle('set-raw-csv-folder-path', async (event, path) => {
  const { handleSetRawCsvFolderPath } = await import('../backend/index.js');
  return handleSetRawCsvFolderPath(path);
});

ipcMain.handle('scan-folder', async () => {
  const { handleScanFolder } = await import('../backend/index.js');
  return handleScanFolder();
});

