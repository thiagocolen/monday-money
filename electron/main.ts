import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  clearLedger, 
  createSeedTransaction, 
  dataImportRegistration, 
  integrityCheck, 
  resetCsvFiles,
  getSha256
} from '../backend/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The core directory is at the root of web-interface
const coreDir = path.resolve(process.cwd(), 'core');
const dataDir = path.join(coreDir, 'data');
const protectedDir = path.join(coreDir, 'protected');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.cwd(), 'dist/index.html'));
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
  const filePath = path.join(dataDir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new Error(`File not found: ${fileName}`);
});

ipcMain.handle('get-owners', async () => {
  const rawPath = path.join(protectedDir, 'raw-statement-files');
  if (fs.existsSync(rawPath)) {
    return fs.readdirSync(rawPath).filter(f => fs.statSync(path.join(rawPath, f)).isDirectory());
  }
  return [];
});

ipcMain.handle('import-file', async (event, { owner, fileName, fileContent }) => {
  const ownerDir = path.join(protectedDir, 'raw-statement-files', owner);
  if (!fs.existsSync(ownerDir)) {
    fs.mkdirSync(ownerDir, { recursive: true });
  }

  const targetPath = path.join(ownerDir, fileName);
  if (fs.existsSync(targetPath)) {
    throw new Error('File already exists in protected storage');
  }

  const buffer = Buffer.from(fileContent, 'utf-8');
  const fileHash = getSha256(fileContent);

  // Check if hash already exists (simplified check)
  // ... (could replicate the full logic from vite.config.ts if needed)

  fs.writeFileSync(targetPath, buffer);

  // Run pipeline
  clearLedger();
  createSeedTransaction();
  dataImportRegistration();
  integrityCheck();

  return { success: true };
});

ipcMain.handle('delete-import', async (event, { owner, fileName }) => {
  const filePath = path.join(protectedDir, 'raw-statement-files', owner, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    
    // Reprocess
    clearLedger();
    createSeedTransaction();
    dataImportRegistration();
    integrityCheck();
    
    return { success: true, logs: 'Reprocessing completed.' };
  }
  throw new Error('File not found');
});

ipcMain.handle('get-import-history', async () => {
  const sourcePath = path.join(protectedDir, 'raw-statement-files');
  const history = [];

  if (fs.existsSync(sourcePath)) {
    const owners = fs.readdirSync(sourcePath).filter(f => fs.statSync(path.join(sourcePath, f)).isDirectory());
    
    for (const owner of owners) {
      const ownerPath = path.join(sourcePath, owner);
      const files = fs.readdirSync(ownerPath).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const filePath = path.join(ownerPath, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const totalRows = lines.length > 0 ? lines.length - 1 : 0;
        
        history.push({
          fileName: file,
          owner,
          processedDate: stats.mtime.toISOString(),
          totalTransactions: totalRows,
          importedTransactions: totalRows,
          notImportedTransactions: 0
        });
      }
    }
  }
  return history.sort((a, b) => new Date(b.processedDate).getTime() - new Date(a.processedDate).getTime());
});

ipcMain.handle('save-category', async (event, { transactionHash, category, tags }) => {
  const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
  
  let lines = [];
  if (fs.existsSync(categoryCsvPath)) {
    lines = fs.readFileSync(categoryCsvPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  } else {
    lines = ['transaction-hash,category,tags,row-hash'];
  }

  const header = lines[0];
  const dataLines = lines.slice(1);
  
  // Replicating the simple CSV parser/updater from vite.config.ts
  const parseCsvLine = (line: string) => {
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else current += char;
    }
    parts.push(current);
    return parts;
  };

  let finalCategory = category;
  let finalTags = tags;

  const otherLines = dataLines.filter(line => {
    const parts = parseCsvLine(line);
    if (parts[0] === transactionHash) {
      if (category === undefined) finalCategory = parts[1];
      if (tags === undefined) finalTags = parts[2];
      return false;
    }
    return true;
  });
  
  const escapeCsvField = (field: string) => {
    const f = field || '';
    if (f.includes(',') || f.includes('"') || f.includes('\n')) {
      return `"${f.replace(/"/g, '""')}"`;
    }
    return f;
  };

  const rowContentForHash = `${transactionHash},${finalCategory || ''},${finalTags || ''}`;
  const rowHash = getSha256(rowContentForHash);
  const newLine = `${escapeCsvField(transactionHash)},${escapeCsvField(finalCategory)},${escapeCsvField(finalTags)},${rowHash}`;
  
  const newContent = [header, ...otherLines, newLine].join('\n') + '\n';
  fs.writeFileSync(categoryCsvPath, newContent, 'utf8');
  return { success: true };
});

ipcMain.handle('backup-categories', async () => {
  const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
  const backupDir = path.join(protectedDir, 'monthly-transactions-category-bkp');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (fs.existsSync(categoryCsvPath)) {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const backupPath = path.join(backupDir, `monthly-transactions-category-${timestamp}-bkp.csv`);
    fs.copyFileSync(categoryCsvPath, backupPath);
    return { success: true, fileName: path.basename(backupPath) };
  }
  throw new Error('Category file not found');
});

ipcMain.handle('get-backup-info', async () => {
  const backupDir = path.join(protectedDir, 'monthly-transactions-category-bkp');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('-bkp.csv'));
    let latestDate = null;
    if (files.length > 0) {
      const dates = files.map(f => {
        const match = f.match(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
        if (match) {
          const parts = match[1].split('-');
          return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}`).getTime();
        }
        return 0;
      });
      latestDate = new Date(Math.max(...dates)).toISOString();
    }
    return { count: files.length, latestDate };
  }
  return { count: 0, latestDate: null };
});
