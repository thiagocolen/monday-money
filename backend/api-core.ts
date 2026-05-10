import fs from 'fs';
import path from 'path';
import { clearLedger } from './clear-ledger.js';
import { createSeedTransaction } from './create-seed-transaction.js';
import { dataImportRegistration, PARSERS } from './data-import-registration.js';
import { integrityCheck } from './integrity-check.js';
import { 
  getSha256, 
  resolveSafePath, 
  getCoreDir, 
  ensureCoreStructure,
  getSettings, 
  saveSettings, 
  deleteSettings,
  DEFAULT_CATEGORIES 
} from './utils.js';
import { backupData, restoreData } from './backup-data.js';

function getPaths() {
  const coreDir = getCoreDir();
  const dataDir = path.join(coreDir, 'data');
  const protectedDir = path.join(coreDir, 'protected');
  const rawStatementFilesDir = path.join(protectedDir, 'raw-statement-files');
  return { coreDir, dataDir, protectedDir, rawStatementFilesDir };
}

export async function handleGetCsvData(fileName: string): Promise<string> {
  const { dataDir } = getPaths();
  const filePath = resolveSafePath(dataDir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new Error(`File not found: ${fileName}`);
}

export async function handleGetOwners(): Promise<string[]> {
  const { rawStatementFilesDir } = getPaths();
  if (fs.existsSync(rawStatementFilesDir)) {
    return fs.readdirSync(rawStatementFilesDir).filter(f => fs.statSync(path.join(rawStatementFilesDir, f)).isDirectory());
  }
  return [];
}

let isProcessing = false;
const queue: (() => void)[] = [];

async function acquireLock() {
  if (!isProcessing) {
    isProcessing = true;
    return;
  }
  return new Promise<void>(resolve => {
    queue.push(resolve);
  });
}

function releaseLock() {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    isProcessing = false;
  }
}

