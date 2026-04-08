import Papa from 'papaparse';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  tags: string;
  owner: string;
  rowHash: string;
}

export interface BinanceTransaction {
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
    const response = await fetch(`/api/data/monthly-transactions.csv?t=${timestamp}`);
    if (!response.ok) throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    const csvData = await response.text();
    
    let metadataMap: Record<string, { category: string, tags: string }> = {};
    try {
      const catResponse = await fetch(`/api/data/monthly-transactions-category.csv?t=${timestamp}`);
      if (catResponse.ok) {
        const catCsv = await catResponse.text();
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
          resolve(transactions);
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
    const response = await fetch(`${url}?t=${timestamp}`);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const csvData = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse<T>(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data);
        },
        error: (error: Error) => reject(error)
      });
    });
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    throw error;
  }
}

export async function saveMetadata(transactionHash: string, category: string, tags: string): Promise<boolean> {
  try {
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
    const results = await Promise.all(
      updates.map(u => saveCategory(u.transactionHash, u.category))
    );
    return results.every(r => r === true);
  } catch (error) {
    console.error('Error saving bulk categories:', error);
    return false;
  }
}

export async function backupCategories(): Promise<{ success: boolean; fileName?: string; error?: string }> {
  try {
    const response = await fetch('/api/backup-categories', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error backing up categories:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchBackupInfo(): Promise<{ count: number; latestDate: string | null }> {
  try {
    const response = await fetch('/api/backup-info');
    if (!response.ok) throw new Error(`Failed to fetch backup info: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching backup info:', error);
    return { count: 0, latestDate: null };
  }
}

export async function fetchOwners(): Promise<string[]> {
  try {
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

export interface ImportHistory {
  fileName: string;
  owner: string;
  processedDate: string;
  totalTransactions: number;
  importedTransactions: number;
  notImportedTransactions: number;
}

export async function fetchImportHistory(): Promise<ImportHistory[]> {
  try {
    const response = await fetch('/api/import-history');
    if (!response.ok) throw new Error('Failed to fetch import history');
    return await response.json();
  } catch (error) {
    console.error('Error fetching import history:', error);
    return [];
  }
}
