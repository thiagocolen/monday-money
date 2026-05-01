import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getCoreDir } from './utils.js';

function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

export function protectFiles() {
  const protectedPath = path.join(getCoreDir(), 'protected');
  
  if (fs.existsSync(protectedPath)) {
    console.log(`Analyzing files in ${protectedPath}...\n`);
    
    const files = getFilesRecursively(protectedPath);
    
    const listProtected: string[] = [];
    const listErrors: string[] = [];
    
    for (const filePath of files) {
      try {
        fs.chmodSync(filePath, 0o444);
        listProtected.push(filePath);
      } catch (err: any) {
        listErrors.push(`${filePath} - ${err.message}`);
      }
    }

    console.log(`--- PROTECTED FILES (${listProtected.length}) ---`);
    for (const p of listProtected) console.log(`  ${p}`);
    
    console.log(`\n--- FILES WITH ERRORS (${listErrors.length}) ---`);
    for (const err of listErrors) console.log(`  ${err}`);
    
    console.log('\nProtection routine finished.');
  } else {
    console.error(`Protected folder not found at: ${protectedPath}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  protectFiles();
}
