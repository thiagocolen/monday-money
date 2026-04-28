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
