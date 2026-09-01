import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

export const DEFAULT_CATEGORIES = [
  { name: "NULLED", color: "#2e2e2eff", isDefault: true },
  { name: "OTHERS", color: "#a5a5a5ff", isDefault: true },
  { name: "HOUSE", color: "#8d0000ff", isDefault: true },
  { name: "ONLINE_SERVICES", color: "#b9009aff", isDefault: true },
  { name: "HEALTH", color: "#ff0000ff", isDefault: true },
  { name: "SUPERMARKET", color: "#ff4800ff", isDefault: true },
  { name: "FOOD", color: "#ffc400ff", isDefault: true },
  { name: "TRANSPORTATION", color: "#ac5b5bff", isDefault: true },
  { name: "INVESTMENTS", color: "#216dcaff", isDefault: true },
  { name: "INCOME", color: "#3da72fff", isDefault: true },
];

export function getSha256(inputString: string | Buffer): string {
  const content =
    typeof inputString === "string"
      ? inputString
      : inputString.toString("utf8");
  return crypto
    .createHash("sha256")
    .update(content, "utf8")
    .digest("hex")
    .toLowerCase();
}

/**
 * Returns the path to the 'core' directory.
 * In development, it's the one in the source tree.
 * In production, it's in the user's data directory to allow writes,
 * or at a custom path provided by the user.
 */
export function getSettingsPath(): string {
  const appName = "MondayMoney";
  const userDataPath = process.env.APPDATA
    ? path.join(process.env.APPDATA, appName)
    : path.join(process.env.USERPROFILE || "", ".mondaymoney");
  
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return path.join(userDataPath, "settings.json");
}

export function getSettings(): { exportPath?: string, rawCsvFolderPath?: string } {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch (e) {
      console.error("Error reading settings.json", e);
    }
  }
  return {};
}

/**
 * Rejects values that can't be a real filesystem path: not a non-empty
 * string, or containing NUL / control characters. This is intentionally
 * permissive about which *printable* characters are allowed (Windows paths
 * legitimately allow quotes, ampersands, semicolons, etc.) — the actual
 * defense against these values reaching a shell lives at the point they're
 * used (see backend/backup-data.ts), this is just a sanity guard.
 */
function assertValidPathSetting(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  // eslint-disable-next-line no-control-regex -- intentional: matching control chars is the point
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
    throw new Error(`${label} contains invalid control characters`);
  }
}

export function saveSettings(settings: { exportPath?: string, rawCsvFolderPath?: string }) {
  if (settings.exportPath !== undefined) assertValidPathSetting(settings.exportPath, 'exportPath');
  if (settings.rawCsvFolderPath !== undefined) assertValidPathSetting(settings.rawCsvFolderPath, 'rawCsvFolderPath');

  const settingsPath = getSettingsPath();
  const currentSettings = getSettings();
  const newSettings = { ...currentSettings, ...settings };
  fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
}

export function deleteSettings() {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    fs.unlinkSync(settingsPath);
  }
}

export function getCoreDir(): string {
  const currentFilename = fileURLToPath(import.meta.url);
  const currentDirname = path.dirname(currentFilename);

  // If we are in Electron and not in dev, use userData
  const isPackaged = currentDirname.includes("app.asar");

  const appName = "MondayMoney";
  const userDataPath = process.env.APPDATA
    ? path.join(process.env.APPDATA, appName)
    : path.join(process.env.USERPROFILE || "", ".mondaymoney");

  if (isPackaged) {
    const prodCoreDir = path.join(userDataPath, "core");
    return prodCoreDir;
  }

  // Dev mode - always use the local 'core' folder in the project root
  // This ensures data is moved inside the application as requested
  const cwdPath = path.resolve(process.cwd(), "core");
  return cwdPath;
}

export function ensureCoreStructure(coreDir: string) {
  if (!fs.existsSync(coreDir)) {
    fs.mkdirSync(coreDir, { recursive: true });
  }
  const subDirs = [
    path.join(coreDir, "data"),
    path.join(coreDir, "protected", "raw-statement-files"),
  ];

  subDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Resolves a path and ensures it stays within the intended base directory.
 * Prevents path traversal attacks.
 */
export function resolveSafePath(baseDir: string, ...parts: string[]): string {
  // Sanitize parts to remove potentially dangerous characters
  const sanitizedParts = parts.map(
    (part) =>
      part
        .replace(/[\\/]/g, "_") // Replace slashes with underscores
        .replace(/^\.+/g, ""), // Remove leading dots
  );

  const resolvedPath = path.resolve(baseDir, ...sanitizedParts);
  const normalizedBase = path.resolve(baseDir);
  const boundary = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;

  // Require a path-separator boundary, not just a string prefix — otherwise
  // a sibling directory that merely starts with the same characters (e.g.
  // `baseDir-evil` vs `baseDir`) would incorrectly pass the check.
  if (resolvedPath !== normalizedBase && !resolvedPath.startsWith(boundary)) {
    throw new Error(
      `Security Violation: Path traversal detected. Attempted to access ${resolvedPath} outside of ${baseDir}`,
    );
  }

  return resolvedPath;
}
