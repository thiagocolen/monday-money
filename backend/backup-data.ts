import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCoreDir } from './utils.js';

export function backupData(exportPath: string): string {
  const sourceDir = getCoreDir();
  
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  const timestamp = `${yyyy}-${mm}-${dd}-${hh}-${min}-${ss}`;
  const fileName = `${timestamp}-monday-money-data.zip`;
  const destPath = path.join(exportPath, fileName);

  if (!fs.existsSync(exportPath)) {
    fs.mkdirSync(exportPath, { recursive: true });
  }

  try {
    // Compress-Archive -Path 'source\*' ensures we zip the contents
    const command = `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${destPath}' -Force"`;
    execSync(command, { stdio: 'inherit' });
    return fileName;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}

export function restoreData(zipPath: string) {
  const destDir = getCoreDir();

  // If destination exists, clear it first to avoid merging issues
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const command = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error('Restore failed:', error);
    throw error;
  }
}
