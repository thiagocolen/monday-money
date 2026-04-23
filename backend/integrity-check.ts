import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { getSha256, getCoreDir } from './utils.js';


export function integrityCheck() {
  const coreDir = path.join(getCoreDir(), 'data');
  const targetFiles = [
    'monthly-transactions.csv',
    'monthly-transactions-category.csv',
    'binance-transaction-history.csv',
    'binance-deposit-withdraw-history.csv',
    'binance-fiat-deposit-withdraw-history.csv'
  ];

  let filesWithErrors: string[] = [];
  let filesWithoutErrors: string[] = [];
  let overallSuccess = true;

  for (const fileName of targetFiles) {
    const filePath = path.join(coreDir, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`File ${fileName} not found in ${coreDir}.`);
      filesWithErrors.push(fileName);
      overallSuccess = false;
      continue;
    }

    console.log(`Checking integrity of ${fileName}...`);
    
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      console.error(`Failed to read ${fileName}.`);
      filesWithErrors.push(fileName);
      overallSuccess = false;
      continue;
    }

    const data = Papa.parse<any>(content, { header: true, skipEmptyLines: true }).data;
    if (!data || data.length === 0) {
      console.warn(`File ${fileName} is empty.`);
      filesWithoutErrors.push(fileName);
      continue;
    }

    let fileSuccess = true;
    let rowCount = 0;
    const lastChainHashes: Record<string, string> = {};
    let globalSeedHash = '';

    for (const row of data) {
      rowCount++;
      
      const cols = Object.keys(row).filter(k => k !== 'row-hash');
      const rowValues = cols.map(c => String(row[c] || ''));
      
      const recalculatedRowHash = getSha256(rowValues.join(','));
      
      if (recalculatedRowHash !== row['row-hash']) {
        const rowValuesAlt = cols.map(c => String(row[c] || '').replace(/"/g, ''));
        const recalculatedRowHashAlt = getSha256(rowValuesAlt.join(','));
        
        if (recalculatedRowHashAlt !== row['row-hash']) {
          console.error(`Row ${rowCount} integrity failure in ${fileName}: row-hash mismatch.`);
          fileSuccess = false;
          overallSuccess = false;
        }
      }

      let isChainRow = false;
      let ownerKey = '';
      let currentHash = '';
      let isSeed = false;

      if (fileName === 'monthly-transactions.csv') {
        if (row.amount === 0 || row.amount === '0') {
          isChainRow = true;
          ownerKey = row.owner;
          currentHash = row.description;
          if (ownerKey === 'seed-transaction') isSeed = true;
        }
      } else if (fileName === 'binance-transaction-history.csv') {
        if (row.Operation === 'chain' || row.Change === 0 || row.Change === '0') {
          isChainRow = true;
          ownerKey = row.owner;
          currentHash = row.Remark;
          if (ownerKey === 'seed' || row.Account === 'seed') isSeed = true;
        }
      } else if (fileName.includes('binance-') && fileName.includes('-history.csv')) {
        if (row.Status === 'chain' || row.Status === 'seed' || row.Amount === 0 || row.Amount === '0') {
          isChainRow = true;
          ownerKey = row.owner;
          currentHash = row.TXID ? row.TXID : row['Transaction ID'];
          if (row.Status === 'seed' || row.owner === 'seed') isSeed = true;
        }
      }

      if (isChainRow) {
        currentHash = currentHash.replace(/"/g, '');
        if (isSeed) {
          lastChainHashes[ownerKey] = currentHash;
          globalSeedHash = currentHash;
        } else {
          if (!(('pending_' + ownerKey) in lastChainHashes)) {
            lastChainHashes['pending_' + ownerKey] = currentHash;
          } else {
            const firstHash = lastChainHashes['pending_' + ownerKey];
            let prevSecondHash = lastChainHashes[ownerKey];
            if (!prevSecondHash) prevSecondHash = globalSeedHash;
            
            if (!prevSecondHash) {
              console.error(`Row ${rowCount} chain integrity failure in ${fileName}: No previous chain hash or seed found for '${ownerKey}'.`);
              fileSuccess = false;
              overallSuccess = false;
            } else {
              const expectedSecondHash = getSha256(firstHash + prevSecondHash);
              if (currentHash !== expectedSecondHash) {
                console.error(`Row ${rowCount} chain integrity failure in ${fileName} for '${ownerKey}'. Expected ${expectedSecondHash}, got ${currentHash}`);
                fileSuccess = false;
                overallSuccess = false;
              }
            }
            lastChainHashes[ownerKey] = currentHash;
            delete lastChainHashes['pending_' + ownerKey];
          }
        }
      }
    }

    if (fileSuccess) {
      filesWithoutErrors.push(fileName);
    } else {
      filesWithErrors.push(fileName);
    }
  }

  console.log('\nIntegrity Check Summary:');
  console.log(`Files without errors (${filesWithoutErrors.length}):`);
  filesWithoutErrors.forEach(f => console.log(` - ${f}`));

  if (filesWithErrors.length > 0) {
    console.log(`Files with errors (${filesWithErrors.length}):`);
    filesWithErrors.forEach(f => console.log(` - ${f}`));
  }

  if (overallSuccess) {
    console.log('\nSUCCESS: All target CSV files passed integrity checks.');
  } else {
    console.log('\nFAILURE: Integrity check failed for one or more files.');
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
      process.exit(1);
    } else {
      throw new Error('Integrity check failed');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  integrityCheck();
}
