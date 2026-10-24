import { db } from '@/lib/db'
import { upsertUser } from '@/lib/user-store'
import { addUsersToCurationPool } from '@/lib/curation'
import {
  CHATS_ACTIVE_KEY,
  CURATION_POOL_KEY,
  buildGroupChat,
  saveNewChat,
} from '@/lib/chat-store'
import type { ApiResponse, GroupChat } from '@groupchat/shared'
import { GROUP_SIZE, pickIcebreakers } from '@groupchat/shared'

/**
 * POST /api/dev/seed
 *
 * DEV ONLY. Creates test users, adds them to the curation pool, and
 * assigns them to group chats of 5.
 *
 * Body: { userCount?: number, groupSize?: number }
 * Defaults: 20 users, groups of 5 → 4 chats
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userCount = Math.min(body.userCount ?? 20, 100)
    const groupSize = Math.min(body.groupSize ?? GROUP_SIZE, 10)

    const users = []
    for (let i = 0; i < userCount; i++) {
      const name = `User_${i + 1}`
      const email = `test-${i + 1}@groupchat.dev`
      const image = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(name)}`

      const user = await upsertUser({
        id: `test-user-${i + 1}`,
        name,
        email,
        image,
      })
      users.push(user)
    }

    await addUsersToCurationPool(users.map((u) => u.id))

    const shuffled = [...users]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const groupCount = Math.floor(shuffled.length / groupSize)
    const icebreakers = pickIcebreakers(groupCount)
    const chats: GroupChat[] = []
    const now = Date.now()

    for (let g = 0; g < groupCount; g++) {
      const members = shuffled.slice(g * groupSize, (g + 1) * groupSize)
      const chat = buildGroupChat(
        members.map((u) => u.id),
        icebreakers[g] ?? null,
        now,
      )
      await saveNewChat(chat)
      chats.push(chat)
    }

    return Response.json({
      ok: true,
      data: {
        users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        chats: chats.map((c) => ({
          id: c.id,
          members: c.members,
          icebreaker: c.icebreaker,
        })),
      },
    } satisfies ApiResponse<{
      users: { id: string; name: string; email: string }[]
      chats: { id: string; members: string[]; icebreaker: string | null }[]
    }>)
  } catch (error) {
    console.error('[dev/seed] Error:', error)
    return Response.json(
      { ok: false, error: 'Seed failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/dev/seed
 *
 * Wipe all test data.
 */
export async function DELETE() {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    let deleted = 0
    for (let i = 1; i <= 100; i++) {
      const userId = `test-user-${i}`
      const email = `test-${i}@groupchat.dev`

      const chatIds = (await db.smembers(`user:${userId}:group_chats`)) as string[]
      for (const chatId of chatIds ?? []) {
        await db.del(`chat:${chatId}`)
        await db.del(`chat:${chatId}:messages`)
        await db.srem(CHATS_ACTIVE_KEY, chatId)
        deleted++
      }

      await db.del(`user:${userId}`)
      await db.del(`user:email:${email}`)
      await db.del(`user:${userId}:profile`)
      await db.del(`user:${userId}:group_chats`)
      await db.del(`user:${userId}:current_chat`)
      await db.del(`user:${userId}:device_tokens`)
      await db.del(`curation:history:${userId}`)
      await db.srem('users:all', userId)
      await db.srem(CURATION_POOL_KEY, userId)
      deleted++
    }

    return Response.json({ ok: true, data: { deleted } } satisfies ApiResponse<{ deleted: number }>)
  } catch (error) {
    console.error('[dev/seed] Delete error:', error)
    return Response.json(
      { ok: false, error: 'Cleanup failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
