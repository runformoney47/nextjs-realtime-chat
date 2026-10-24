import {
  ANTI_REPEAT_CYCLES,
  GROUP_SIZE,
  ICEBREAKERS,
  MIN_GROUP_SIZE,
} from './constants'
import type { CurationHistoryMap } from './types'

export function shuffleInPlace<T>(items: T[], random: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function flattenRecentMates(
  cycles: string[][] | undefined,
  lookback = ANTI_REPEAT_CYCLES,
): Set<string> {
  const mates = new Set<string>()
  for (const cycle of (cycles ?? []).slice(0, lookback)) {
    for (const id of cycle) mates.add(id)
  }
  return mates
}

export function canAddToGroup(
  candidate: string,
  group: string[],
  history: CurationHistoryMap,
): boolean {
  const candidateMates = flattenRecentMates(history[candidate])
  for (const member of group) {
    if (candidateMates.has(member)) return false
    if (flattenRecentMates(history[member]).has(candidate)) return false
  }
  return true
}

function removeFromRemaining(remaining: string[], picked: string[]) {
  const pickedSet = new Set(picked)
  for (let k = remaining.length - 1; k >= 0; k--) {
    if (pickedSet.has(remaining[k])) remaining.splice(k, 1)
  }
}

/**
 * V0 grouping: shuffle, then pack groups of `groupSize`.
 * Avoids recent groupmates (last {@link ANTI_REPEAT_CYCLES} cycles) when possible;
 * fills remaining seats if a full group would otherwise be impossible.
 * Leftover 3–4 users get a smaller group; 1–2 are skipped until the next cycle.
 */
export function formGroups(
  userIds: string[],
  history: CurationHistoryMap,
  options?: {
    groupSize?: number
    minGroupSize?: number
    random?: () => number
  },
): { groups: string[][]; skipped: string[] } {
  const groupSize = options?.groupSize ?? GROUP_SIZE
  const minGroupSize = Math.min(options?.minGroupSize ?? MIN_GROUP_SIZE, groupSize)
  const remaining = shuffleInPlace([...new Set(userIds)], options?.random)
  const groups: string[][] = []

  const extractGroup = (targetSize: number, allowRepeat: boolean): string[] | null => {
    if (remaining.length < targetSize) return null

    for (let seed = 0; seed < remaining.length; seed++) {
      const picked = [remaining[seed]]

      for (let j = 0; j < remaining.length && picked.length < targetSize; j++) {
        if (j === seed) continue
        if (canAddToGroup(remaining[j], picked, history)) {
          picked.push(remaining[j])
        }
      }

      if (allowRepeat) {
        for (let j = 0; j < remaining.length && picked.length < targetSize; j++) {
          if (j === seed) continue
          if (!picked.includes(remaining[j])) {
            picked.push(remaining[j])
          }
        }
      }

      if (picked.length === targetSize) {
        removeFromRemaining(remaining, picked)
        return picked
      }
    }

    return null
  }

  while (remaining.length >= groupSize) {
    const group = extractGroup(groupSize, false) ?? extractGroup(groupSize, true)
    if (!group) break
    groups.push(group)
  }

  if (remaining.length >= minGroupSize) {
    const n = remaining.length
    const group = extractGroup(n, false) ?? extractGroup(n, true)
    if (group) groups.push(group)
  }

  return { groups, skipped: [...remaining] }
}

export function pickIcebreakers(count: number, random: () => number = Math.random): string[] {
  if (count <= 0) return []
  const pool = shuffleInPlace([...ICEBREAKERS], random)
  return Array.from({ length: count }, (_, i) => pool[i % pool.length] ?? ICEBREAKERS[0])
}
