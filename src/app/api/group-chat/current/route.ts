import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const url = new URL(req.url)
    // If userId is provided, use it (for admin purposes), otherwise use the session user's ID
    const userId = url.searchParams.get('userId') || session.user.id

    // Get the user's current group chat - simplified approach
    let chatId: string | null = null
    let chatData: any = null
    let error: string | null = null

    try {
      // Get the current group chat ID
      const currentGroupChatKey = `user:${userId}:current_group_chat`
      chatId = await fetchRedis('get', currentGroupChatKey) as string | null

      if (chatId) {
        // Get the chat data if we have an ID
        const chatDataRaw = await fetchRedis('get', `chat:${chatId}`) as string | null
        
        if (chatDataRaw) {
          chatData = JSON.parse(chatDataRaw)
          
          // Simple check for archived status
          if (chatData.archived) {
            error = 'Chat is archived'
            chatId = null
            chatData = null
          }
          // Simple check for membership
          else if (!chatData.members.includes(userId)) {
            error = 'User is not a member of this chat'
            chatId = null
            chatData = null
          }
        } else {
          error = 'Chat data not found'
          chatId = null
        }
      } else {
        error = 'No current group chat found'
      }
    } catch (redisError) {
      console.error('Redis error:', redisError)
      error = 'Database error'
      chatId = null
      chatData = null
    }

    // Return a clean, simple response
    return new Response(JSON.stringify({
      id: chatId,
      data: chatData,
      error: error
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (error) {
    console.error('Error in current group chat endpoint:', error)
    return new Response('Server error', { status: 500 })
  }
} 