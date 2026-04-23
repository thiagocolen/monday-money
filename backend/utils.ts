import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export function getSha256(inputString: string | Buffer): string {
  const content = typeof inputString === 'string' ? inputString : inputString.toString('utf8');
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').toLowerCase();
}

/**
 * Returns the path to the 'core' directory.
 * In development, it's the one in the source tree.
 * In production, it's in the user's data directory to allow writes.
 */
export function getCoreDir(): string {
  const currentFilename = fileURLToPath(import.meta.url);
  const currentDirname = path.dirname(currentFilename);

  // If we are in Electron and not in dev, use userData
  // We can check if we are in an ASAR
  const isPackaged = currentDirname.includes('app.asar');
  
  if (isPackaged) {
    // In Electron main process, we could use app.getPath('userData')
    // But this utility might be called from contexts where 'app' is not yet ready or imported
    // As a fallback for portable/packaged apps, we can use a folder in %APPDATA%
    const appName = 'MondayMoney';
    const userDataPath = process.env.APPDATA 
      ? path.join(process.env.APPDATA, appName)
      : path.join(process.env.USERPROFILE || '', '.mondaymoney');
      
    const prodCoreDir = path.join(userDataPath, 'core');
    
    // Ensure it exists and has the basic structure
    if (!fs.existsSync(prodCoreDir)) {
      fs.mkdirSync(prodCoreDir, { recursive: true });
      fs.mkdirSync(path.join(prodCoreDir, 'data'), { recursive: true });
      fs.mkdirSync(path.join(prodCoreDir, 'protected', 'raw-statement-files'), { recursive: true });
      fs.mkdirSync(path.join(prodCoreDir, 'protected', 'monthly-transactions-category-bkp'), { recursive: true });
      
      // Copy initial data if available in the bundle
      const bundleCoreDir = path.resolve(currentDirname, '../core');
      if (fs.existsSync(bundleCoreDir)) {
        copyRecursiveSync(bundleCoreDir, prodCoreDir);
      }
    }
    
    return prodCoreDir;
  }

  // Dev mode
  return path.resolve(currentDirname, '../core');
}

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    // Don't overwrite if it already exists in dest to avoid losing user data 
    // (though in first run it won't exist)
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Resolves a path and ensures it stays within the intended base directory.
 * Prevents path traversal attacks.
 */
export function resolveSafePath(baseDir: string, ...parts: string[]): string {
  // Sanitize parts to remove potentially dangerous characters
  const sanitizedParts = parts.map(part => 
    part.replace(/[\\/]/g, '_') // Replace slashes with underscores
        .replace(/^\.+/g, '')    // Remove leading dots
  );

  const resolvedPath = path.resolve(baseDir, ...sanitizedParts);

  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error(`Security Violation: Path traversal detected. Attempted to access ${resolvedPath} outside of ${baseDir}`);
  }

  return resolvedPath;
}
