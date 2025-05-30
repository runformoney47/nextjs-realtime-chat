import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    const groupChatValidator = z.object({
      name: z.string(),
      memberIds: z.array(z.string())
    })

    const { name, memberIds } = groupChatValidator.parse(body)

    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create unique group chat ID
    const groupChatId = 'group_' + nanoid()

    // Add creator to members if not already included
    if (!memberIds.includes(session.user.id)) {
      memberIds.push(session.user.id)
    }

    // Create group chat object
    const groupChat: GroupChat = {
      id: groupChatId,
      name,
      creatorId: session.user.id,
      members: memberIds,
      createdAt: Date.now()
    }

    // Store group chat data in Redis
    await Promise.all([
      // Store group chat info
      db.set(`chat:${groupChatId}`, JSON.stringify(groupChat)),
      
      // Add chat to each member's group chats list
      ...memberIds.map(memberId => 
        db.sadd(`user:${memberId}:group_chats`, groupChatId)
      )
    ])

    // Notify all members via Pusher
    await Promise.all(
      memberIds.map(memberId =>
        pusherServer.trigger(
          toPusherKey(`user:${memberId}:group_chats`),
          'new_group_chat',
          groupChat
        )
      )
    )

    return new Response(JSON.stringify(groupChat))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response('Invalid request payload', { status: 422 })
    }

    return new Response('Invalid request', { status: 400 })
  }
} 