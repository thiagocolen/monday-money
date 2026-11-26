import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getCoreDir } from './utils.js';

const WALLET_CHAINS = new Set(['bitcoin', 'ethereum', 'bsc', 'solana', 'arbitrum', 'base', 'tron']);

interface WalletEntry {
  id: string;
  chain: string;
  address: string;
  label: string;
  addedAt: number;
}

function dataDir(): string {
  return path.join(getCoreDir(), 'data');
}

function walletsPath(): string {
  return path.join(dataDir(), 'wallets.json');
}

function walletsCachePath(): string {
  return path.join(dataDir(), 'wallets-cache.json');
}

function ensureDataDir() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Validates/normalizes an untrusted wallet-list payload: drops entries with a
 * missing/invalid chain or empty address rather than throwing, regenerates a
 * missing or duplicate id, and caps the label length.
 */
function sanitizeWalletList(input: unknown): WalletEntry[] {
  if (!Array.isArray(input)) return [];
  const seenIds = new Set<string>();
  const out: WalletEntry[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const chain = String(entry.chain ?? '').trim();
    const address = String(entry.address ?? '').trim();
    if (!WALLET_CHAINS.has(chain) || !address) continue;

    let id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seenIds.has(id)) id = crypto.randomUUID();
    seenIds.add(id);

    const label = String(entry.label ?? '').trim().slice(0, 100);
    const addedAt = Number(entry.addedAt);

    out.push({
      id,
      chain,
      address,
      label,
      addedAt: Number.isFinite(addedAt) ? addedAt : Date.now(),
    });
  }

  return out;
}

/**
 * Structural-only sanitization for the derived balance/history cache: drop
 * anything that isn't a well-formed { [walletId]: {...} } map. The values are
 * app-generated, not hand-typed, so they don't need field-level validation.
 */
function sanitizeWalletCache(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [walletId, entry] of Object.entries(input as Record<string, unknown>)) {
    if (entry && typeof entry === 'object') out[walletId] = entry;
  }
  return out;
}

export async function handleGetWallets(): Promise<WalletEntry[]> {
  const filePath = walletsPath();
  if (fs.existsSync(filePath)) {
    try {
      return sanitizeWalletList(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (e) {
      console.error('Error parsing wallets.json', e);
    }
  }
  return [];
}

export async function handleSaveWallets(wallets: unknown): Promise<{ success: boolean }> {
  ensureDataDir();
  fs.writeFileSync(walletsPath(), JSON.stringify(sanitizeWalletList(wallets), null, 2), 'utf8');
  return { success: true };
}

export async function handleGetWalletCache(): Promise<Record<string, unknown>> {
  const filePath = walletsCachePath();
  if (fs.existsSync(filePath)) {
    try {
      return sanitizeWalletCache(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (e) {
      console.error('Error parsing wallets-cache.json', e);
    }
  }
  return {};
}

export async function handleSaveWalletCache(cache: unknown): Promise<{ success: boolean }> {
  ensureDataDir();
  fs.writeFileSync(walletsCachePath(), JSON.stringify(sanitizeWalletCache(cache), null, 2), 'utf8');
  return { success: true };
}
