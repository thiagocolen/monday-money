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
