import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { getSha256 } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../core/data');
const sourceBaseDir = path.resolve(__dirname, '../core/protected/raw-statement-files');

function testFileAlreadyImported(destFile: string, fileHash: string): boolean {
  const destPath = path.join(dataDir, destFile);
  if (!fs.existsSync(destPath)) return false;

  const content = fs.readFileSync(destPath, 'utf8');
  const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
  
  for (const row of data) {
    if (destFile === 'monthly-transactions.csv') {
      if (row.description === fileHash) return true;
    } else if (destFile === 'binance-transaction-history.csv') {
      if (row.Remark === fileHash) return true;
    } else {
      if (row.TXID === fileHash || row['Transaction ID'] === fileHash) return true;
    }
  }
  return false;
}

function getLastChainTransactionHash(destFile: string, owner: string): string {
  const destPath = path.join(dataDir, destFile);
  if (!fs.existsSync(destPath)) return '';

  const content = fs.readFileSync(destPath, 'utf8');
  const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
  
  let lastHash = '';
  let seedHash = '';

  for (const row of data) {
    if (destFile === 'monthly-transactions.csv') {
      if ((row.amount === 0 || row.amount === '0') && (row.owner === owner || row.owner === 'seed-transaction')) {
        if (row.owner === 'seed-transaction') seedHash = row.description;
        else lastHash = row.description;
      }
    } else if (destFile === 'binance-transaction-history.csv') {
      if ((row.Change === 0 || row.Change === '0') && (row.owner === owner || row.owner === 'seed')) {
        if (row.owner === 'seed') seedHash = row.Remark;
        else lastHash = row.Remark;
      }
    } else {
      if ((row.Amount === 0 || row.Amount === '0') && (row.owner === owner || row.owner === 'seed')) {
        const descValue = row.TXID ? row.TXID : row['Transaction ID'];
        if (row.owner === 'seed') seedHash = descValue;
        else lastHash = descValue;
      }
    }
  }

  if (lastHash) return lastHash;
  return seedHash;
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
  
  const rowContent = vals.join(',').replace(/"/g, '');
  const rowHash = getSha256(rowContent);
  return vals.join(',') + ',' + rowHash;
}

export function dataImportRegistration() {
  if (!fs.existsSync(sourceBaseDir)) {
    console.warn(`Source base directory not found: ${sourceBaseDir}`);
    return;
  }

  const ownerDirs = fs.readdirSync(sourceBaseDir).filter(f => fs.statSync(path.join(sourceBaseDir, f)).isDirectory());

  for (const ownerName of ownerDirs) {
    console.log(`\nScanning files for owner: ${ownerName}`);
    const ownerDirPath = path.join(sourceBaseDir, ownerName);
    const files = fs.readdirSync(ownerDirPath).filter(f => f.endsWith('.csv')).sort();

    for (const file of files) {
      console.log(`Checking ${file}...`);
      const fullPath = path.join(ownerDirPath, file);
      
      let rawContent = fs.readFileSync(fullPath, 'utf8');
      // Convert to CRLF string if it isn't? Powershell reads raw string as is. We'll use getSha256
      const firstHash = getSha256(rawContent);

      let destFile = '';
      if (file.startsWith('account_statement-') || file.startsWith('NU_') || file.startsWith('Nubank_') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/.test(file)) {
        destFile = 'monthly-transactions.csv';
      } else if (file.startsWith('Binance-Transaction-History-')) {
        destFile = 'binance-transaction-history.csv';
      } else if (file.startsWith('Binance-Deposit-History-') || file.startsWith('Binance-Withdraw-History-')) {
        destFile = 'binance-deposit-withdraw-history.csv';
      } else if (file.startsWith('Binance-Fiat-Deposit-History-') || file.startsWith('Binance-Fiat-Withdraw-History-')) {
        destFile = 'binance-fiat-deposit-withdraw-history.csv';
      }

      if (destFile && testFileAlreadyImported(destFile, firstHash)) {
        console.log(`File ${file} already imported. Skipping.`);
        continue;
      }

      let rows: any[] = [];

      if (file.startsWith('account_statement-')) {
        destFile = 'monthly-transactions.csv';
        const lines = rawContent.split('\n');
        const contentBlock = lines.slice(3).join('\n');
        if (!contentBlock.trim()) continue;
        const parsed = Papa.parse<any>(contentBlock, { header: true, delimiter: ';', skipEmptyLines: true }).data;
        
        for (const item of parsed) {
          if (!item.RELEASE_DATE || !item.TRANSACTION_NET_AMOUNT) continue;
          const dateParts = item.RELEASE_DATE.split('-');
          if (dateParts.length !== 3) continue;
          const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          const amount = item.TRANSACTION_NET_AMOUNT.replace('.', '').replace(',', '.');
          rows.push({ date: formattedDate, description: item.TRANSACTION_TYPE, amount, owner: ownerName });
        }
      } else if (file.startsWith('NU_')) {
        destFile = 'monthly-transactions.csv';
        const parsed = Papa.parse<any>(rawContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        for (const item of parsed) {
          if (!item.Data || !item.Valor) continue;
          const dateParts = item.Data.split('/');
          const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          const descCol = Object.keys(item).find(k => k.startsWith('Descri'));
          rows.push({ date: formattedDate, description: item[descCol!], amount: item.Valor, owner: ownerName });
        }
      } else if (file.startsWith('Nubank_')) {
        destFile = 'monthly-transactions.csv';
        const parsed = Papa.parse<any>(rawContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        for (const item of parsed) {
          if (!item.date || !item.amount) continue;
          rows.push({ date: item.date, description: item.title, amount: item.amount, owner: ownerName });
        }
      } else if (file.startsWith('Binance-Transaction-History-')) {
        destFile = 'binance-transaction-history.csv';
        const parsed = Papa.parse<any>(rawContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        for (const item of parsed) {
          if (!item.Time || !item.Coin) continue;
          rows.push({ 'User ID': item['User ID'], Time: item.Time, Account: item.Account, Operation: item.Operation, Coin: item.Coin, Change: item.Change, Remark: item.Remark, owner: ownerName });
        }
      } else if (file.startsWith('Binance-Deposit-History-') || file.startsWith('Binance-Withdraw-History-')) {
        destFile = 'binance-deposit-withdraw-history.csv';
        const type = file.includes('Deposit') ? 'Deposit' : 'Withdraw';
        const parsed = Papa.parse<any>(rawContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        for (const item of parsed) {
          if (!item.Time || !item.Amount) continue;
          const feeVal = item.Fee ? item.Fee : 0;
          rows.push({ Time: item.Time, Coin: item.Coin, Network: item.Network, Amount: item.Amount, Fee: feeVal, Address: item.Address, TXID: item.TXID, Status: item.Status, Type: type, owner: ownerName });
        }
      } else if (file.startsWith('Binance-Fiat-Deposit-History-') || file.startsWith('Binance-Fiat-Withdraw-History-')) {
        destFile = 'binance-fiat-deposit-withdraw-history.csv';
        const type = file.includes('Deposit') ? 'Deposit' : 'Withdraw';
        const parsed = Papa.parse<any>(rawContent, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        for (const item of parsed) {
          if (!item.Time || !item['Transaction ID']) continue;
          const amtCol = Object.keys(item).find(k => k.includes('Amount') && !k.includes('Receive'));
          rows.push({ Time: item.Time, Method: item.Method, Amount: item[amtCol!], 'Receive Amount': item['Receive Amount'], Fee: item.Fee, Status: item.Status, 'Transaction ID': item['Transaction ID'], Type: type, owner: ownerName });
        }
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/.test(file)) {
        destFile = 'monthly-transactions.csv';
        const parts = rawContent.split(';;;;;');
        if (parts.length >= 3) {
          const contentBlock = parts[1].trim();
          if (contentBlock) {
            const parsed = Papa.parse<any>(contentBlock, { header: true, delimiter: ';', skipEmptyLines: true }).data;
            for (const item of parsed) {
              if (!item.Data || item.Data === 'Data') continue;
              const dateParts = item.Data.split('/');
              if (dateParts.length !== 3) continue;
              const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
              
              const histCol = Object.keys(item).find(k => k.startsWith('Hist'));
              const credCol = Object.keys(item).find(k => k.startsWith('Cr') && k.includes('dito'));
              const debCol = Object.keys(item).find(k => k.startsWith('D') && k.includes('bito'));
              
              const creditStr = (credCol && item[credCol]) ? item[credCol].replace('.', '').replace(',', '.').trim() : '';
              const debitStr = (debCol && item[debCol]) ? item[debCol].replace('.', '').replace(',', '.').trim() : '';
              
              let amount = '0';
              if (creditStr && creditStr !== '0' && creditStr !== '0.00') {
                amount = creditStr;
              } else if (debitStr && debitStr !== '0' && debitStr !== '0.00') {
                amount = `-${debitStr}`;
              }
              
              if (amount !== '0') {
                rows.push({ date: formattedDate, description: item[histCol!], amount, owner: ownerName });
              }
            }
          }
        }
      } else {
        console.warn(`Unknown file pattern: ${file}. Skipping.`);
        continue;
      }

      if (rows.length === 0) {
        console.log(`No valid data found in ${file}.`);
        continue;
      }

      const destPath = path.join(dataDir, destFile);
      console.log(`Processing ${file} -> ${destFile} (Owner: ${ownerName})`);
      
      const timeCol = rows[0].date ? 'date' : 'Time';
      rows.sort((a, b) => a[timeCol].localeCompare(b[timeCol]));

      const prevHash = getLastChainTransactionHash(destFile, ownerName);
      const secondHash = getSha256(firstHash + prevHash);
      
      let linesToAppend: string[] = [];
      for (const row of rows) {
        const rowValues = [];
        const propsForHash = [];
        for (const val of Object.values(row)) {
          let strVal = String(val);
          propsForHash.push(strVal);
          if (strVal.includes(',') || strVal.includes('"')) {
            strVal = `"${strVal.replace(/"/g, '""')}"`;
          }
          rowValues.push(strVal);
        }
        const rowContentForHash = propsForHash.join(',');
        const rowHash = getSha256(rowContentForHash);
        linesToAppend.push(rowValues.join(',') + ',' + rowHash);
      }
      
      const lastRow = rows[rows.length - 1];
      const lastTime = lastRow.date ? lastRow.date : lastRow.Time;
      
      linesToAppend.push(createChainRow(firstHash, destFile, ownerName, lastTime, 'chain'));
      linesToAppend.push(createChainRow(secondHash, destFile, ownerName, lastTime, 'chain'));
      
      fs.appendFileSync(destPath, linesToAppend.map(l => l + '\n').join(''), 'utf8');
      
      if (destFile === 'monthly-transactions.csv') {
        const catPath = path.join(dataDir, 'monthly-transactions-category.csv');
        let catLines = '';
        for (const line of linesToAppend.slice(-2)) {
          const rowHash = line.split(',').pop()!;
          const category = 'chain-transaction';
          const tags = '';
          const catRowContent = `${rowHash},${category},${tags}`;
          const catRowHash = getSha256(catRowContent);
          catLines += `${rowHash},${category},${tags},${catRowHash}\n`;
        }
        fs.appendFileSync(catPath, catLines, 'utf8');
      }

      console.log(`Successfully processed ${file}`);
    }
  }
}

if (process.argv[1] === __filename) {
  dataImportRegistration();
}
