import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { getSha256, getCoreDir } from './utils.js';

const coreDir = getCoreDir();
const dataDir = path.join(coreDir, 'data');
const sourceBaseDir = path.join(coreDir, 'protected', 'raw-statement-files');

export interface FileParser {
  name: string;
  match: (fileName: string, content: string) => boolean;
  parse: (fileName: string, content: string, ownerName: string) => { destFile: string; rows: any[] };
}

function normalizeAmount(val: string): string {
  if (!val) return '0';
  const trimmed = val.trim();
  // If it contains a comma, we assume Brazilian/European format (e.g., 1.234,56 or 123,45)
  // or a format where comma is the decimal separator.
  if (trimmed.includes(',')) {
    return trimmed.replace(/\./g, '').replace(',', '.');
  }
  // Otherwise assume standard decimal point or integer
  return trimmed;
}

export const PARSERS: FileParser[] = [
  {
    name: 'MercadoPago',
    match: (f) => f.startsWith('account_statement-'),
    parse: (_f, content, owner) => {
      const lines = content.split('\n');
      const contentBlock = lines.slice(3).join('\n');
      if (!contentBlock.trim()) return { destFile: 'monthly-transactions.csv', rows: [] };
      const parsed = Papa.parse<any>(contentBlock, { header: true, delimiter: ';', skipEmptyLines: true }).data;
      const rows = parsed.filter(item => item.RELEASE_DATE && item.TRANSACTION_NET_AMOUNT).map(item => {
        const dateParts = item.RELEASE_DATE.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        return { date: formattedDate, description: item.TRANSACTION_TYPE, amount: normalizeAmount(item.TRANSACTION_NET_AMOUNT), owner };
      });
      return { destFile: 'monthly-transactions.csv', rows };
    }
  },
  {
    name: 'NubankAccount',
    match: (f) => f.startsWith('NU_'),
    parse: (_f, content, owner) => {
      const cleanContent = content.replace(/^\uFEFF/, '').trim();
      const parsed = Papa.parse<any>(cleanContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
      const rows = parsed.filter(item => {
        const keys = Object.keys(item).map(k => k.trim().toLowerCase());
        return keys.includes('data') && keys.includes('valor');
      }).map(item => {
        const getVal = (search: string) => {
          const key = Object.keys(item).find(k => k.trim().toLowerCase() === search.toLowerCase());
          return key ? item[key] : '';
        };

        const dateVal = getVal('data');
        const dateParts = dateVal.split('/');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        const descCol = Object.keys(item).find(k => k.trim().toLowerCase().startsWith('descri'));
        
        // Invert amount: expenses (-) become positive for categorization as per test requirements
        const originalValue = getVal('valor');
        const amount = parseFloat(normalizeAmount(originalValue)) * -1;
        return { date: formattedDate, description: item[descCol!], amount: amount.toString(), owner };
      });
      return { destFile: 'monthly-transactions.csv', rows };
    }
  },
  {
    name: 'NubankCreditCard',
    match: (f) => f.startsWith('Nubank_'),
    parse: (_f, content, owner) => {
      const cleanContent = content.replace(/^\uFEFF/, '').trim();
      const parsed = Papa.parse<any>(cleanContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
      const rows = parsed.filter(item => {
        const keys = Object.keys(item).map(k => k.trim().toLowerCase());
        return keys.includes('date') && (keys.includes('amount') || keys.includes('valor'));
      }).map(item => {
        const getVal = (search: string) => {
          const key = Object.keys(item).find(k => k.trim().toLowerCase() === search.toLowerCase());
          return key ? item[key] : '';
        };

        const originalValue = getVal('amount') || getVal('valor');
        const amount = parseFloat(normalizeAmount(originalValue)) * -1;
        const title = getVal('title') || getVal('description') || getVal('descrição');
        return { date: getVal('date'), description: title, amount: amount.toString(), owner };
      });
      return { destFile: 'monthly-transactions.csv', rows };
    }
  },
  {
    name: 'BinanceTransactionHistory',
    match: (f) => f.startsWith('Binance-Transaction-History-'),
    parse: (_f, content, owner) => {
      const cleanContent = content.replace(/^\uFEFF/, '').trim();
      let results = Papa.parse<any>(cleanContent, { header: true, skipEmptyLines: true });
      
      // Fallback: if auto-detection failed to find multiple columns but we see commas, force it
      if (Object.keys(results.data[0] || {}).length <= 1 && cleanContent.includes(',')) {
        results = Papa.parse<any>(cleanContent, { header: true, delimiter: ',', skipEmptyLines: true });
      }

      const parsed = results.data;
      const rows = parsed.filter(item => {
        const keys = Object.keys(item).map(k => k.trim().toLowerCase());
        return (keys.some(k => k.includes('time')) && keys.some(k => k.includes('coin')));
      }).map(item => {
        const getVal = (search: string) => {
          const key = Object.keys(item).find(k => k.trim().toLowerCase().includes(search.toLowerCase()));
          return key ? item[key] : '';
        };

        const originalValue = getVal('change');
        const change = normalizeAmount(originalValue);
        return {
          'User ID': getVal('user id'), 
          Time: getVal('time'), 
          Account: getVal('account'), 
          Operation: getVal('operation'), 
          Coin: getVal('coin'), 
          Change: change, 
          Remark: getVal('remark'), 
          owner
        };
      });
      return { destFile: 'binance-transaction-history.csv', rows };
    }
  },
  {
    name: 'BinanceDepositWithdrawHistory',
    match: (f) => f.startsWith('Binance-Deposit-History-') || f.startsWith('Binance-Withdraw-History-'),
    parse: (f, content, owner) => {
      const type = f.includes('Deposit') ? 'Deposit' : 'Withdraw';
      const cleanContent = content.replace(/^\uFEFF/, '').trim();
      let results = Papa.parse<any>(cleanContent, { header: true, skipEmptyLines: true });

      // Fallback: if auto-detection failed to find multiple columns but we see commas, force it
      if (Object.keys(results.data[0] || {}).length <= 1 && cleanContent.includes(',')) {
        results = Papa.parse<any>(cleanContent, { header: true, delimiter: ',', skipEmptyLines: true });
      }

      const parsed = results.data;
      const rows = parsed.filter(item => {
        const keys = Object.keys(item).map(k => k.trim().toLowerCase());
        return keys.some(k => k.includes('time')) && (keys.some(k => k.includes('amount')) || keys.some(k => k.includes('change')));
      }).map(item => {
        const getVal = (search: string) => {
          const key = Object.keys(item).find(k => k.trim().toLowerCase().includes(search.toLowerCase()));
          return key ? item[key] : '';
        };

        const originalValue = getVal('amount') || getVal('change');
        const amount = normalizeAmount(originalValue);

        return {
          Time: getVal('time'), 
          Coin: getVal('coin'), 
          Network: getVal('network'), 
          Amount: amount, 
          Fee: normalizeAmount(getVal('fee') || '0'), 
          Address: getVal('address'), 
          TXID: getVal('txid'), 
          Status: getVal('status'), 
          Type: type, 
          owner
        };
      });
      return { destFile: 'binance-deposit-withdraw-history.csv', rows };
    }
  },
  {
    name: 'BinanceFiatHistory',
    match: (f) => f.startsWith('Binance-Fiat-Deposit-History-') || f.startsWith('Binance-Fiat-Withdraw-History-'),
    parse: (f, content, owner) => {
      const isDeposit = f.includes('Deposit');
      const type = isDeposit ? 'Deposit' : 'Withdraw';
      const parsed = Papa.parse<any>(content, { header: true, delimiter: ',', skipEmptyLines: true }).data;
      const rows = parsed.filter(item => item.Time && item['Transaction ID']).map(item => {
        const amtCol = Object.keys(item).find(k => k.includes('Amount') && !k.includes('Receive'));
        const originalValue = item[amtCol!];
        let amount = parseFloat(normalizeAmount(originalValue));
        if (isDeposit) amount = Math.abs(amount);
        else amount = -Math.abs(amount);
        return {
          Time: item.Time, Method: item.Method, Amount: amount.toString(), 'Receive Amount': item['Receive Amount'], Fee: item.Fee, Status: item.Status, 'Transaction ID': item['Transaction ID'], Type: type, owner
        };
      });
      return { destFile: 'binance-fiat-deposit-withdraw-history.csv', rows };
    }
  },
  {
    name: 'BradescoAccount',
    match: (f) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/.test(f),
    parse: (_f, content, owner) => {
      const parts = content.split(';;;;;');
      if (parts.length < 3) return { destFile: 'monthly-transactions.csv', rows: [] };
      const contentBlock = parts[1].trim();
      const parsed = Papa.parse<any>(contentBlock, { header: true, delimiter: ';', skipEmptyLines: true }).data;
      const rows = parsed.filter(item => item.Data && item.Data !== 'Data').map(item => {
        const dateParts = item.Data.split('/');
        if (dateParts.length !== 3) return null;
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        const histCol = Object.keys(item).find(k => k.startsWith('Hist'));
        const credCol = Object.keys(item).find(k => k.startsWith('Cr') && k.includes('dito'));
        const debCol = Object.keys(item).find(k => k.startsWith('D') && k.includes('bito'));
        const creditStr = (credCol && item[credCol]) ? item[credCol].trim() : '';
        const debitStr = (debCol && item[debCol]) ? item[debCol].trim() : '';
        let amount = '0';
        if (creditStr && creditStr !== '0' && creditStr !== '0,00') amount = normalizeAmount(creditStr);
        else if (debitStr && debitStr !== '0' && debitStr !== '0,00') amount = `-${normalizeAmount(debitStr)}`;
        return amount !== '0' ? { date: formattedDate, description: item[histCol!], amount, owner } : null;
      }).filter(Boolean);
      return { destFile: 'monthly-transactions.csv', rows: rows as any[] };
    }
  }
];

function testFileAlreadyImported(destFile: string, fileHash: string): boolean {
  const destPath = path.join(dataDir, destFile);
  if (!fs.existsSync(destPath)) return false;
  const content = fs.readFileSync(destPath, 'utf8');
  const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
  return data.some(row => {
    if (destFile === 'monthly-transactions.csv') return row.description === fileHash;
    if (destFile === 'binance-transaction-history.csv') return row.Remark === fileHash;
    return row.TXID === fileHash || row['Transaction ID'] === fileHash;
  });
}

function getLastChainTransactionHash(destFile: string, owner: string): string {
  const destPath = path.join(dataDir, destFile);
  if (!fs.existsSync(destPath)) return '';
  const content = fs.readFileSync(destPath, 'utf8');
  const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
  let lastHash = '', seedHash = '';
  for (const row of data) {
    if (destFile === 'monthly-transactions.csv') {
      if ((row.amount === 0 || row.amount === '0') && (row.owner === owner || row.owner === 'seed-transaction')) {
        if (row.owner === 'seed-transaction') seedHash = row.description; else lastHash = row.description;
      }
    } else if (destFile === 'binance-transaction-history.csv') {
      if ((row.Change === 0 || row.Change === '0') && (row.owner === owner || row.owner === 'seed')) {
        if (row.owner === 'seed') seedHash = row.Remark; else lastHash = row.Remark;
      }
    } else {
      if ((row.Amount === 0 || row.Amount === '0') && (row.owner === owner || row.owner === 'seed')) {
        const descValue = row.TXID ? row.TXID : row['Transaction ID'];
        if (row.owner === 'seed') seedHash = descValue; else lastHash = descValue;
      }
    }
  }
  return lastHash || seedHash;
}

function createChainRow(hash: string, destFile: string, owner: string, time: string, status: string): string {
  let vals: string[] = [];
  if (destFile === 'monthly-transactions.csv') {
    vals = [time, `"${hash}"`, '0', owner];
  } else if (destFile === 'binance-transaction-history.csv') {
    vals = [owner, time, 'chain', 'chain', 'chain', '0', `"${hash}"`, owner];
  } else if (destFile === 'binance-deposit-withdraw-history.csv') {
    vals = [time, 'chain', 'chain', '0', '0', 'chain', `"${hash}"`, status, 'chain', owner];
  } else if (destFile === 'binance-fiat-deposit-withdraw-history.csv') {
    vals = [time, 'chain', '0', '0', '0', status, `"${hash}"`, 'chain', owner];
  }
  const rowHash = getSha256(vals.join(',').replace(/"/g, ''));
  return vals.join(',') + ',' + rowHash;
}

export function dataImportRegistration() {
  if (!fs.existsSync(sourceBaseDir)) return;
  const ownerDirs = fs.readdirSync(sourceBaseDir).filter(f => fs.statSync(path.join(sourceBaseDir, f)).isDirectory());

  const existingHashesCache = new Map<string, Set<string>>();

  const getExistingHashes = (destFile: string): Set<string> => {
    if (existingHashesCache.has(destFile)) return existingHashesCache.get(destFile)!;
    const set = new Set<string>();
    const destPath = path.join(dataDir, destFile);
    if (fs.existsSync(destPath)) {
      const content = fs.readFileSync(destPath, 'utf8');
      const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
      for (const row of data) {
        const hash = row['row-hash'];
        if (hash) set.add(hash);
      }
    }
    existingHashesCache.set(destFile, set);
    return set;
  };

  for (const ownerName of ownerDirs) {
    const ownerDirPath = path.join(sourceBaseDir, ownerName);
    const files = fs.readdirSync(ownerDirPath).filter(f => f.endsWith('.csv')).sort();

    for (const file of files) {
      const fullPath = path.join(ownerDirPath, file);
      const rawContent = fs.readFileSync(fullPath, 'utf8');
      const firstHash = getSha256(rawContent);

      const parser = PARSERS.find(p => p.match(file, rawContent));
      if (!parser) {
        console.warn(`Unknown file pattern: ${file}. Skipping.`);
        continue;
      }

      const { destFile, rows } = parser.parse(file, rawContent, ownerName);
      if (testFileAlreadyImported(destFile, firstHash)) {
        console.log(`File ${file} already imported. Skipping.`);
        continue;
      }

      if (rows.length === 0) {
        console.log(`No valid data found in ${file}.`);
        continue;
      }

      console.log(`Processing ${file} (via ${parser.name}) -> ${destFile} (Owner: ${ownerName})`);
      const timeCol = rows[0].date ? 'date' : 'Time';
      rows.sort((a, b) => a[timeCol].localeCompare(b[timeCol]));

      const existingHashes = getExistingHashes(destFile);
      const linesToAppend: string[] = [];

      for (const row of rows) {
        const propsForHash = Object.values(row).map(v => String(v));
        const rowHash = getSha256(propsForHash.join(','));
        
        if (existingHashes.has(rowHash)) continue;

        const rowValues = propsForHash.map(strVal => (strVal.includes(',') || strVal.includes('"')) ? `"${strVal.replace(/"/g, '""')}"` : strVal);
        linesToAppend.push(rowValues.join(',') + ',' + rowHash);
        existingHashes.add(rowHash);
      }

      if (linesToAppend.length === 0) {
        console.log(`All transactions in ${file} are already imported. Skipping.`);
        continue;
      }

      const prevHash = getLastChainTransactionHash(destFile, ownerName);
      const secondHash = getSha256(firstHash + prevHash);
      
      const lastTime = rows[rows.length - 1][timeCol];
      linesToAppend.push(createChainRow(firstHash, destFile, ownerName, lastTime, 'chain'));
      linesToAppend.push(createChainRow(secondHash, destFile, ownerName, lastTime, 'chain'));
      
      fs.appendFileSync(path.join(dataDir, destFile), linesToAppend.join('\n') + '\n', 'utf8');
      
      if (destFile === 'monthly-transactions.csv') {
        const catPath = path.join(dataDir, 'monthly-transactions-category.csv');
        const catLines = linesToAppend.slice(-2).map(line => {
          const rowHash = line.split(',').pop()!;
          const content = `${rowHash},chain-transaction,`;
          return `${content},${getSha256(content)}`;
        }).join('\n') + '\n';
        fs.appendFileSync(catPath, catLines, 'utf8');
      }
      console.log(`Successfully processed ${file}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) dataImportRegistration();