export async function handleImportFile(owner: string, fileName: string, fileContent: string): Promise<{ success: boolean; error?: string }> {
  await acquireLock();
  try {
    const { dataDir, rawStatementFilesDir } = getPaths();
    const ownerDir = resolveSafePath(rawStatementFilesDir, owner);
    if (!fs.existsSync(ownerDir)) {
      fs.mkdirSync(ownerDir, { recursive: true });
    }

    const targetPath = resolveSafePath(ownerDir, fileName);
    if (fs.existsSync(targetPath)) {
      throw new Error('File already exists in protected storage');
    }

    const buffer = Buffer.from(fileContent, 'utf-8');
    const fileHash = getSha256(buffer);

    // Content-based duplicate check
    const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
    const transactionsCsvPath = path.join(dataDir, 'monthly-transactions.csv');
    
    if (fs.existsSync(categoryCsvPath) && fs.existsSync(transactionsCsvPath)) {
      const categories = fs.readFileSync(categoryCsvPath, 'utf-8').split('\n').filter(l => l.trim());
      const transactions = fs.readFileSync(transactionsCsvPath, 'utf-8').split('\n').filter(l => l.trim());
      
      const chainHashes = categories
        .filter(line => line.includes('chain-transaction'))
        .map(line => line.split(',')[0]);

      const existingFileHashes = transactions
        .filter(line => chainHashes.includes(line.split(',').slice(-1)[0]))
        .map(line => line.split(',')[1]?.replace(/"/g, ''));

      if (existingFileHashes.includes(fileHash)) {
        throw new Error('File content has already been imported (hash match)');
      }
    }

    fs.writeFileSync(targetPath, buffer);

    // Run pipeline
    clearLedger();
    createSeedTransaction();
    dataImportRegistration();
    integrityCheck();

    return { success: true };
  } finally {
    releaseLock();
  }
}

export async function handleDeleteImport(owner: string, fileName: string): Promise<{ success: boolean; error?: string; logs?: string }> {
  await acquireLock();
  try {
    const { rawStatementFilesDir } = getPaths();
    const ownerDir = resolveSafePath(rawStatementFilesDir, owner);
    const filePath = resolveSafePath(ownerDir, fileName);
    
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
  } finally {
    releaseLock();
  }
}

export async function handleGetImportHistory(): Promise<any[]> {
  const { rawStatementFilesDir } = getPaths();
  const history = [];

  if (fs.existsSync(rawStatementFilesDir)) {
    const owners = fs.readdirSync(rawStatementFilesDir).filter(f => fs.statSync(path.join(rawStatementFilesDir, f)).isDirectory());
    
    for (const owner of owners) {
      const ownerPath = path.join(rawStatementFilesDir, owner);
      const files = fs.readdirSync(ownerPath).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const filePath = path.join(ownerPath, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        const parser = PARSERS.find(p => p.match(file, content));
        let totalRows = 0;
        if (parser) {
          try {
            const { rows } = parser.parse(file, content, owner);
            totalRows = rows.length;
          } catch (e) {
            console.error(`Error parsing file ${file} for history:`, e);
          }
        } else {
          const lines = content.split('\n').filter(l => l.trim());
          totalRows = lines.length > 0 ? lines.length - 1 : 0;
        }
        
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
}

export async function handleSaveCategory(transactionHash: string, category?: string, tags?: string): Promise<{ success: boolean }> {
  const { dataDir } = getPaths();
  const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
  
  let lines: string[] = [];
  if (fs.existsSync(categoryCsvPath)) {
    lines = fs.readFileSync(categoryCsvPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  } else {
    lines = ['transaction-hash,category,tags,row-hash'];
  }

  const header = lines[0];
  const dataLines = lines.slice(1);
  
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
  const newLine = `${escapeCsvField(transactionHash)},${escapeCsvField(finalCategory!)},${escapeCsvField(finalTags!)},${rowHash}`;
  
  const newContent = [header, ...otherLines, newLine].join('\n') + '\n';
  fs.writeFileSync(categoryCsvPath, newContent, 'utf8');
  return { success: true };
}

export async function handleBulkSaveMetadata(updates: { transactionHash: string, category?: string, tags?: string }[]): Promise<{ success: boolean }> {
  const { dataDir } = getPaths();
  const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
  
  let lines: string[] = [];
  if (fs.existsSync(categoryCsvPath)) {
    lines = fs.readFileSync(categoryCsvPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  } else {
    lines = ['transaction-hash,category,tags,row-hash'];
  }

  const header = lines[0];
  const dataLines = lines.slice(1);
  
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

  const rowsMap = new Map();
  dataLines.forEach(line => {
    const parts = parseCsvLine(line);
    rowsMap.set(parts[0], { category: parts[1], tags: parts[2] });
  });

  for (const update of updates) {
    const existing = rowsMap.get(update.transactionHash) || { category: '', tags: '' };
    rowsMap.set(update.transactionHash, {
      category: update.category !== undefined ? update.category : existing.category,
      tags: update.tags !== undefined ? update.tags : existing.tags
    });
  }
  
  const escapeCsvField = (field: string) => {
    const f = field || '';
    if (f.includes(',') || f.includes('"') || f.includes('\n')) {
      return `"${f.replace(/"/g, '""')}"`;
    }
    return f;
  };

  const newRows = Array.from(rowsMap.entries()).map(([hash, meta]) => {
    const rowContentForHash = `${hash},${meta.category || ''},${meta.tags || ''}`;
    const rowHash = getSha256(rowContentForHash);
    return `${escapeCsvField(hash)},${escapeCsvField(meta.category)},${escapeCsvField(meta.tags)},${rowHash}`;
  });
  
  const newContent = [header, ...newRows].join('\n') + '\n';
  fs.writeFileSync(categoryCsvPath, newContent, 'utf8');
  return { success: true };
}

interface MetadataItem {
  name: string;
  color: string;
  isDefault?: boolean;
}

export async function handleGetMetadata(): Promise<{ tags: MetadataItem[], categories: MetadataItem[] }> {
  const { dataDir } = getPaths();
  const tagsPath = path.join(dataDir, 'meta-tags.json');
  const catsPath = path.join(dataDir, 'meta-categories.json');

  let tags: MetadataItem[] = [];
  let categories: MetadataItem[] = [];

  if (fs.existsSync(tagsPath)) {
    try {
      tags = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
    } catch (e) { console.error('Error parsing tags meta', e); }
  } else {
    fs.writeFileSync(tagsPath, JSON.stringify([], null, 2), 'utf8');
  }
  
  if (fs.existsSync(catsPath)) {
    try {
      categories = JSON.parse(fs.readFileSync(catsPath, 'utf8'));
      
      // Ensure all default categories exist and have correct colors
      let changed = false;
      DEFAULT_CATEGORIES.forEach(defCat => {
        const index = categories.findIndex((c: MetadataItem) => c.name === defCat.name);
        if (index === -1) {
          categories.push(defCat);
          changed = true;
        } else {
          // Check if color or isDefault has changed
          if (categories[index].color !== defCat.color || !categories[index].isDefault) {
            categories[index] = { ...categories[index], color: defCat.color, isDefault: true };
            changed = true;
          }
        }
      });
      
      if (changed) {
        fs.writeFileSync(catsPath, JSON.stringify(categories, null, 2), 'utf8');
      }
    } catch (e) { console.error('Error parsing categories meta', e); }
  } else {
    categories = [...DEFAULT_CATEGORIES];
    fs.writeFileSync(catsPath, JSON.stringify(categories, null, 2), 'utf8');
  }

  return { tags, categories };
}

export async function handleSaveMetadata(type: 'tags' | 'categories', data: MetadataItem[]): Promise<{ success: boolean }> {
  const { dataDir } = getPaths();
  const filePath = path.join(dataDir, type === 'tags' ? 'meta-tags.json' : 'meta-categories.json');
  
  let finalData = data;
  
  if (type === 'categories') {
    // Ensure all defaults are present and unmodified
    const newData = [...data];
    DEFAULT_CATEGORIES.forEach(defCat => {
      const index = newData.findIndex(c => c.name === defCat.name);
      if (index === -1) {
        newData.push(defCat);
      } else {
        // Force default values
        newData[index] = { ...newData[index], ...defCat };
      }
    });
    finalData = newData;
  }

  fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2), 'utf8');
  return { success: true };
}

export async function handleFullBackup(): Promise<{ success: boolean; fileName?: string; error?: string }> {
  try {
    const settings = getSettings();
    if (!settings.exportPath) throw new Error('Export path not configured');
    
    const fileName = backupData(settings.exportPath);
    return { success: true, fileName };
  } catch (error) {
    console.error('Error in handleFullBackup:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleRestoreBackup(zipPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    restoreData(zipPath);
    return { success: true };
  } catch (error) {
    console.error('Error in handleRestoreBackup:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleResetApp(): Promise<{ success: boolean; error?: string }> {
  try {
    const coreDir = getCoreDir();
    if (fs.existsSync(coreDir)) {
      fs.rmSync(coreDir, { recursive: true, force: true });
    }
    ensureCoreStructure(coreDir);
    deleteSettings();
    return { success: true };
  } catch (error) {
    console.error('Error in handleResetApp:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleSetExportPath(exportPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!exportPath) throw new Error('No path provided');
    saveSettings({ exportPath });
    return { success: true };
  } catch (error) {
    console.error('Error in handleSetExportPath:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleGetRawCsvFolderPath(): Promise<string> {
  const settings = getSettings();
  return settings.rawCsvFolderPath || "";
}

export async function handleSetRawCsvFolderPath(rawCsvFolderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rawCsvFolderPath) throw new Error('No path provided');
    saveSettings({ rawCsvFolderPath });
    return { success: true };
  } catch (error) {
    console.error('Error in handleSetRawCsvFolderPath:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleScanFolder(): Promise<{ success: boolean; error?: string }> {
  await acquireLock();
  try {
    const settings = getSettings();
    if (!settings.rawCsvFolderPath) throw new Error('Raw CSV folder path not configured');

    if (!fs.existsSync(settings.rawCsvFolderPath)) {
      throw new Error(`Folder not found: ${settings.rawCsvFolderPath}`);
    }

    const { rawStatementFilesDir, dataDir, coreDir } = getPaths();

    // RESET: Clear internal storage to perfectly mirror the source folder
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    if (fs.existsSync(rawStatementFilesDir)) {
      fs.rmSync(rawStatementFilesDir, { recursive: true, force: true });
    }
    ensureCoreStructure(coreDir);

    const ownerDirs = fs.readdirSync(settings.rawCsvFolderPath).filter(f => fs.statSync(path.join(settings.rawCsvFolderPath!, f)).isDirectory());

    for (const ownerName of ownerDirs) {
      const sourceOwnerPath = path.join(settings.rawCsvFolderPath, ownerName);
      const targetOwnerPath = resolveSafePath(rawStatementFilesDir, ownerName);

      if (!fs.existsSync(targetOwnerPath)) {
        fs.mkdirSync(targetOwnerPath, { recursive: true });
      }

      const files = fs.readdirSync(sourceOwnerPath).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const sourceFilePath = path.join(sourceOwnerPath, file);
        const targetFilePath = path.join(targetOwnerPath, file);
        
        // Copy every file (reset means we start fresh)
        fs.copyFileSync(sourceFilePath, targetFilePath);
      }
    }

    // Run pipeline: re-initialize since we cleared data
    createSeedTransaction();
    dataImportRegistration();
    integrityCheck();

    return { success: true };
  } catch (error) {
    console.error('Error in handleScanFolder:', error);
    return { success: false, error: String(error) };
  } finally {
    releaseLock();
  }
}

export async function handleGetBackupInfo(): Promise<{ count: number; latestDate: string | null }> {
  const settings = getSettings();
  const backupDir = settings.exportPath;
  
  if (backupDir && fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.zip') && f.includes('monday-money-data'));
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
}
