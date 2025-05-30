import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { chatId } = params

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

    // Get the user's rankings from Redis
    const rankingsKey = `chat:${chatId}:user:${session.user.id}:rankings`
    
    // Try to get the stored rankings
    let rankings
    try {
      rankings = await fetchRedis('get', rankingsKey)
    } catch (error) {
      console.log('No rankings found, returning empty array')
      rankings = null
    }

    const parsedRankings = rankings ? JSON.parse(rankings as string) : []
    
    return new Response(JSON.stringify({
      rankings: parsedRankings
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error retrieving rankings:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
} 