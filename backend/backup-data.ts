import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getCoreDir } from './utils.js';

export function backupData() {
  const sourceDir = getCoreDir();
  const destBaseDir = 'D:\\GDrives\\thiago.souzacolen\\private\\me-first-and-the-gimme-gimmes\\monday-monday\\2026-MondayMoney-RAW-CSV\\thiago';

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const fileName = `${dateStr}-monday-money-data.zip`;
  const destPath = path.join(destBaseDir, fileName);

  if (!fs.existsSync(destBaseDir)) {
    console.log(`Creating destination directory: ${destBaseDir}`);
    fs.mkdirSync(destBaseDir, { recursive: true });
  }

  console.log(`Backing up from: ${sourceDir}`);
  console.log(`To: ${destPath}`);

  try {
    // Compress-Archive -Path 'source\*' ensures we zip the contents, not the folder itself as a single entry
    // -Force overwrites existing backup for the same day if it exists
    // We use -NoProfile to speed up PowerShell startup
    const command = `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${destPath}' -Force"`;
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    console.log('\nBackup completed successfully.');
  } catch (error) {
    console.error('\nBackup failed:', error);
    throw error;
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  backupData();
}
