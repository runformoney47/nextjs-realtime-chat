import { api } from './api'

let cachedBlocked: Set<string> = new Set()
let lastFetchedAt = 0
const CACHE_TTL = 60_000

export async function fetchBlockedUsers(force = false): Promise<Set<string>> {
  const now = Date.now()
  if (!force && now - lastFetchedAt < CACHE_TTL && cachedBlocked.size >= 0 && lastFetchedAt > 0) {
    return cachedBlocked
  }
  const res = await api.get<{ blocked: string[] }>('/block/list')
  if (res.ok && res.data) {
    cachedBlocked = new Set(res.data.blocked ?? [])
    lastFetchedAt = now
  }
  return cachedBlocked
}

export function getCachedBlocked(): Set<string> {
  return cachedBlocked
}

export function addBlockedUser(userId: string) {
  cachedBlocked.add(userId)
}

export function removeBlockedUser(userId: string) {
  cachedBlocked.delete(userId)
}
