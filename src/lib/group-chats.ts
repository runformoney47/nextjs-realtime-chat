import { db } from './db'
import { fetchRedis } from '@/helpers/redis'

const GROUP_CHATS_ALL_KEY = 'group_chats:all'

/**
 * Add a group chat id to the canonical index.
 */
export async function addGroupChatId(chatId: string) {
  await db.sadd(GROUP_CHATS_ALL_KEY, chatId)
}

/**
 * Remove one or more group chat ids from the canonical index.
 */
export async function removeGroupChatIds(chatIds: string[] | Set<string>) {
  const ids = Array.isArray(chatIds) ? chatIds : Array.from(chatIds)
  if (!ids.length) return
  await db.srem(GROUP_CHATS_ALL_KEY, ...ids)
}

/**
 * Get all known group chat ids.
 *
 * Falls back to scanning `chat:group_*` once if the index is empty, and
 * then backfills the index so future calls are cheap and predictable.
 */
export async function getAllGroupChatIds(): Promise<string[]> {
  const indexed = (await fetchRedis(
    'smembers',
    GROUP_CHATS_ALL_KEY,
  )) as string[] | null

  if (indexed && indexed.length > 0) {
    return indexed
  }

  // Fallback for pre-index data: discover existing group chats via KEYS
  const legacyKeys = (await fetchRedis('keys', 'chat:group_*')) as string[]
  const legacyIds = legacyKeys
    .map((key) => key.split(':')[1])
    .filter((id) => !!id && !id.includes(':'))

  if (legacyIds.length) {
    await db.sadd(GROUP_CHATS_ALL_KEY, ...legacyIds)
  }

  return legacyIds
}

/**
 * Given a list of user ids, randomly partition them into groups of
 * at most `groupSize`. Any remaining users form a final smaller group.
 *
 * Example: 8 users, groupSize = 5 → [5 users], [3 users].
 */
export function buildRandomGroups(
  userIds: string[],
  groupSize = 5,
): string[][] {
  if (groupSize <= 0) {
    throw new Error('groupSize must be greater than 0')
  }

  // Deduplicate and shuffle via Fisher–Yates for unbiased random groups
  const deduped = Array.from(new Set(userIds))
  const shuffled = [...deduped]

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const groups: string[][] = []
  for (let i = 0; i < shuffled.length; i += groupSize) {
    groups.push(shuffled.slice(i, i + groupSize))
  }

  return groups
}

