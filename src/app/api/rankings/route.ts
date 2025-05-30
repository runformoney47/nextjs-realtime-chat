import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

// Define validation schema for ranking data
const rankingSchema = z.object({
  chatId: z.string(),
  rankings: z.array(
    z.object({
      userId: z.string(),
      position: z.number()
    })
  )
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    
    // Validate the request body
    const { chatId, rankings } = rankingSchema.parse(body)

    // Check if this is a group chat
    if (!chatId.startsWith('group_')) {
      return new Response('This endpoint only works for group chats', { status: 400 })
    }

    // Verify the user is a member of this chat
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) {
      return new Response('Chat not found', { status: 404 })
    }

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    if (!chatData.members.includes(session.user.id)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    // Save the user's rankings in Redis
    // We'll use the format: `chat:{chatId}:user:{userId}:rankings`
    const rankingsKey = `chat:${chatId}:user:${session.user.id}:rankings`
    
    // Convert rankings to JSON string and store
    await db.set(rankingsKey, JSON.stringify(rankings))
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Rankings saved successfully'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error saving rankings:', error)
    
    if (error instanceof z.ZodError) {
      return new Response('Invalid request data', { status: 400 })
    }
    
    return new Response('Internal Server Error', { status: 500 })
  }
} 