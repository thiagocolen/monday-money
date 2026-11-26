import {
  NetworkBitcoin,
  NetworkEthereum,
  NetworkBinanceSmartChain,
  NetworkSolana,
  NetworkArbitrumOne,
  NetworkBase,
  NetworkTron,
} from "@web3icons/react";
import type { WalletChain } from "@/lib/chains/types";

const CHAIN_ICON_COMPONENTS: Record<WalletChain, typeof NetworkEthereum> = {
  bitcoin: NetworkBitcoin,
  ethereum: NetworkEthereum,
  bsc: NetworkBinanceSmartChain,
  solana: NetworkSolana,
  arbitrum: NetworkArbitrumOne,
  base: NetworkBase,
  tron: NetworkTron,
};

interface ChainIconProps {
  chain: WalletChain;
  size?: number;
  className?: string;
}

export function ChainIcon({ chain, size = 20, className }: ChainIconProps) {
  const Icon = CHAIN_ICON_COMPONENTS[chain];
  return <Icon variant="branded" size={size} className={className} />;
}
