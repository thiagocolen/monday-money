import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getCoreDir } from './utils.js';

export function clearLedger() {
  const dataDir = path.join(getCoreDir(), 'data');
  console.log(`Clearing generated ledger files in: ${dataDir}`);
  
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (file.endsWith('.csv')) {
        const filePath = path.join(dataDir, file);
        if (file === 'monthly-transactions-category.csv') {
          console.log('Cleaning chain-transaction entries from category file...');
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const header = lines[0];
            const remainingLines = lines.slice(1).filter(line => {
              const trimmed = line.trim();
              if (!trimmed) return false;
              // Keep lines that don't have 'chain-transaction' as category
              // Format: transaction-hash,category,tags,row-hash
              const parts = trimmed.split(',');
              return parts[1] !== 'chain-transaction';
            });
            fs.writeFileSync(filePath, [header, ...remainingLines].join('\n').trim() + '\n', 'utf8');
          } catch (e) {
            console.error('Failed to clean category file:', e);
          }
          continue;
        }
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore
        }
      }
    }
  }
  console.log('Ledger cleared successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  clearLedger();
}
