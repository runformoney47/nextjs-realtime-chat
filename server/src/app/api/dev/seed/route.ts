import { db } from '@/lib/db'
import { upsertUser } from '@/lib/user-store'
import { nanoid } from 'nanoid'
import type { ApiResponse, GroupChat } from '@groupchat/shared'
import { CHAT_COLORS } from '@groupchat/shared'

/**
 * POST /api/dev/seed
 *
 * DEV ONLY. Creates test users and assigns them to group chats of 5.
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
    const groupSize = Math.min(body.groupSize ?? 5, 10)

    const icebreakers = [
      "What's something you've been obsessed with lately?",
      "If you could have dinner with anyone, alive or dead, who would it be?",
      "What's the most underrated thing in your life right now?",
      "Hot take time — drop your most controversial opinion 🔥",
      "What's a skill you wish you had but have never tried to learn?",
    ]

    // ─── Create users ──────────────────────────────────────────────────
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

    // ─── Shuffle users ─────────────────────────────────────────────────
    const shuffled = [...users]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // ─── Create group chats ────────────────────────────────────────────
    const chats: GroupChat[] = []
    const now = Date.now()
    const expiresAt = now + 72 * 60 * 60 * 1000

    for (let g = 0; g < Math.floor(shuffled.length / groupSize); g++) {
      const members = shuffled.slice(g * groupSize, (g + 1) * groupSize)
      const chatId = `group_${nanoid()}`

      // Assign colors
      const memberColors: Record<string, string> = {}
      members.forEach((user, i) => {
        memberColors[user.id] = CHAT_COLORS[i % CHAT_COLORS.length]
      })

      const chat: GroupChat = {
        id: chatId,
        members: members.map((u) => u.id),
        memberColors,
        createdAt: now,
        expiresAt,
        active: true,
        icebreaker: icebreakers[g % icebreakers.length] ?? null,
      }

      // Persist chat
      await db.set(`chat:${chatId}`, JSON.stringify(chat))

      // Each member gets this as their ONE active chat
      for (const member of members) {
        await db.set(`user:${member.id}:current_chat`, chatId)
        await db.sadd(`user:${member.id}:group_chats`, chatId)
      }

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
    } satisfies ApiResponse<any>)
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
        deleted++
      }

      await db.del(`user:${userId}`)
      await db.del(`user:email:${email}`)
      await db.del(`user:${userId}:profile`)
      await db.del(`user:${userId}:group_chats`)
      await db.del(`user:${userId}:current_chat`)
      await db.del(`user:${userId}:device_tokens`)
      await db.srem('users:all', userId)
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
