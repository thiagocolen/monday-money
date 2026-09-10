import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from "url";

// Disable sandbox to prevent startup crashes (0x80000003) on some Windows environments.
// SECURITY NOTE: this weakens process isolation (a renderer compromise runs with full
// user privileges instead of being contained by the Chromium sandbox). Left in place
// deliberately — removing it without access to the affected Windows environments risks
// reintroducing the documented crash. Mitigated by CSP, navigation lockdown, and the
// preload IPC allowlist below; revisit if a narrower workaround for the crash is found.
app.commandLine.appendSwitch('no-sandbox');
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
  handleGetAllocationTarget,
  handleSaveAllocationTarget,
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

// Origins the renderer legitimately needs for price data (see src/lib/price-history.ts, src/lib/prices.ts).
const ALLOWED_CONNECT_ORIGINS = [
  'https://api.exchange.coinbase.com',
  'https://api.coingecko.com',
];

function isDev(): boolean {
  return Boolean(process.env.VITE_DEV_SERVER_URL);
}

/**
 * Content-Security-Policy for the packaged app. Skipped in dev, since the
 * Vite dev server needs inline scripts / eval / a websocket connection for
 * HMR that would otherwise have to be special-cased here.
 */
function applyContentSecurityPolicy() {
  if (isDev()) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          // chart.tsx injects a small <style> tag for per-series colors.
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self' data:",
          `connect-src 'self' ${ALLOWED_CONNECT_ORIGINS.join(' ')}`,
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    });
  });
}

/** Deny opening new BrowserWindows and block navigation away from the app. */
function lockDownNavigation(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Let genuine external https links open in the user's normal browser
    // instead of a new, less-restricted Electron window.
    if (/^https:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    let allowed = false;
    try {
      const target = new URL(url);
      if (isDev() && target.origin === new URL(process.env.VITE_DEV_SERVER_URL!).origin) allowed = true;
      if (!isDev() && target.protocol === 'file:') allowed = true;
    } catch {
      allowed = false;
    }
    if (!allowed) event.preventDefault();
  });
}

function createWindow() {
  initializeCore();
  applyContentSecurityPolicy();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(currentDir, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  lockDownNavigation(win);

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

ipcMain.handle('get-allocation-target', async () => {
  return handleGetAllocationTarget();
});

ipcMain.handle('save-allocation-target', async (event, target) => {
  return handleSaveAllocationTarget(target);
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

