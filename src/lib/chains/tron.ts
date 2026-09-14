/**
 * Tron balance + transaction history via TronGrid's public REST API
 * (api.trongrid.io) — free without an API key at this volume of use (a key
 * only raises rate limits, it isn't required to read account/tx data).
 */

import type { NormalizedTransaction } from './types'

const API_BASE = 'https://api.trongrid.io'
const SUN_PER_TRX = 1e6

export function isValidTronAddress(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(bytes: Uint8Array): string {
  let num = 0n
  for (const b of bytes) num = (num << 8n) | BigInt(b)
  let out = ''
  while (num > 0n) {
    const rem = num % 58n
    out = BASE58_ALPHABET[Number(rem)] + out
    num /= 58n
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out
    else break
  }
  return out || '1'
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return new Uint8Array(digest)
}

/** Tron's raw hex addresses (41-prefixed, 21 bytes) -> base58check display form. */
async function hexToTronAddress(hex: string): Promise<string> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16)
  const checksum = (await sha256(await sha256(bytes))).slice(0, 4)
  const full = new Uint8Array(bytes.length + 4)
  full.set(bytes)
  full.set(checksum, bytes.length)
  return base58Encode(full)
}

interface TronAccount {
  balance?: number
}

export async function fetchTronBalance(address: string): Promise<{ amount: number; raw: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/wallet/getaccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, visible: true }),
    })
    if (!res.ok) return null
    const json: TronAccount = await res.json()
    const sun = json.balance ?? 0
    return { amount: sun / SUN_PER_TRX, raw: String(sun) }
  } catch {
    return null
  }
}

interface TronTx {
  txID: string
  block_timestamp?: number
  ret?: { contractRet?: string }[]
  raw_data?: {
    contract?: Array<{
      type?: string
      parameter?: { value?: { amount?: number; owner_address?: string; to_address?: string } }
    }>
  }
  [key: string]: unknown
}

/**
 * Only native TRX transfers (`TransferContract`) get a decoded amount/direction
 * — everything else TronGrid returns (TRC20 calls, contract triggers, votes,
 * ...) is still included with the full raw payload, just without a decoded
 * amount, so "view all details" still surfaces the complete account activity.
 */
async function normalizeTronTx(tx: TronTx, address: string): Promise<NormalizedTransaction> {
  const contract = tx.raw_data?.contract?.[0]
  const isTransfer = contract?.type === 'TransferContract'
  const value = contract?.parameter?.value

  let direction: NormalizedTransaction['direction'] = 'unknown'
  let amount = 0
  let counterparty: string | undefined

  if (isTransfer && value?.owner_address && value?.to_address) {
    const [ownerB58, toB58] = await Promise.all([
      hexToTronAddress(value.owner_address),
      hexToTronAddress(value.to_address),
    ])
    const fromMe = ownerB58 === address
    const toMe = toB58 === address
    direction = fromMe && toMe ? 'self' : fromMe ? 'out' : toMe ? 'in' : 'unknown'
    amount = (value.amount ?? 0) / SUN_PER_TRX
    counterparty = direction === 'out' ? toB58 : ownerB58
  }

  return {
    id: tx.txID,
    chain: 'tron',
    timestamp: tx.block_timestamp ?? null,
    direction,
    amount,
    ticker: 'TRX',
    counterparty,
    status: tx.ret?.[0]?.contractRet === 'SUCCESS' ? 'confirmed' : 'failed',
    raw: tx as unknown as Record<string, unknown>,
  }
}

/**
 * Full (or incremental, when `sinceTxId` is a previously-seen txid) account
 * activity for a Tron address, paged via TronGrid's fingerprint cursor.
 */
export async function fetchTronTransactions(
  address: string,
  sinceTxId: string | null,
): Promise<NormalizedTransaction[]> {
  const out: TronTx[] = []

  try {
    let url = `${API_BASE}/v1/accounts/${address}/transactions?limit=50&only_confirmed=true`
    let guard = 0
    while (url && guard < 20) {
      const res = await fetch(url)
      if (!res.ok) break
      const json: { data: TronTx[]; meta?: { links?: { next?: string } } } = await res.json()
      if (json.data.length === 0) break
      out.push(...json.data)

      if (sinceTxId && json.data.some((t) => t.txID === sinceTxId)) break
      if (!json.meta?.links?.next) break
      url = json.meta.links.next
      guard++
    }
  } catch {
    /* leave history partial on failure */
  }

  return Promise.all(out.map((tx) => normalizeTronTx(tx, address)))
}
