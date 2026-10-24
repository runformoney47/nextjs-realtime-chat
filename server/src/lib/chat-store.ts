import { nanoid } from 'nanoid'
import { db } from './db'
import { fetchRedis } from '@/helpers/redis'
import { getAllUserIds } from './user-store'
import { sendPushToUser } from './push'
import {
  ANTI_REPEAT_CYCLES,
  CHAT_COLORS,
  CHAT_WINDOW_HOURS,
  type GroupChat,
} from '@groupchat/shared'

export const CHATS_ACTIVE_KEY = 'chats:active'
export const CURATION_POOL_KEY = 'curation:pool:active'

export function buildGroupChat(
  members: string[],
  icebreaker: string | null,
  now = Date.now(),
): GroupChat {
  const memberColors: Record<string, string> = {}
  members.forEach((id, i) => {
    memberColors[id] = CHAT_COLORS[i % CHAT_COLORS.length]
  })

  return {
    id: `group_${nanoid()}`,
    members,
    memberColors,
    createdAt: now,
    expiresAt: now + CHAT_WINDOW_HOURS * 60 * 60 * 1000,
    active: true,
    icebreaker,
  }
}

export async function saveNewChat(chat: GroupChat): Promise<void> {
  await db.set(`chat:${chat.id}`, JSON.stringify(chat))
  await db.sadd(CHATS_ACTIVE_KEY, chat.id)

  await Promise.all(
    chat.members.map((memberId) =>
      Promise.all([
        db.set(`user:${memberId}:current_chat`, chat.id),
        db.sadd(`user:${memberId}:group_chats`, chat.id),
      ]),
    ),
  )

  await appendCurationHistory(chat.members)

  // Notify all members of the new group chat
  await Promise.allSettled(
    chat.members.map((memberId) =>
      sendPushToUser(memberId, {
        title: 'New group chat',
        body: chat.icebreaker ? `Your new group chat is ready! ${chat.icebreaker}` : 'Your new group chat is ready! 💬',
        data: { type: 'new_chat', chatId: chat.id },
      }),
    ),
  )
}

export async function expireChatById(
  chatId: string,
  now = Date.now(),
): Promise<GroupChat | null> {
  const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
  if (!raw) return null

  let chat: GroupChat
  try {
    chat = JSON.parse(raw) as GroupChat
  } catch {
    return null
  }

  const updated: GroupChat = {
    ...chat,
    active: false,
    expiresAt: Math.min(chat.expiresAt, now),
  }

  await Promise.all([
    db.set(`chat:${chatId}`, JSON.stringify(updated)),
    db.srem(CHATS_ACTIVE_KEY, chatId),
  ])

  return updated
}

export async function listActiveChatIds(): Promise<string[]> {
  const indexed = ((await fetchRedis('smembers', CHATS_ACTIVE_KEY)) as string[] | null) ?? []
  if (indexed.length) return [...new Set(indexed)]

  // Fallback for chats created before chats:active existed
  const userIds = await getAllUserIds()
  const ids = new Set<string>()
  for (const userId of userIds) {
    const chatId = (await fetchRedis('get', `user:${userId}:current_chat`)) as string | null
    if (chatId) ids.add(chatId)
  }
  return [...ids]
}

export async function expireAllActiveChats(now = Date.now()): Promise<string[]> {
  const chatIds = await listActiveChatIds()
  const expired: string[] = []

  for (const chatId of chatIds) {
    const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!raw) {
      await db.srem(CHATS_ACTIVE_KEY, chatId)
      continue
    }
    try {
      const chat = JSON.parse(raw) as GroupChat
      if (!chat.active) {
        await db.srem(CHATS_ACTIVE_KEY, chatId)
        continue
      }
      const updated = await expireChatById(chatId, now)
      if (updated) expired.push(chatId)
    } catch {
      await db.srem(CHATS_ACTIVE_KEY, chatId)
    }
  }

  return expired
}

export async function loadCurationHistory(userIds: string[]): Promise<Record<string, string[][]>> {
  const history: Record<string, string[][]> = {}

  await Promise.all(
    userIds.map(async (userId) => {
      const raw = (await fetchRedis('get', `curation:history:${userId}`)) as string | null
      if (!raw) {
        history[userId] = []
        return
      }
      try {
        history[userId] = JSON.parse(raw) as string[][]
      } catch {
        history[userId] = []
      }
    }),
  )

  return history
}

async function appendCurationHistory(members: string[]): Promise<void> {
  await Promise.all(
    members.map(async (userId) => {
      const mates = members.filter((id) => id !== userId)
      const raw = (await fetchRedis('get', `curation:history:${userId}`)) as string | null
      let prev: string[][] = []
      if (raw) {
        try {
          prev = JSON.parse(raw) as string[][]
        } catch {
          prev = []
        }
      }
      const next = [mates, ...prev].slice(0, ANTI_REPEAT_CYCLES)
      await db.set(`curation:history:${userId}`, JSON.stringify(next))
    }),
  )
}
