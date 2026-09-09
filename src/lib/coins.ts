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

/**
 * Human-readable token quantity. Uses fixed (never exponential) notation so
 * dust-sized crypto amounts render as `0.00000041`, not `4.1e-7` — plain
 * `String(n)` switches to exponent notation below 1e-6.
 */
export function formatCoinAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  return value.toLocaleString('en-US', { maximumSignificantDigits: 6 })
}

/**
 * Deterministic hue per coin symbol — the fallback whenever the palette shuffler
 * (below) hasn't assigned this coin an explicit colour.
 */
function hashedCoinColor(coin: string): string {
  let h = 0
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) >>> 0
  return `hsl(${Math.round((h * 137.508) % 360)} 70% 45%)`
}

/* -------------------------------------------------------------------------- *
 *  Palette overrides — the "shuffle colours" button on the Investments        *
 *  Historical-USD-price chart drops a fresh colour per coin here; the chart   *
 *  lines, the holdings bars and every allocation pie/legend read through      *
 *  `coinColor`, so one shuffle repaints them all. Persisted so the chosen     *
 *  palette survives a reload.                                                 *
 * -------------------------------------------------------------------------- */

const COLOR_OVERRIDE_KEY = 'mm.coins.colorOverrides'

function loadColorOverrides(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLOR_OVERRIDE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [coin, color] of Object.entries(parsed)) {
      if (typeof color === 'string') out[coin.toUpperCase()] = color
    }
    return out
  } catch {
    return {}
  }
}

let colorOverrides = loadColorOverrides()
const paletteListeners = new Set<() => void>()

function commitPalette(next: Record<string, string>) {
  colorOverrides = next
  try {
    localStorage.setItem(COLOR_OVERRIDE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  for (const fn of paletteListeners) fn()
}

/** Subscribe to palette changes — pairs with `coinPalette` for `useSyncExternalStore`. */
export function subscribeCoinColors(listener: () => void): () => void {
  paletteListeners.add(listener)
  return () => paletteListeners.delete(listener)
}

/**
 * The palette itself — a fresh object identity on every shuffle/reset, stable
 * in between, so it doubles as the `useSyncExternalStore` snapshot. React
 * consumers read colours through this (see `useCoinColor`) rather than calling
 * `coinColor` behind a hand-written dependency: the React Compiler infers a
 * memo's dependencies from what it actually reads and drops dead statements, so
 * a `void version` line is silently deleted and the memo never recomputes.
 */
export function coinPalette(): Readonly<Record<string, string>> {
  return colorOverrides
}

/**
 * Assign every coin in `coins` a fresh colour and persist it. Hues are spread
 * evenly around the wheel from a random offset (so the set stays legible) and
 * handed out in a random order (so adjacent legend rows aren't adjacent hues),
 * with a little saturation/lightness jitter to separate anything that lands
 * close. Repaint consumers via `subscribeCoinColors`.
 */
export function shuffleCoinColors(coins: Iterable<string>): void {
  // Every coin already holding an override joins the reroll, so shuffling while
  // the Coin column is filtered rerolls the filtered set instead of dropping
  // the rest of the palette (a commit replaces the whole map).
  const uniq = [
    ...new Set([
      ...Array.from(coins, (c) => String(c ?? '').trim().toUpperCase()),
      ...Object.keys(colorOverrides),
    ]),
  ].filter(Boolean)
  if (uniq.length === 0) return

  const offset = Math.random() * 360
  const step = 360 / uniq.length
  const slots = uniq.map((_, i) => i)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }

  const next: Record<string, string> = {}
  uniq.forEach((coin, i) => {
    const hue = Math.round((offset + slots[i] * step) % 360)
    const sat = 60 + Math.floor(Math.random() * 18) // 60–77%
    const light = 42 + Math.floor(Math.random() * 12) // 42–53%
    next[coin] = `hsl(${hue} ${sat}% ${light}%)`
  })
  commitPalette(next)
}

/** Forget every shuffled colour — back to the deterministic per-symbol hues. */
export function resetCoinColors(): void {
  if (Object.keys(colorOverrides).length > 0) commitPalette({})
}

/**
 * Stable colour per coin symbol. Returns the shuffled palette's colour when one
 * has been assigned (see `shuffleCoinColors`), otherwise a deterministic hue so
 * a coin keeps its colour regardless of which others share the chart.
 */
export function coinColor(coin: string): string {
  return coinColorIn(colorOverrides, coin)
}

/** `coinColor` against an explicit palette snapshot — see `coinPalette`. */
export function coinColorIn(
  palette: Readonly<Record<string, string>>,
  coin: string,
): string {
  return palette[coin.toUpperCase()] ?? hashedCoinColor(coin)
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
