import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCoreDir } from './utils.js';

/**
 * Escapes a string for safe interpolation inside a *single-quoted* PowerShell
 * string literal (doubling embedded single quotes, PowerShell's own escape
 * rule). Combined with execFileSync (which never goes through cmd.exe / a
 * shell), this closes the command-injection hole where a path containing a
 * quote or a shell metacharacter (e.g. `C:\tmp'; calc; '`) could break out of
 * the quoted argument and run arbitrary commands.
 */
function psQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertNonEmptyPath(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  // Reject NUL / control characters that have no place in a filesystem path.
  // eslint-disable-next-line no-control-regex -- intentional: matching control chars is the point
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
    throw new Error(`${label} contains invalid control characters`);
  }
}

function runPowerShell(script: string): void {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { stdio: 'inherit' },
  );
}

export function backupData(exportPath: string): string {
  assertNonEmptyPath(exportPath, 'exportPath');
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
    const script = `Compress-Archive -Path ${psQuote(sourceDir + '\\*')} -DestinationPath ${psQuote(destPath)} -Force`;
    runPowerShell(script);
    return fileName;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}

export function restoreData(zipPath: string) {
  assertNonEmptyPath(zipPath, 'zipPath');
  const destDir = getCoreDir();

  // If destination exists, clear it first to avoid merging issues
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const script = `Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force`;
    runPowerShell(script);
  } catch (error) {
    console.error('Restore failed:', error);
    throw error;
  }
}
