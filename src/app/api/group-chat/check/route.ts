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
    const chatId = url.searchParams.get('chatId')

    if (!chatId) {
      return new Response(JSON.stringify({
        exists: false,
        error: 'No chat ID provided'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Simple check if the chat exists in Redis
    let exists = false
    try {
      const chatData = await fetchRedis('get', `chat:${chatId}`) as string | null
      exists = !!chatData
    } catch (error) {
      console.error('Error checking chat existence:', error)
    }

    return new Response(JSON.stringify({
      exists,
      chatId
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (error) {
    console.error('Error in chat check endpoint:', error)
    return new Response('Server error', { status: 500 })
  }
} 