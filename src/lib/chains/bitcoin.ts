/**
 * Bitcoin balance + transaction history via Blockstream's Esplora API
 * (blockstream.info/api), a free keyless block explorer REST API.
 */

import type { NormalizedTransaction } from './types'

const API_BASE = 'https://blockstream.info/api'
const SATS_PER_BTC = 1e8

/** Format check only (P2PKH/P2SH/bech32/bech32m) — no base58check/bech32 checksum decode. */
export function isValidBitcoinAddress(address: string): boolean {
  const a = address.trim()
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return true // P2PKH / P2SH
  if (/^(bc1|tb1)[a-z0-9]{11,71}$/.test(a)) return true // bech32 / bech32m
  return false
}

interface EsploraAddressStats {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number }
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number }
}

export async function fetchBitcoinBalance(address: string): Promise<{ amount: number; raw: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/address/${address}`)
    if (!res.ok) return null
    const json: EsploraAddressStats = await res.json()
    const sats =
      json.chain_stats.funded_txo_sum -
      json.chain_stats.spent_txo_sum +
      json.mempool_stats.funded_txo_sum -
      json.mempool_stats.spent_txo_sum
    return { amount: sats / SATS_PER_BTC, raw: String(sats) }
  } catch {
    return null
  }
}

interface EsploraVin {
  prevout: { scriptpubkey_address?: string; value: number } | null
}
interface EsploraVout {
  scriptpubkey_address?: string
  value: number
}
interface EsploraTx {
  txid: string
  status: { confirmed: boolean; block_time?: number; block_height?: number }
  fee: number
  vin: EsploraVin[]
  vout: EsploraVout[]
  [key: string]: unknown
}

function normalizeBitcoinTx(tx: EsploraTx, address: string): NormalizedTransaction {
  const sentByMe = tx.vin.reduce(
    (sum, vin) => (vin.prevout?.scriptpubkey_address === address ? sum + vin.prevout.value : sum),
    0,
  )
  const receivedByMe = tx.vout.reduce(
    (sum, vout) => (vout.scriptpubkey_address === address ? sum + vout.value : sum),
    0,
  )
  const net = receivedByMe - sentByMe
  const direction: NormalizedTransaction['direction'] = net > 0 ? 'in' : net < 0 ? 'out' : 'self'

  const counterparty =
    direction === 'in'
      ? tx.vin.find((v) => v.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address
      : tx.vout.find((v) => v.scriptpubkey_address && v.scriptpubkey_address !== address)?.scriptpubkey_address

  return {
    id: tx.txid,
    chain: 'bitcoin',
    timestamp: tx.status.block_time ? tx.status.block_time * 1000 : null,
    direction,
    amount: Math.abs(net) / SATS_PER_BTC,
    ticker: 'BTC',
    counterparty,
    status: tx.status.confirmed ? 'confirmed' : 'pending',
    fee: tx.fee / SATS_PER_BTC,
    raw: tx as unknown as Record<string, unknown>,
  }
}

/**
 * Full (or incremental, when `sinceTxId` is a previously-seen txid) transaction
 * history for an address. Esplora returns the newest 25 confirmed txs per page,
 * paged further back via `/txs/chain/{last_seen_txid}`; mempool (unconfirmed)
 * txs come from a separate endpoint and are always included.
 */
export async function fetchBitcoinTransactions(
  address: string,
  sinceTxId: string | null,
): Promise<NormalizedTransaction[]> {
  try {
    const out: EsploraTx[] = []

    const mempoolRes = await fetch(`${API_BASE}/address/${address}/txs/mempool`)
    if (mempoolRes.ok) out.push(...(await mempoolRes.json()))

    let page = await fetch(`${API_BASE}/address/${address}/txs/chain`)
    let guard = 0
    while (page.ok && guard < 50) {
      const txs: EsploraTx[] = await page.json()
      if (txs.length === 0) break
      out.push(...txs)

      if (sinceTxId && txs.some((t) => t.txid === sinceTxId)) break
      const last = txs[txs.length - 1]
      if (txs.length < 25) break
      page = await fetch(`${API_BASE}/address/${address}/txs/chain/${last.txid}`)
      guard++
    }

    return out.map((tx) => normalizeBitcoinTx(tx, address))
  } catch {
    return []
  }
}
