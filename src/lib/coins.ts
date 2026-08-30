/**
 * Tickers Binance rebranded 1:1 — old symbol → current symbol. Keep in sync with
 * `COIN_RENAMES` in `backend/data-import-registration.ts`.
 */
const COIN_RENAMES: Record<string, string> = {
  MKR: 'SKY',
  RNDR: 'RENDER',
  MATIC: 'POL',
}

/** current symbol → the old symbol(s) folded into it */
const FORMER_NAMES: Record<string, string[]> = {}
for (const [oldName, current] of Object.entries(COIN_RENAMES)) {
  ;(FORMER_NAMES[current] ??= []).push(oldName)
}

/** Fold a rebranded ticker onto its current symbol. */
export function canonicalCoin(value: unknown): string {
  const c = String(value ?? '').trim()
  return COIN_RENAMES[c.toUpperCase()] ?? c
}

/** True when this (canonical) symbol absorbed one or more former tickers. */
export function isRenamedCoin(coin: string): boolean {
  return coin in FORMER_NAMES
}

/** Display form — renamed coins get a trailing `*` pointing at the footnote. */
export function coinLabel(coin: string): string {
  return isRenamedCoin(coin) ? `${coin}*` : coin
}

/**
 * Footnote text for the renamed coins present in `coins` (canonical symbols).
 * Empty string when none are renamed.
 */
export function renamedCoinNote(coins: Iterable<string>): string {
  const parts = Array.from(new Set(coins))
    .filter(isRenamedCoin)
    .sort()
    .map((c) => `${c} — formerly ${FORMER_NAMES[c].join(', ')}`)
  return parts.length ? `* ${parts.join('  ·  ')}` : ''
}
