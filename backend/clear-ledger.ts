import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function clearLedger() {
  const dataDir = path.resolve(__dirname, '../core/data');
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

if (process.argv[1] === __filename) {
  clearLedger();
}
