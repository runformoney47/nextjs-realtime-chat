import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

// Define validation schema
const updateSchema = z.object({
  userId: z.string(),
  chatId: z.string().startsWith('group_')
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Parse and validate request body
    const body = await req.json()
    const { userId, chatId } = updateSchema.parse(body)

    // Security check - users can only update their own current group chat
    // unless they are updating from an automated process (where userId will be their own)
    if (userId !== session.user.id) {
      return new Response('Unauthorized - can only update your own current group chat', { status: 403 })
    }

    // Verify the chat exists and user is a member
    try {
      const chatDataRaw = await fetchRedis('get', `chat:${chatId}`) as string | null
      
      if (!chatDataRaw) {
        return new Response('Chat not found', { status: 404 })
      }
      
      const chatData = JSON.parse(chatDataRaw)
      
      if (!chatData.members.includes(userId)) {
        return new Response('User is not a member of this chat', { status: 403 })
      }
    } catch (error) {
      console.error('Error verifying chat membership:', error)
      return new Response('Error verifying chat membership', { status: 500 })
    }

    // Update the user's current group chat
    await db.set(`user:${userId}:current_group_chat`, chatId)
    
    console.log(`Updated current group chat for user ${userId} to ${chatId}`)

    return new Response(JSON.stringify({
      success: true,
      message: 'Current group chat updated successfully'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error updating current group chat:', error)
    
    if (error instanceof z.ZodError) {
      return new Response('Invalid request data', { status: 400 })
    }
    
    return new Response('Server error', { status: 500 })
  }
} 