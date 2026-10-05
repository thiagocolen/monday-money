import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAlphaColor(hex: string, alpha: string) {
  // If hex is #RRGGBBAA, strip the AA
  const baseHex = hex.length === 9 ? hex.substring(0, 7) : hex;
  return `${baseHex}${alpha}`;
}

// Building an Intl.NumberFormat is far more expensive than calling format(),
// so share one instance instead of creating it per row / per render.
const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatBRL(value: number) {
  return brlFormatter.format(value)
}
