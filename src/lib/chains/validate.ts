import type { WalletChain } from './types'
import { isValidBitcoinAddress } from './bitcoin'
import { isValidSolanaAddress } from './solana'
import { isValidEvmAddress } from './evm'
import { isValidTronAddress } from './tron'

export function validateAddress(chain: WalletChain, address: string): { valid: boolean; reason?: string } {
  const trimmed = address.trim()
  if (!trimmed) return { valid: false, reason: 'Address is required' }

  switch (chain) {
    case 'bitcoin':
      return isValidBitcoinAddress(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Not a valid Bitcoin address' }
    case 'ethereum':
    case 'bsc':
    case 'arbitrum':
    case 'base':
      return isValidEvmAddress(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Not a valid EVM (0x...) address' }
    case 'solana':
      return isValidSolanaAddress(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Not a valid Solana address' }
    case 'tron':
      return isValidTronAddress(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Not a valid Tron address' }
    default:
      return { valid: false, reason: 'Unknown chain' }
  }
}
