import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getCoreDir } from './utils.js';

export function resetCsvFiles() {
  const coreDir = getCoreDir();
  const dataDir = path.join(coreDir, 'data');
  console.log(`Resetting all generated data: ${dataDir}`);
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const protectedRawPath = path.join(coreDir, 'protected', 'raw-statement-files');
  console.log(`Resetting all protected raw statement files: ${protectedRawPath}`);
  if (fs.existsSync(protectedRawPath)) {
    fs.rmSync(protectedRawPath, { recursive: true, force: true });
    fs.mkdirSync(protectedRawPath, { recursive: true });
  } else {
    fs.mkdirSync(protectedRawPath, { recursive: true });
  }
  
  console.log('Full factory reset successful. All data and source files have been cleared.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetCsvFiles();
}
