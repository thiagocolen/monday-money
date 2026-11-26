/**
 * Orchestrates balance + transaction-history refresh across every chain
 * module, with the same conventions as src/lib/prices.ts / price-history.ts:
 * cache-first, stale-on-failure, in-flight de-dup, and light throttling for
 * the per-address APIs (nothing here batches across wallets except the EVM
 * multicall balance path).
 */

import { fetchUsdQuotes } from '../prices'
import type { WalletEntry, WalletCache, WalletCacheEntry, WalletBalance } from './types'
import { fetchBitcoinBalance, fetchBitcoinTransactions } from './bitcoin'
import { fetchSolanaBalance, fetchSolanaTransactions } from './solana'
import { fetchEvmBalances, fetchEvmTransactions, type EvmChainKey } from './evm'
import { fetchTronBalance, fetchTronTransactions } from './tron'

const BALANCE_TTL_MS = 2 * 60_000
const HISTORY_TTL_MS = 10 * 60_000
const THROTTLE_MS = 200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function emptyCacheEntry(walletId: string): WalletCacheEntry {
  return {
    walletId,
    balances: [],
    transactions: [],
    balanceFetchedAt: 0,
    txFetchedAt: 0,
    txCoveredThroughId: null,
    stale: true,
  }
}

export function isBalanceStale(entry?: WalletCacheEntry): boolean {
  if (!entry) return true
  return Date.now() - entry.balanceFetchedAt > BALANCE_TTL_MS
}

export function isHistoryStale(entry?: WalletCacheEntry): boolean {
  if (!entry) return true
  return Date.now() - entry.txFetchedAt > HISTORY_TTL_MS
}

const inFlight = new Map<string, Promise<unknown>>()

async function withDedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const p = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

async function applyUsdValues(balances: WalletBalance[]): Promise<WalletBalance[]> {
  const quotes = await fetchUsdQuotes()
  return balances.map((b) => ({
    ...b,
    usdValue: quotes.price[b.ticker] != null ? b.amount * quotes.price[b.ticker] : undefined,
  }))
}

/**
 * Refreshes balances for every wallet whose cache entry is missing/stale.
 * EVM wallets are grouped per chain and fetched with one multicall per chain;
 * Bitcoin/Solana are per-address (throttled) since there's no batching there.
 * Never throws — failures leave the previous cached balances in place with
 * `stale: true`.
 */
export async function refreshBalances(
  wallets: WalletEntry[],
  cache: WalletCache,
): Promise<WalletCache> {
  const next: WalletCache = { ...cache }
  const dueForRefresh = wallets.filter((w) => isBalanceStale(next[w.id]))
  if (dueForRefresh.length === 0) return next

  const byChain: Record<string, WalletEntry[]> = {}
  for (const w of dueForRefresh) (byChain[w.chain] ??= []).push(w)

  for (const chainKey of ['ethereum', 'bsc', 'arbitrum', 'base'] as EvmChainKey[]) {
    const chainWallets = byChain[chainKey]
    if (!chainWallets?.length) continue
    await withDedup(`balances:${chainKey}`, async () => {
      const results = await fetchEvmBalances(
        chainKey,
        chainWallets.map((w) => w.address),
      )
      for (const w of chainWallets) {
        const entry = next[w.id] ?? emptyCacheEntry(w.id)
        const found = results.get(w.address)
        if (found) {
          const balances = await applyUsdValues([found.native, found.link])
          next[w.id] = { ...entry, balances, balanceFetchedAt: Date.now(), stale: false }
        } else {
          next[w.id] = { ...entry, stale: true }
        }
      }
    })
  }

  for (const w of byChain.bitcoin ?? []) {
    const entry = next[w.id] ?? emptyCacheEntry(w.id)
    const result = await withDedup(`balance:${w.id}`, () => fetchBitcoinBalance(w.address))
    if (result) {
      const balances = await applyUsdValues([{ ticker: 'BTC', amount: result.amount, raw: result.raw, decimals: 8 }])
      next[w.id] = { ...entry, balances, balanceFetchedAt: Date.now(), stale: false }
    } else {
      next[w.id] = { ...entry, stale: true }
    }
    await sleep(THROTTLE_MS)
  }

  for (const w of byChain.solana ?? []) {
    const entry = next[w.id] ?? emptyCacheEntry(w.id)
    const result = await withDedup(`balance:${w.id}`, () => fetchSolanaBalance(w.address))
    if (result) {
      const balances = await applyUsdValues([{ ticker: 'SOL', amount: result.amount, raw: result.raw, decimals: 9 }])
      next[w.id] = { ...entry, balances, balanceFetchedAt: Date.now(), stale: false }
    } else {
      next[w.id] = { ...entry, stale: true }
    }
    await sleep(THROTTLE_MS)
  }

  for (const w of byChain.tron ?? []) {
    const entry = next[w.id] ?? emptyCacheEntry(w.id)
    const result = await withDedup(`balance:${w.id}`, () => fetchTronBalance(w.address))
    if (result) {
      const balances = await applyUsdValues([{ ticker: 'TRX', amount: result.amount, raw: result.raw, decimals: 6 }])
      next[w.id] = { ...entry, balances, balanceFetchedAt: Date.now(), stale: false }
    } else {
      next[w.id] = { ...entry, stale: true }
    }
    await sleep(THROTTLE_MS)
  }

  return next
}

