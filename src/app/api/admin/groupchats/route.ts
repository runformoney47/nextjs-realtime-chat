import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchRedis } from '@/helpers/redis'
import { db } from '@/lib/db'
import { getAllGroupChatIds } from '@/lib/group-chats'

type GroupChatRecord = {
  id: string
  members: string[]
  createdAt?: number
  transitionDate?: number | null
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.isAdmin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prefer canonical index; fall back to "active" index; finally fall back to scanning/backfill.
    let ids = ((await fetchRedis('smembers', 'group_chats:all')) as string[] | null) ?? []
    if (!ids.length) {
      ids = ((await fetchRedis('smembers', 'group_chats:active')) as string[] | null) ?? []
    }
    if (!ids.length) {
      ids = await getAllGroupChatIds()
    }
    if (!ids.length) return NextResponse.json({ groupChats: [] }, { status: 200 })

    const groupChats = (
      await Promise.all(
        ids.map(async (id) => {
          const raw = (await fetchRedis('get', `chat:${id}`)) as string | null
          if (!raw) return null
          try {
            const parsed = JSON.parse(raw) as GroupChatRecord
            const messageCount = (await db.zcard(`chat:${id}:messages`)) as number
            return { ...parsed, messageCount }
          } catch {
            return null
          }
        }),
      )
    ).filter(Boolean)

    // Newest first if createdAt exists
    groupChats.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

    return NextResponse.json({ groupChats }, { status: 200 })
  } catch (error) {
    console.error('[Admin][GroupChats][GET] Failed', error)
    return NextResponse.json({ error: 'Failed to load group chats' }, { status: 500 })
  }
}


