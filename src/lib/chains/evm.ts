/**
 * Ethereum, BSC, Arbitrum + Base (all EVM) balance + transaction history.
 * Shared via a config object per chain rather than per-chain files — the
 * chains differ only in RPC URL(s), Blockscout host, native ticker and LINK
 * contract.
 *
 * Balances use plain RPC (viem) batched through the Multicall3 contract (the
 * same address on every EVM chain) so N wallets cost one round-trip per chain.
 * Transaction history comes from free, keyless public Blockscout instances,
 * since public RPC alone can't give an address-indexed history.
 */

import { createPublicClient, http, fallback, isAddress, formatUnits, type Address } from 'viem'
import type { WalletBalance, NormalizedTransaction } from './types'

export type EvmChainKey = 'ethereum' | 'bsc' | 'arbitrum' | 'base'

interface EvmChainConfig {
  key: EvmChainKey
  nativeTicker: 'ETH' | 'BNB'
  rpcUrls: string[]
  // Null when no free, keyless indexer is available for this chain — history
  // fetches are skipped and only RPC-derived balances are shown.
  blockscoutBase: string | null
  linkContract: Address
}

export const EVM_CHAINS: Record<EvmChainKey, EvmChainConfig> = {
  ethereum: {
    key: 'ethereum',
    nativeTicker: 'ETH',
    rpcUrls: ['https://ethereum.publicnode.com', 'https://eth.llamarpc.com'],
    blockscoutBase: 'https://eth.blockscout.com',
    linkContract: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  },
  bsc: {
    key: 'bsc',
    nativeTicker: 'BNB',
    rpcUrls: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
    // bsc.blockscout.com was decommissioned (delisted from Blockscout's own
    // chain registry) and there's no other free, keyless BSC indexer as of
    // writing — BSC wallets show balances only until one exists.
    blockscoutBase: null,
    // LINK BEP-20 on BNB Smart Chain
    linkContract: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
  },
  arbitrum: {
    key: 'arbitrum',
    nativeTicker: 'ETH',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com'],
    blockscoutBase: 'https://arbitrum.blockscout.com',
    // LINK on Arbitrum One — https://docs.chain.link/resources/link-token-contracts
    linkContract: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
  },
  base: {
    key: 'base',
    nativeTicker: 'ETH',
    rpcUrls: ['https://mainnet.base.org', 'https://base.publicnode.com'],
    blockscoutBase: 'https://base.blockscout.com',
    // LINK on Base — https://docs.chain.link/resources/link-token-contracts
    linkContract: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
  },
}

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

const MULTICALL3_ABI = [
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'getEthBalance',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function isValidEvmAddress(address: string): boolean {
  return isAddress(address.trim())
}

function makeClient(cfg: EvmChainConfig) {
  return createPublicClient({
    transport: fallback(cfg.rpcUrls.map((url) => http(url))),
  })
}

/**
 * Native + LINK balances for every wallet on this chain, in a single
 * `multicall` round-trip regardless of how many wallets are passed.
 */
export async function fetchEvmBalances(
  chainKey: EvmChainKey,
  addresses: string[],
): Promise<Map<string, { native: WalletBalance; link: WalletBalance }>> {
  const cfg = EVM_CHAINS[chainKey]
  const client = makeClient(cfg)
  const out = new Map<string, { native: WalletBalance; link: WalletBalance }>()
  if (addresses.length === 0) return out

  try {
    const contracts = addresses.flatMap((addr) => [
      { address: MULTICALL3, abi: MULTICALL3_ABI, functionName: 'getEthBalance', args: [addr as Address] } as const,
      { address: cfg.linkContract, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr as Address] } as const,
    ])

    const results = await client.multicall({ contracts, multicallAddress: MULTICALL3 })

    addresses.forEach((addr, i) => {
      const nativeResult = results[i * 2]
      const linkResult = results[i * 2 + 1]
      const nativeRaw = nativeResult.status === 'success' ? (nativeResult.result as bigint) : 0n
      const linkRaw = linkResult.status === 'success' ? (linkResult.result as bigint) : 0n

      out.set(addr, {
        native: {
          ticker: cfg.nativeTicker,
          amount: Number(formatUnits(nativeRaw, 18)),
          raw: nativeRaw.toString(),
          decimals: 18,
        },
        link: {
          ticker: 'LINK',
          amount: Number(formatUnits(linkRaw, 18)),
          raw: linkRaw.toString(),
          decimals: 18,
          isToken: true,
          contractAddress: cfg.linkContract,
        },
      })
    })
  } catch {
    // Leave `out` partially/entirely empty — caller falls back to cached balances.
  }

  return out
}

