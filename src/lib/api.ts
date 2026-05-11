import Papa from 'papaparse';

declare global {
  interface Window {
    electron?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}

async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  if (window.electron) {
    return window.electron.invoke(channel, ...args);
  }
  return null as any;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  tags: string;
  owner: string;
  rowHash: string;
}

export function getEffectiveMonth(t: Transaction): string {
  if (!t.tags) return t.date.substring(0, 7);
  const monthTag = t.tags.split(',').map(tag => tag.trim()).find(tag => /^\d{4}-\d{2}$/.test(tag));
  return monthTag || t.date.substring(0, 7);
}

export interface BinanceTransaction {
  id: string;
  'User ID': string;
  Time: string;
  Account: string;
  Operation: string;
  Coin: string;
  Change: number;
  Remark: string;
  'row-hash': string;
}

export interface BinanceDepositWithdraw {
  id: string;
  Time: string;
  Coin: string;
  Network: string;
  Amount: number;
  Fee: number;
  Address: string;
  TXID: string;
  Status: string;
  Type: string;
  'row-hash': string;
}

export interface BinanceFiatDepositWithdraw {
  id: string;
  Time: string;
  Method: string;
  Amount: number;
  'Receive Amount': number;
  Fee: number;
  Status: string;
  'Transaction ID': string;
  Type: string;
  'row-hash': string;
}

interface RawTransaction {
  date: string;
  description: string;
  amount: number;
  owner: string;
  'row-hash': string;
}

interface RawCategory {
  'transaction-hash': string;
  category: string;
  tags: string;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  try {
    const timestamp = new Date().getTime();
    let csvData: string;
    
    if (window.electron) {
      csvData = await invoke<string>('get-csv-data', 'monthly-transactions.csv');
    } else {
      const response = await fetch(`/api/data/monthly-transactions.csv?t=${timestamp}`);
      if (!response.ok) throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      csvData = await response.text();
    }
    
    let metadataMap: Record<string, { category: string, tags: string }> = {};
    try {
      let catCsv = '';
      if (window.electron) {
        try {
          catCsv = await invoke<string>('get-csv-data', 'monthly-transactions-category.csv');
        } catch (e) { /* ignore if not found */ }
      } else {
        const catResponse = await fetch(`/api/data/monthly-transactions-category.csv?t=${timestamp}`);
        if (catResponse.ok) catCsv = await catResponse.text();
      }

      if (catCsv) {
        const catResult = Papa.parse<RawCategory>(catCsv, { header: true, skipEmptyLines: true });
        catResult.data.forEach(row => {
          const txHash = row['transaction-hash'];
          if (txHash) {
            metadataMap[txHash] = {
              category: row.category || '',
              tags: row.tags || ''
            };
          }
        });
      }
    } catch (e) {
      console.warn('Could not load categories/tags, continuing without them.');
    }

    return new Promise((resolve, reject) => {
      Papa.parse<RawTransaction>(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const transactions = results.data.map((row): Transaction => {
            const meta = metadataMap[row['row-hash']] || { category: '', tags: '' };
            return {
              id: '', // Placeholder
              date: row.date,
              description: row.description,
              amount: row.amount,
              category: meta.category,
              tags: meta.tags,
              owner: row.owner,
              rowHash: row['row-hash']
            };
          });
          
          transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          // Assign unique IDs after sorting to ensure stability
          const transactionsWithId = transactions.map((t, index) => ({
            ...t,
            id: `${t.rowHash}-${index}`
          }));
          
          resolve(transactionsWithId);
        },
        error: (error: Error) => reject(error)
      });
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

export async function fetchBinanceTransactions(): Promise<BinanceTransaction[]> {
  return fetchCsvData<BinanceTransaction>('/api/data/binance-transaction-history.csv');
}

export async function fetchBinanceDepositWithdraw(): Promise<BinanceDepositWithdraw[]> {
  return fetchCsvData<BinanceDepositWithdraw>('/api/data/binance-deposit-withdraw-history.csv');
}

export async function fetchBinanceFiatDepositWithdraw(): Promise<BinanceFiatDepositWithdraw[]> {
  return fetchCsvData<BinanceFiatDepositWithdraw>('/api/data/binance-fiat-deposit-withdraw-history.csv');
}

async function fetchCsvData<T>(url: string): Promise<T[]> {
  try {
    const timestamp = new Date().getTime();
    let csvData: string;

    if (window.electron) {
      const fileName = url.split('/').pop()?.split('?')[0] || '';
      csvData = await invoke<string>('get-csv-data', fileName);
    } else {
      const response = await fetch(`${url}?t=${timestamp}`);
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      csvData = await response.text();
    }

    return new Promise((resolve, reject) => {
      Papa.parse<any>(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const dataWithIds = results.data.map((row: any, index: number) => ({
            ...row,
            id: `${row['row-hash'] || 'no-hash'}-${index}`
          }));
          resolve(dataWithIds);
        },
        error: (error: Error) => reject(error)
      });
    });
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    throw error;
  }
}

export async function saveTransactionMetadata(transactionHash: string, category: string, tags: string): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('save-category', { transactionHash, category, tags });
      return result.success;
    }
    const response = await fetch('/api/save-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash, category, tags }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving metadata:', error);
    return false;
  }
}

export async function saveCategory(transactionHash: string, category: string): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('save-category', { transactionHash, category });
      return result.success;
    }
    const response = await fetch('/api/save-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash, category }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving category:', error);
    return false;
  }
}

export async function saveTags(transactionHash: string, tags: string): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('save-category', { transactionHash, tags });
      return result.success;
    }
    const response = await fetch('/api/save-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash, tags }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving tags:', error);
    return false;
  }
}

