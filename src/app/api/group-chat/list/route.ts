import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return new Response('User ID is required', { status: 400 })
    }

    // Ensure the requesting user is only getting their own group chats
    if (userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get IDs of all group chats the user is a member of
    const groupChatIds = await fetchRedis('smembers', `user:${userId}:group_chats`) as string[]

    if (!groupChatIds.length) {
      return new Response(JSON.stringify([]))
    }

    // Fetch details of each group chat
    const groupChatsPromises = groupChatIds.map(async (chatId) => {
      const chatData = await fetchRedis('get', `chat:${chatId}`)
      if (!chatData) return null
      return JSON.parse(chatData) as GroupChat
    })

    const groupChats = (await Promise.all(groupChatsPromises)).filter(Boolean) as GroupChat[]
    
    return new Response(JSON.stringify(groupChats))
  } catch (error) {
    console.error('Error fetching group chats:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
} 