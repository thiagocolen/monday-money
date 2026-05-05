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
  handleBackupCategories,
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
  
  // Only ensure structure and seed if we have a coreDir and it's either configured or we are in a state where we can use defaults
  // In packaged app, if not configured, we might wait for user input.
  // But getCoreDir() returns a default path if not configured.
  // Let's check if settings has it.
  const settings = getSettings();
  
  if (settings.coreDirPath || !app.isPackaged) {
    ensureCoreStructure(coreDir);
    if (!fs.existsSync(mainLedgerPath)) {
      console.log('Initializing fresh data directory...');
      createSeedTransaction();
      dataImportRegistration();
      integrityCheck();
    }
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

ipcMain.handle('backup-categories', async () => {
  return handleBackupCategories();
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
    console.log('Main: get-settings', settings);
    return settings;
  } catch (error) {
    console.error('Main: Error in get-settings', error);
    throw error;
  }
});

ipcMain.handle('select-directory', async (event) => {
  try {
    console.log('Main: select-directory started');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select MondayMoney Core Folder',
      buttonLabel: 'Select Folder'
    });
    console.log('Main: select-directory result', result);
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error('Main: Error in select-directory', error);
    throw error;
  }
});

ipcMain.handle('set-core-dir', async (event, corePath) => {
  try {
    console.log('Main: set-core-dir', corePath);
    if (!corePath) throw new Error('No path provided');
    
    saveSettings({ coreDirPath: corePath });
    console.log('Main: Settings saved');
    
    initializeCore();
    console.log('Main: Core initialized');
    
    return { success: true };
  } catch (error) {
    console.error('Main: Error in set-core-dir', error);
    return { success: false, error: String(error) };
  }
});