interface BlockscoutTx {
  hash: string
  timestamp?: string
  from?: { hash?: string }
  to?: { hash?: string } | null
  value?: string
  fee?: { value?: string }
  status?: string
  [key: string]: unknown
}

interface BlockscoutTokenTransfer {
  transaction_hash: string
  timestamp?: string
  from?: { hash?: string }
  to?: { hash?: string }
  total?: { value?: string; decimals?: string }
  [key: string]: unknown
}

function normalizeNativeTx(
  tx: BlockscoutTx,
  address: string,
  chainKey: EvmChainKey,
  ticker: string,
): NormalizedTransaction {
  const fromMe = tx.from?.hash?.toLowerCase() === address.toLowerCase()
  const toMe = tx.to?.hash?.toLowerCase() === address.toLowerCase()
  const direction: NormalizedTransaction['direction'] = fromMe && toMe ? 'self' : fromMe ? 'out' : toMe ? 'in' : 'unknown'
  const valueWei = BigInt(tx.value || '0')

  return {
    id: tx.hash,
    chain: chainKey,
    timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : null,
    direction,
    amount: Number(formatUnits(valueWei, 18)),
    ticker,
    counterparty: direction === 'out' ? tx.to?.hash : tx.from?.hash,
    status: tx.status === 'ok' ? 'confirmed' : tx.status === 'error' ? 'failed' : 'pending',
    fee: tx.fee?.value ? Number(formatUnits(BigInt(tx.fee.value), 18)) : undefined,
    raw: tx as unknown as Record<string, unknown>,
  }
}

function normalizeTokenTransfer(
  transfer: BlockscoutTokenTransfer,
  address: string,
  chainKey: EvmChainKey,
): NormalizedTransaction {
  const fromMe = transfer.from?.hash?.toLowerCase() === address.toLowerCase()
  const toMe = transfer.to?.hash?.toLowerCase() === address.toLowerCase()
  const direction: NormalizedTransaction['direction'] = fromMe && toMe ? 'self' : fromMe ? 'out' : toMe ? 'in' : 'unknown'
  const decimals = Number(transfer.total?.decimals ?? 18)
  const rawValue = BigInt(transfer.total?.value || '0')

  return {
    id: `${transfer.transaction_hash}-link`,
    chain: chainKey,
    timestamp: transfer.timestamp ? new Date(transfer.timestamp).getTime() : null,
    direction,
    amount: Number(formatUnits(rawValue, decimals)),
    ticker: 'LINK',
    counterparty: direction === 'out' ? transfer.to?.hash : transfer.from?.hash,
    status: 'confirmed',
    raw: transfer as unknown as Record<string, unknown>,
  }
}

/**
 * Native + LINK transfer history for one address, merged into a single list.
 * `sinceTxId` limits how far back to page (stops once that id is seen) —
 * pass null for a full history fetch.
 */
export async function fetchEvmTransactions(
  chainKey: EvmChainKey,
  address: string,
  sinceTxId: string | null,
): Promise<NormalizedTransaction[]> {
  const cfg = EVM_CHAINS[chainKey]
  const out: NormalizedTransaction[] = []
  if (!cfg.blockscoutBase) return out

  try {
    let url = `${cfg.blockscoutBase}/api/v2/addresses/${address}/transactions`
    let guard = 0
    while (url && guard < 20) {
      const res = await fetch(url)
      if (!res.ok) break
      const json: { items: BlockscoutTx[]; next_page_params?: Record<string, string | number> | null } =
        await res.json()
      out.push(...json.items.map((tx) => normalizeNativeTx(tx, address, chainKey, cfg.nativeTicker)))

      if (sinceTxId && json.items.some((tx) => tx.hash === sinceTxId)) break
      if (!json.next_page_params) break
      const params = new URLSearchParams(
        Object.entries(json.next_page_params).map(([k, v]) => [k, String(v)]),
      )
      url = `${cfg.blockscoutBase}/api/v2/addresses/${address}/transactions?${params.toString()}`
      guard++
    }
  } catch {
    /* leave native history partial on failure */
  }

  try {
    const res = await fetch(
      `${cfg.blockscoutBase}/api/v2/addresses/${address}/token-transfers?token=${cfg.linkContract}`,
    )
    if (res.ok) {
      const json: { items: BlockscoutTokenTransfer[] } = await res.json()
      out.push(...json.items.map((t) => normalizeTokenTransfer(t, address, chainKey)))
    }
  } catch {
    /* leave LINK history partial on failure */
  }

  return out
}
