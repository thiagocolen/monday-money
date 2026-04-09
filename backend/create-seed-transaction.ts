import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSha256 } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSeedTransaction() {
  const dataDir = path.resolve(__dirname, '../core/data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const targets = [
    {
      Path: path.join(dataDir, 'monthly-transactions.csv'),
      Header: 'date,description,amount,owner,row-hash',
      Seed: { date: '2026-01-01', amount: 0, owner: 'seed-transaction' }
    },
    {
      Path: path.join(dataDir, 'monthly-transactions-category.csv'),
      Header: 'transaction-hash,category,tags,row-hash'
    },
    {
      Path: path.join(dataDir, 'binance-transaction-history.csv'),
      Header: 'User ID,Time,Account,Operation,Coin,Change,Remark,owner,row-hash',
      Seed: { 'User ID': '0', Time: '2026-01-01 00:00:00', Account: 'seed', Operation: 'seed', Coin: 'seed', Change: 0, owner: 'seed' }
    },
    {
      Path: path.join(dataDir, 'binance-deposit-withdraw-history.csv'),
      Header: 'Time,Coin,Network,Amount,Fee,Address,TXID,Status,Type,owner,row-hash',
      Seed: { Time: '2026-01-01 00:00:00', Coin: 'seed', Network: 'seed', Amount: 0, Fee: 0, Address: 'seed', TXID: 'seed', Status: 'seed', Type: 'seed', owner: 'seed' }
    },
    {
      Path: path.join(dataDir, 'binance-fiat-deposit-withdraw-history.csv'),
      Header: 'Time,Method,Amount,Receive Amount,Fee,Status,Transaction ID,Type,owner,row-hash',
      Seed: { Time: '2026-01-01 00:00:00', Method: 'seed', Amount: 0, 'Receive Amount': 0, Fee: 0, Status: 'seed', 'Transaction ID': 'seed', Type: 'seed', owner: 'seed' }
    }
  ];

  for (const target of targets) {
    let restoreFromBackup = false;

    if (target.Path.includes('monthly-transactions-category.csv')) {
      const backupDir = path.resolve(__dirname, '../core/protected/monthly-transactions-category-bkp');
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => f.startsWith('monthly-transactions-category-') && f.endsWith('-bkp.csv'));
        if (files.length > 0) {
          files.sort((a, b) => {
            return fs.statSync(path.join(backupDir, b)).mtimeMs - fs.statSync(path.join(backupDir, a)).mtimeMs;
          });
          const latestBackup = files[0];
          console.log(`Restoring category file from latest backup: ${latestBackup}...`);
          fs.copyFileSync(path.join(backupDir, latestBackup), target.Path);
          fs.chmodSync(target.Path, 0o666);
          restoreFromBackup = true;
        }
      }
    }

    if (!restoreFromBackup) {
      console.log(`Initializing ${target.Path}...`);
      fs.writeFileSync(target.Path, target.Header + '\n', 'utf8');
    }

    if (target.Seed) {
      const content = fs.readFileSync(target.Path, 'utf8').split('\n')[0].trim();
      const seedHash = getSha256(content + 'MondayMoney');

      const cols = target.Header.split(',').map(c => c.trim());
      const rowValues: string[] = [];

      for (const col of cols) {
        if (col === 'row-hash') continue;

        if (['description', 'Remark', 'Transaction ID', 'TXID'].includes(col)) {
          rowValues.push(seedHash);
        } else if (col in target.Seed) {
          rowValues.push(String((target.Seed as any)[col]));
        } else {
          rowValues.push('seed');
        }
      }

      const rowContentForHash = rowValues.join(',');
      const rowHash = getSha256(rowContentForHash);

      const formattedValues = rowValues.map(val => {
        if (val.includes(',') || val.includes('"') || val.length > 32) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });

      const seedRow = formattedValues.join(',') + ',' + rowHash;
      fs.appendFileSync(target.Path, seedRow + '\n', 'utf8');

      if (target.Path.includes('monthly-transactions.csv')) {
        const catPath = path.join(dataDir, 'monthly-transactions-category.csv');
        const category = 'chain-transaction';
        const tags = '';
        const catRowContent = `${rowHash},${category},${tags}`;
        const catRowHash = getSha256(catRowContent);
        const newEntry = `${rowHash},${category},${tags},${catRowHash}\n`;

        if (fs.existsSync(catPath)) {
          const existing = fs.readFileSync(catPath, 'utf8');
          if (!existing.includes(newEntry.trim())) {
            fs.appendFileSync(catPath, newEntry, 'utf8');
          }
        } else {
          fs.writeFileSync(catPath, 'transaction-hash,category,tags,row-hash\n', 'utf8');
          fs.appendFileSync(catPath, newEntry, 'utf8');
        }
      }
    }
  }

  console.log('Seed transactions created successfully.');
}

if (process.argv[1] === __filename) {
  createSeedTransaction();
}
