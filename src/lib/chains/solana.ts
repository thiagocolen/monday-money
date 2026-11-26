/**
 * Solana balance + transaction history via the public JSON-RPC endpoint, using
 * plain `fetch` POSTs (no `@solana/web3.js`) — the RPC surface needed here is
 * a handful of well-documented methods, and the library assumes a Node
 * `Buffer` global the Vite renderer bundle doesn't provide without a polyfill.
 */

import type { NormalizedTransaction } from './types'

/**
 * `api.mainnet-beta.solana.com` (Solana Labs' public endpoint) rejects any
 * request carrying an `Origin` header with a 403 — i.e. it always fails for
 * real browser/Electron traffic, not just under load. publicnode's mirror
 * handles the same requests fine, so it's tried first; the official endpoint
 * is kept as a fallback for non-browser callers, with Ankr last.
 */
const RPC_URLS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
]
const LAMPORTS_PER_SOL = 1e9

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())
}

let rpcId = 0
async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      })
      if (!res.ok) continue
      const json = await res.json()
      if (json.error) continue
      return json.result as T
    } catch {
      continue
    }
  }
  return null
}

async function rpcBatch<T>(calls: { method: string; params: unknown[] }[]): Promise<(T | null)[]> {
  if (calls.length === 0) return []
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          calls.map((c) => ({ jsonrpc: '2.0', id: ++rpcId, method: c.method, params: c.params })),
        ),
      })
      if (!res.ok) continue
      const json: Array<{ result?: T; error?: unknown }> = await res.json()
      return json.map((r) => (r.error ? null : (r.result ?? null)))
    } catch {
      continue
    }
  }
  return calls.map(() => null)
}

export async function fetchSolanaBalance(address: string): Promise<{ amount: number; raw: string } | null> {
  const result = await rpcCall<{ value: number }>('getBalance', [address])
  if (result == null) return null
  return { amount: result.value / LAMPORTS_PER_SOL, raw: String(result.value) }
}

interface SolanaSignatureInfo {
  signature: string
  err: unknown
  memo: string | null
  blockTime: number | null
}

interface SolanaParsedTx {
  slot: number
  blockTime: number | null
  meta: {
    err: unknown
    fee: number
    preBalances: number[]
    postBalances: number[]
    [key: string]: unknown
  } | null
  transaction: {
    message: { accountKeys: Array<{ pubkey: string; signer: boolean }> }
  }
  [key: string]: unknown
}

function normalizeSolanaTx(
  signature: string,
  tx: SolanaParsedTx,
  address: string,
): NormalizedTransaction {
  const keys = tx.transaction.message.accountKeys
  const idx = keys.findIndex((k) => k.pubkey === address)
  const pre = tx.meta?.preBalances?.[idx] ?? 0
  const post = tx.meta?.postBalances?.[idx] ?? 0
  const net = post - pre
  const direction: NormalizedTransaction['direction'] = net > 0 ? 'in' : net < 0 ? 'out' : 'self'
  const counterparty = keys.find((k) => k.pubkey !== address)?.pubkey

  return {
    id: signature,
    chain: 'solana',
    timestamp: tx.blockTime ? tx.blockTime * 1000 : null,
    direction,
    amount: Math.abs(net) / LAMPORTS_PER_SOL,
    ticker: 'SOL',
    counterparty,
    status: tx.meta?.err ? 'failed' : 'confirmed',
    fee: (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL,
    raw: tx as unknown as Record<string, unknown>,
  }
}

/**
 * Full (or incremental, when `sinceSignature` is a previously-seen signature)
 * transaction history for an address: page signatures via getSignaturesForAddress,
 * then fetch full parsed transactions in one JSON-RPC batch POST.
 */
export async function fetchSolanaTransactions(
  address: string,
  sinceSignature: string | null,
): Promise<NormalizedTransaction[]> {
  const signatures: SolanaSignatureInfo[] = []
  let before: string | undefined
  let guard = 0

  while (guard < 20) {
    const page = await rpcCall<SolanaSignatureInfo[]>('getSignaturesForAddress', [
      address,
      { limit: 50, before },
    ])
    if (!page || page.length === 0) break
    signatures.push(...page)

    if (sinceSignature && page.some((s) => s.signature === sinceSignature)) break
    if (page.length < 50) break
    before = page[page.length - 1].signature
    guard++
  }

  const stopAt = sinceSignature
    ? signatures.findIndex((s) => s.signature === sinceSignature)
    : -1
  const toFetch = stopAt >= 0 ? signatures.slice(0, stopAt) : signatures
  if (toFetch.length === 0) return []

  const txs = await rpcBatch<SolanaParsedTx>(
    toFetch.map((s) => ({
      method: 'getTransaction',
      params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    })),
  )

  const out: NormalizedTransaction[] = []
  toFetch.forEach((s, i) => {
    const tx = txs[i]
    if (tx) out.push(normalizeSolanaTx(s.signature, tx, address))
  })
  return out
}
