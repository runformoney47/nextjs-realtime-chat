import { authenticate } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import type { ApiResponse } from '@groupchat/shared'

export async function DELETE(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  try {
    const userId = auth.sub

    // Remove from users sets
    await db.srem('users:all', userId)
    // Remove user data
    await db.del(`user:${userId}`)
    await db.del(`user:${userId}:profile`)
    await db.del(`user:${userId}:current_chat`)
    await db.del(`user:${userId}:device_tokens`)
    await db.del(`curation:history:${userId}`)
    await db.srem('curation:pool:active', userId)

    // Remove from chats
    const chatIds = ((await fetchRedis('smembers', `user:${userId}:group_chats`)) as string[] | null) ?? []
    for (const chatId of chatIds) {
      await db.srem(`user:${userId}:group_chats`, chatId)
    }

    // Remove blocks
    await db.del(`blocks:${userId}`)

    return Response.json({ ok: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: boolean }>)
  } catch (error) {
    console.error('[auth/delete] Error:', error)
    return Response.json(
      { ok: false, error: 'Failed to delete account' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
