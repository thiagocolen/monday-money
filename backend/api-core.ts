import fs from 'fs';
import path from 'path';
import { 
  clearLedger, 
  createSeedTransaction, 
  dataImportRegistration, 
  integrityCheck,
  getSha256,
  resolveSafePath,
  getCoreDir,
  PARSERS,
  DEFAULT_CATEGORIES
} from './index.js';

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

export async function handleImportFile(owner: string, fileName: string, fileContent: string): Promise<{ success: boolean; error?: string }> {
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
}

export async function handleDeleteImport(owner: string, fileName: string): Promise<{ success: boolean; error?: string; logs?: string }> {
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

export async function handleGetMetadata(): Promise<{ tags: any[], categories: any[] }> {
  const { dataDir } = getPaths();
  const tagsPath = path.join(dataDir, 'meta-tags.json');
  const catsPath = path.join(dataDir, 'meta-categories.json');

  let tags = [];
  let categories = [];

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
      
      // Ensure all default categories exist
      let changed = false;
      DEFAULT_CATEGORIES.forEach(defCat => {
        const existing = categories.find((c: any) => c.name === defCat.name);
        if (!existing) {
          categories.push(defCat);
          changed = true;
        } else if (!existing.isDefault) {
          existing.isDefault = true;
          changed = true;
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

export async function handleSaveMetadata(type: 'tags' | 'categories', data: any[]): Promise<{ success: boolean }> {
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

export async function handleBackupCategories(): Promise<{ success: boolean; fileName?: string; error?: string }> {
  const { dataDir, protectedDir } = getPaths();
  const categoryCsvPath = path.join(dataDir, 'monthly-transactions-category.csv');
  const tagsJsonPath = path.join(dataDir, 'meta-tags.json');
  const catsJsonPath = path.join(dataDir, 'meta-categories.json');
  const backupDir = path.join(protectedDir, 'monthly-transactions-category-bkp');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (fs.existsSync(categoryCsvPath)) {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    
    // Backup CSV
    const backupCsvPath = path.join(backupDir, `monthly-transactions-category-${timestamp}-bkp.csv`);
    fs.copyFileSync(categoryCsvPath, backupCsvPath);

    // Backup Meta Tags
    if (fs.existsSync(tagsJsonPath)) {
      const backupTagsPath = path.join(backupDir, `meta-tags-${timestamp}-bkp.json`);
      fs.copyFileSync(tagsJsonPath, backupTagsPath);
    }

    // Backup Meta Categories
    if (fs.existsSync(catsJsonPath)) {
      const backupCatsPath = path.join(backupDir, `meta-categories-${timestamp}-bkp.json`);
      fs.copyFileSync(catsJsonPath, backupCatsPath);
    }

    return { success: true, fileName: path.basename(backupCsvPath) };
  }
  throw new Error('Category file not found');
}

export async function handleGetBackupInfo(): Promise<{ count: number; latestDate: string | null }> {
  const { protectedDir } = getPaths();
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
}
