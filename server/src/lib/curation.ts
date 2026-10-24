import { db } from './db'
import { fetchRedis } from '@/helpers/redis'
import {
  formGroups,
  pickIcebreakers,
  type CurationRunResult,
  type GroupChat,
} from '@groupchat/shared'
import {
  CURATION_POOL_KEY,
  buildGroupChat,
  expireAllActiveChats,
  loadCurationHistory,
  saveNewChat,
} from './chat-store'

export async function runCuration(options?: {
  expireExisting?: boolean
}): Promise<CurationRunResult> {
  const expireExisting = options?.expireExisting ?? true
  const expiredChatIds = expireExisting ? await expireAllActiveChats() : []

  const pool = ((await fetchRedis('smembers', CURATION_POOL_KEY)) as string[] | null) ?? []
  const userIds = [...new Set(pool.filter(Boolean))]

  if (userIds.length === 0) {
    return { chats: [], skippedUserIds: [], expiredChatIds }
  }

  const history = await loadCurationHistory(userIds)
  const { groups, skipped } = formGroups(userIds, history)
  const icebreakers = pickIcebreakers(groups.length)
  const now = Date.now()
  const chats: GroupChat[] = []

  for (let i = 0; i < groups.length; i++) {
    const members = groups[i]
    if (!members?.length) continue
    const chat = buildGroupChat(members, icebreakers[i] ?? null, now)
    await saveNewChat(chat)
    chats.push(chat)
  }

  return {
    chats,
    skippedUserIds: skipped,
    expiredChatIds,
  }
}

export async function addUsersToCurationPool(userIds: string[]): Promise<void> {
  if (!userIds.length) return
  await Promise.all(userIds.map((id) => db.sadd(CURATION_POOL_KEY, id)))
}
