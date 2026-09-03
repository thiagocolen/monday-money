/**
 * User-defined target allocation (percent per coin).
 *
 * The authoritative copy lives server-side in `core/data/allocation-target.json`
 * so it travels with the "Import Export" full backup, exactly like categories
 * and tags. `localStorage` is kept as a synchronous mirror so the planner can
 * paint instantly on first render (and still works offline); it is refreshed
 * from the server by `fetchAllocationTarget()` on mount.
 */

import { fetchAllocationTarget as fetchRemote, saveAllocationTargetRemote } from "./api"

const KEY = "mm.allocation.target.v1"

/** canonical UPPER-CASE ticker → target weight in percent (0..100) */
export type AllocationTarget = Record<string, number>

function clean(input: unknown): AllocationTarget {
  const out: AllocationTarget = {}
  if (!input || typeof input !== "object") return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const n = Number(v)
    const key = k.trim().toUpperCase()
    if (key && Number.isFinite(n) && n > 0) {
      out[key] = Math.min(100, Math.round(n * 100) / 100)
    }
  }
  return out
}

/** Synchronous read of the local mirror — used to seed the initial render. */
export function loadAllocationTarget(): AllocationTarget {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? clean(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

function writeLocal(target: AllocationTarget): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clean(target)))
  } catch {
    /* ignore */
  }
}

/**
 * Persists the target: writes the local mirror synchronously and pushes to the
 * server in the background (best-effort — a failed sync leaves the local copy
 * intact and the next save retries).
 */
export function saveAllocationTarget(target: AllocationTarget): void {
  const cleaned = clean(target)
  writeLocal(cleaned)
  void saveAllocationTargetRemote(cleaned)
}

/**
 * Loads the authoritative server copy and refreshes the local mirror. Falls
 * back to the local mirror if the request fails.
 */
export async function fetchAllocationTarget(): Promise<AllocationTarget> {
  try {
    const remote = clean(await fetchRemote())
    writeLocal(remote)
    return remote
  } catch {
    return loadAllocationTarget()
  }
}

/** Sum of all target weights (percent). */
export function targetTotal(target: AllocationTarget): number {
  return Object.values(target).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}