/**
 * Incrementally refreshes one wallet's transaction history: only the trailing
 * edge is re-fetched (via `txCoveredThroughId` as the paging cursor), merged
 * into the cached list by id. Never throws — returns the previous entry with
 * `stale: true` on failure.
 */
export async function refreshWalletHistory(
  wallet: WalletEntry,
  cache: WalletCache,
): Promise<WalletCacheEntry> {
  const entry = cache[wallet.id] ?? emptyCacheEntry(wallet.id)

  return withDedup(`history:${wallet.id}`, async () => {
    try {
      let fresh
      if (wallet.chain === 'bitcoin') {
        fresh = await fetchBitcoinTransactions(wallet.address, entry.txCoveredThroughId)
      } else if (wallet.chain === 'solana') {
        fresh = await fetchSolanaTransactions(wallet.address, entry.txCoveredThroughId)
      } else if (wallet.chain === 'tron') {
        fresh = await fetchTronTransactions(wallet.address, entry.txCoveredThroughId)
      } else {
        fresh = await fetchEvmTransactions(wallet.chain, wallet.address, entry.txCoveredThroughId)
      }

      const byId = new Map(entry.transactions.map((t) => [t.id, t]))
      for (const t of fresh) byId.set(t.id, t)
      const transactions = [...byId.values()].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

      return {
        ...entry,
        transactions,
        txFetchedAt: Date.now(),
        txCoveredThroughId: transactions[0]?.id ?? entry.txCoveredThroughId,
        stale: false,
      }
    } catch {
      return { ...entry, stale: true }
    }
  })
}

/**
 * Manual "Refresh" for one wallet (used both right after Add Wallet and from
 * the per-wallet Refresh button): forces a balance refetch regardless of TTL,
 * then always refetches the trailing edge of transaction history.
 *
 * Balance and history are applied as two separate steps rather than one
 * atomic result: a busy address's history can take tens of seconds to page
 * through, and gating the (fast) balance update behind that would leave the
 * UI showing nothing at all in the meantime. `onBalanceReady`, when given,
 * fires as soon as the balance step resolves so the caller can render it
 * immediately; the final return value carries the balance + history together.
 */
export async function refreshSingleWallet(
  wallet: WalletEntry,
  cache: WalletCache,
  onBalanceReady?: (cache: WalletCache) => void,
): Promise<WalletCacheEntry> {
  const forcedCache: WalletCache = {
    ...cache,
    [wallet.id]: { ...(cache[wallet.id] ?? emptyCacheEntry(wallet.id)), balanceFetchedAt: 0 },
  }
  const balanceCache = await refreshBalances([wallet], forcedCache)
  onBalanceReady?.(balanceCache)
  return refreshWalletHistory(wallet, balanceCache)
}

function forceStale(wallets: WalletEntry[], cache: WalletCache): WalletCache {
  const next: WalletCache = { ...cache }
  for (const w of wallets) {
    const entry = next[w.id] ?? emptyCacheEntry(w.id)
    next[w.id] = { ...entry, balanceFetchedAt: 0, txFetchedAt: 0 }
  }
  return next
}

/**
 * Manual "Refresh All": forces every wallet's balance + history to bypass TTL.
 * Same balance-first-then-history split as {@link refreshSingleWallet}, so
 * every wallet's balance appears as soon as it's ready instead of waiting on
 * every wallet's full history too.
 */
export async function refreshAllWallets(
  wallets: WalletEntry[],
  cache: WalletCache,
  onBalancesReady?: (cache: WalletCache) => void,
): Promise<WalletCache> {
  const forced = forceStale(wallets, cache)
  const withBalances = await refreshBalances(wallets, forced)
  onBalancesReady?.(withBalances)
  return refreshManyWalletHistories(wallets, withBalances)
}

/** Refresh history for several wallets with a small concurrency cap + stagger, to stay under free rate limits. */
export async function refreshManyWalletHistories(
  wallets: WalletEntry[],
  cache: WalletCache,
  concurrency = 3,
): Promise<WalletCache> {
  const next: WalletCache = { ...cache }
  const queue = wallets.filter((w) => isHistoryStale(next[w.id]))
  let i = 0

  async function worker() {
    while (i < queue.length) {
      const wallet = queue[i++]
      next[wallet.id] = await refreshWalletHistory(wallet, next)
      await sleep(THROTTLE_MS)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return next
}
