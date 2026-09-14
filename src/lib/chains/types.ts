/**
 * Chain-agnostic shapes shared by every wallet data source (see
 * src/lib/chains/{bitcoin,evm,solana}.ts) and the orchestrator
 * (src/lib/chains/wallet-data.ts). Keeping one normalized shape lets a single
 * generic DataTable render transaction history regardless of source chain,
 * while `raw` still carries the full chain-specific payload for the
 * "all available details" view.
 */

export type WalletChain = 'bitcoin' | 'ethereum' | 'bsc' | 'solana' | 'arbitrum' | 'base' | 'tron'

export interface WalletEntry {
  id: string
  chain: WalletChain
  address: string
  label: string
  addedAt: number
}

export interface WalletBalance {
  ticker: string
  /** human units (e.g. 1.5 for 1.5 BTC) */
  amount: number
  /** exact base-unit amount (sats/wei/lamports) as a string, to avoid float drift */
  raw: string
  decimals: number
  usdValue?: number
  isToken?: boolean
  contractAddress?: string
}

export interface NormalizedTransaction {
  id: string
  chain: WalletChain
  /** epoch ms, null when the source hasn't confirmed/timestamped it yet */
  timestamp: number | null
  direction: 'in' | 'out' | 'self' | 'unknown'
  amount: number
  ticker: string
  counterparty?: string
  status: 'confirmed' | 'pending' | 'failed'
  fee?: number
  /** full chain-specific payload backing the "all available details" view */
  raw: Record<string, unknown>
}

export interface WalletCacheEntry {
  walletId: string
  balances: WalletBalance[]
  transactions: NormalizedTransaction[]
  balanceFetchedAt: number
  txFetchedAt: number
  /** newest transaction id already fetched, used as the incremental-refresh cursor */
  txCoveredThroughId: string | null
  /** true when the last refresh attempt failed and this is a last-known-good snapshot */
  stale: boolean
}

export type WalletCache = Record<string, WalletCacheEntry>

export const CHAIN_LABELS: Record<WalletChain, string> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  bsc: 'BNB Smart Chain',
  solana: 'Solana',
  arbitrum: 'Arbitrum One',
  base: 'Base',
  tron: 'Tron',
}

export const CHAIN_NATIVE_TICKER: Record<WalletChain, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  bsc: 'BNB',
  solana: 'SOL',
  arbitrum: 'ETH',
  base: 'ETH',
  tron: 'TRX',
}
