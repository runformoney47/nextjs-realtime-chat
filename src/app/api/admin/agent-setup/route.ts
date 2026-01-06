import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { saveAppUser } from '@/lib/user-store'
import { addGroupChatId, removeGroupChatIds } from '@/lib/group-chats'
import { nanoid } from 'nanoid'
import { messageValidator } from '@/lib/validations/message'
import type { AppUser } from '@/lib/user-store'

type Schedule = string[][][]

const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet'] as const
function buildIntroText({ senderId, members }: { senderId: string; members: string[] }) {
  const otherCount = Math.max(0, members.length - 1)
  return `Hey everyone — I’m ${senderId}. Quick intros? What should we talk about today? (${otherCount} others here)`
}

function shuffled<T>(arr: T[]) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function isSimUserRecord(user: Partial<AppUser> | null) {
  if (!user) return false
  if (user.isSimUser === true) return true
  if (typeof user.email === 'string' && user.email.endsWith('@example.com')) return true
  return false
}

async function deleteKeysMatching(pattern: string, keep: Set<string>) {
  // Use SCAN to avoid "ERR too many keys to fetch" (Upstash limits KEYS).
  // We delete in chunks as we iterate to keep memory bounded.
  let cursor = 0
  let deleted = 0
  const CHUNK = 500

  do {
    const [nextCursor, keys] = await db.scan(cursor, { match: pattern, count: 1000 })
    cursor = nextCursor

    const toDelete = (keys ?? []).filter((k) => !keep.has(k))
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK)
      if (chunk.length) {
        await db.del(...chunk)
        deleted += chunk.length
      }
    }
  } while (cursor !== 0)

  return deleted
}

/**
 * POST /api/admin/agent-setup
 *
 * Local-only tooling:
 * - Clears simulation-related Redis keys
 * - Creates 100 sim users with id/name "0".."99"
 * - Builds a 1-day schedule with 20 random groups of 5
 * - Creates group chats and assigns each user:
 *   - user:<id>:group_chats
 *   - user:<id>:current_group_chat
 *   - chat:<groupId>:user:<id>:color
 */
export async function POST(req: Request) {
  try {
    // Safety gate: only allow when explicitly enabled
    if (process.env.AGENT_MODE !== 'true') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    if (!session || session.user?.isAdmin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Preserve all non-sim users (e.g. Gmail admins) so Agent Setup never deletes real accounts.
    const keep = new Set<string>()
    const existingUserIds = ((await fetchRedis('smembers', 'users:all')) as string[] | null) ?? []
    const preservedAdminIds: string[] = []

    for (const id of existingUserIds) {
      const raw = (await fetchRedis('get', `user:${id}`)) as string | null
      if (!raw) continue
      try {
        const user = JSON.parse(raw) as Partial<AppUser>
        if (!isSimUserRecord(user)) {
          preservedAdminIds.push(id)
          keep.add(`user:${id}`)
          if (user.email) keep.add(`user:email:${user.email}`)
        }
      } catch {
        // ignore malformed user record
      }
    }

    // Remove group chat index so we can rebuild it cleanly
    const existingGroupChatIds = (await fetchRedis('smembers', 'group_chats:all')) as
      | string[]
      | null
    await removeGroupChatIds(existingGroupChatIds ?? [])

    // Clear simulation-related keys
    const deleted = {
      user: await deleteKeysMatching('user:*', keep),
      chat: await deleteKeysMatching('chat:*', keep),
      ranking: await deleteKeysMatching('ranking:*', keep),
      transition: await deleteKeysMatching('group_chat_transition:*', keep),
      schedule: await deleteKeysMatching('schedule:*', keep),
    }

    // Also clear a few fixed keys (unless preserved)
    const fixedKeys = [
      'available_group_chats',
      'last_group_chat_transition',
      'group_chats:all',
    ]
    for (const k of fixedKeys) {
      if (!keep.has(k)) {
        await db.del(k)
      }
    }

    // Rebuild users:all cleanly (admins + sim users)
    await db.del('users:all')

    // Create 100 sim users with id/name "0".."99"
    const userIds: string[] = []
    for (let i = 0; i < 100; i += 1) {
      const id = String(i)
      const name = String(i)
      const email = `sim-${id}@example.com`
      userIds.push(id)

      await saveAppUser(
        {
          id,
          name,
          email,
          image: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(
            id,
          )}`,
          isOnline: true,
          isSimUser: true,
        },
        { source: 'agent-setup' },
      )
    }

    if (preservedAdminIds.length) {
      await db.sadd('users:all', ...preservedAdminIds)
    }

    // Build a single-day schedule: 20 groups of 5
    const day0 = []
    const ids = shuffled(userIds)
    for (let i = 0; i < ids.length; i += 5) {
      day0.push(ids.slice(i, i + 5))
    }
    const schedule: Schedule = [day0]
    await Promise.all([
      db.set('schedule:master', JSON.stringify(schedule)),
      // Group chats last 3 days by default (one "epoch" = 3 days)
      db.set('schedule:epoch_length', '3'),
      // Day 0 will be applied immediately below
      db.set('schedule:current_day', '0'),
      // Track active group chats for the currently-applied epoch
      db.del('group_chats:active'),
    ])

    // Apply schedule day 0: create group chats and assign current_group_chat
    const createdGroupChats: { chatId: string; members: string[] }[] = []
    for (const members of day0) {
      const groupChatId = `group_${nanoid()}`
      const groupChat = {
        id: groupChatId,
        name: '',
        creatorId: session.user.id,
        members,
        createdAt: Date.now(),
        transitionDate: null,
      }

      await Promise.all([
        db.set(`chat:${groupChatId}`, JSON.stringify(groupChat)),
        addGroupChatId(groupChatId),
        db.sadd('group_chats:active', groupChatId),
      ])

      // Assign per-chat colors and set user pointers
      for (let idx = 0; idx < members.length; idx += 1) {
        const memberId = members[idx]
        const color = COLORS[idx % COLORS.length]
        await Promise.all([
          db.set(`chat:${groupChatId}:user:${memberId}:color`, color),
          db.sadd(`user:${memberId}:group_chats`, groupChatId),
          db.sadd(`user:${memberId}:group_chats_history`, groupChatId),
          db.set(`user:${memberId}:current_group_chat`, groupChatId),
        ])
      }

      // Seed an intro message so brand-new chats are never empty.
      try {
        const senderId = members[0]
        const timestamp = Date.now()
        const intro = messageValidator.parse({
          id: `intro_${nanoid()}`,
          senderId,
          text: buildIntroText({ senderId, members }),
          timestamp,
        })
        await db.zadd(`chat:${groupChatId}:messages`, {
          score: timestamp,
          member: JSON.stringify(intro),
        })
      } catch {
        // best-effort only
      }

      createdGroupChats.push({ chatId: groupChatId, members })
    }

    return NextResponse.json(
      {
        ok: true,
        deleted,
        preservedAdminIds,
        createdUsers: userIds,
        schedule,
        createdGroupChats,
        loginHint: 'Use /agent/login?userId=<id> (id is 0..99) to log in instantly.',
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[AgentSetup] Failed', error)
    return NextResponse.json({ error: 'Failed to run agent setup' }, { status: 500 })
  }
}