export async function saveBulkCategories(updates: { transactionHash: string, category: string }[]): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('bulk-save-metadata', updates);
      return result.success;
    }
    const response = await fetch('/api/bulk-save-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error saving bulk categories:', error);
    return false;
  }
}

export async function bulkSaveMetadata(updates: { transactionHash: string, category?: string, tags?: string }[]): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('bulk-save-metadata', updates);
      return result.success;
    }
    const response = await fetch('/api/bulk-save-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error bulk saving metadata:', error);
    return false;
  }
}

export interface ImportHistory {
  fileName: string;
  owner: string;
  processedDate: string;
  totalTransactions: number;
  importedTransactions: number;
  notImportedTransactions: number;
}

export async function fetchOwners(): Promise<string[]> {
  try {
    if (window.electron) {
      return await invoke('get-owners');
    }
    const response = await fetch('/api/owners');
    if (!response.ok) throw new Error('Failed to fetch owners');
    return await response.json();
  } catch (error) {
    console.error('Error fetching owners:', error);
    return [];
  }
}

export async function importFile(owner: string, fileName: string, fileContent: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (window.electron) {
      return await invoke('import-file', { owner, fileName, fileContent });
    }
    const response = await fetch('/api/import-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, fileName, fileContent }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error importing file:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchImportHistory(): Promise<ImportHistory[]> {
  try {
    if (window.electron) {
      return await invoke('get-import-history');
    }
    const response = await fetch('/api/import-history');
    if (!response.ok) throw new Error('Failed to fetch import history');
    return await response.json();
  } catch (error) {
    console.error('Error fetching import history:', error);
    return [];
  }
}



export async function fetchMetadata(): Promise<{ tags: any[], categories: any[] }> {
  try {
    if (window.electron) {
      return await invoke('get-metadata');
    }
    const response = await fetch('/api/metadata');
    return await response.json();
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return { tags: [], categories: [] };
  }
}

export async function saveMetadataConfig(type: 'tags' | 'categories', data: any[]): Promise<boolean> {
  try {
    if (window.electron) {
      const result = await invoke<{ success: boolean }>('save-metadata', { type, data });
      return result.success;
    }
    const response = await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error saving metadata config:', error);
    return false;
  }
}

export async function fullBackup(): Promise<{ success: boolean; fileName?: string; error?: string }> {
  try {
    if (window.electron) {
      return await invoke('full-backup');
    }
    const response = await fetch('/api/full-backup', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error in fullBackup:', error);
    return { success: false, error: String(error) };
  }
}

export async function restoreBackup(zipPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (window.electron) {
      return await invoke('restore-backup', zipPath);
    }
    const response = await fetch('/api/restore-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipPath }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error in restoreBackup:', error);
    return { success: false, error: String(error) };
  }
}

export async function resetApplication(): Promise<{ success: boolean; error?: string }> {
  try {
    if (window.electron) {
      return await invoke('reset-app');
    }
    const response = await fetch('/api/reset-app', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error in resetApplication:', error);
    return { success: false, error: String(error) };
  }
}

export async function selectZipFile(): Promise<string | null> {
  try {
    if (window.electron) {
      return await invoke('select-zip-file');
    }
    // Web fallback for testing: ask user for a path via prompt
    // This is useful for automated tests using page.on('dialog')
    return window.prompt("Enter absolute path to zip file:");
  } catch (error) {
    console.error('Error selecting zip file:', error);
    return null;
  }
}

export async function fetchBackupInfo(): Promise<{ count: number; latestDate: string | null }> {
  try {
    if (window.electron) {
      return await invoke('get-backup-info');
    }
    const response = await fetch('/api/backup-info');
    if (!response.ok) throw new Error(`Failed to fetch backup info: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching backup info:', error);
    return { count: 0, latestDate: null };
  }
}

export async function fetchSettings(): Promise<{ exportPath?: string, rawCsvFolderPath?: string }> {
  try {
    if (window.electron) {
      return await invoke('get-settings');
    }
    const response = await fetch('/api/settings');
    if (!response.ok) throw new Error(`Failed to fetch settings: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {};
  }
}

export async function selectDirectory(title?: string): Promise<string | null> {
  try {
    if (window.electron) {
      return await invoke('select-directory', title);
    }
    // Web fallback for testing: ask user for a path via prompt
    return window.prompt(title || "Enter absolute path to directory:");
  } catch (error) {
    console.error('Error selecting directory:', error);
    return null;
  }
}

export async function setExportPath(path: string): Promise<{ success: boolean, error?: string }> {
  try {
    if (window.electron) {
      return await invoke('set-export-path', path);
    }
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportPath: path }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error setting export path:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchRawCsvFolderPath(): Promise<string> {
  try {
    if (window.electron) {
      return await invoke('get-raw-csv-folder-path');
    }
    return "";
  } catch (error) {
    console.error('Error fetching raw CSV folder path:', error);
    return "";
  }
}

export async function setRawCsvFolderPath(path: string): Promise<{ success: boolean, error?: string }> {
  try {
    if (window.electron) {
      return await invoke('set-raw-csv-folder-path', path);
    }
    return { success: false, error: "Not supported in web mode" };
  } catch (error) {
    console.error('Error setting raw CSV folder path:', error);
    return { success: false, error: String(error) };
  }
}

export async function scanFolder(): Promise<{ success: boolean, error?: string }> {
  try {
    if (window.electron) {
      return await invoke('scan-folder');
    }
    return { success: false, error: "Not supported in web mode" };
  } catch (error) {
    console.error('Error scanning folder:', error);
    return { success: false, error: String(error) };
  }
}
