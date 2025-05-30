import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// The list of colors for anonymous identities
const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet']

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    const body = await req.json()
    const { chatId } = body
    
    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 })
    }

    // Check if it's a group chat
    const isGroupChat = chatId.startsWith('group_')
    if (!isGroupChat) {
      return new Response('This endpoint only works for group chats', { status: 400 })
    }

    // Get all members of the chat
    const chatDataRaw = await fetchRedis('get', `chat:${chatId}`)
    if (!chatDataRaw) {
      return new Response('Chat not found', { status: 404 })
    }

    const chatData = JSON.parse(chatDataRaw as string) as GroupChat
    const members = chatData.members

    // Check if the current user is a member
    if (!members.includes(session.user.id)) {
      return new Response('You are not a member of this chat', { status: 403 })
    }

    // Assign colors to all members
    const colorAssignments = []
    for (let i = 0; i < members.length; i++) {
      const memberId = members[i]
      const color = COLORS[i % COLORS.length]
      
      // Store the color in Redis
      const key = `chat:${chatId}:user:${memberId}:color`
      await db.set(key, color)
      
      // Verify it was set
      const verifiedColor = await db.get(key)
      
      colorAssignments.push({
        userId: memberId,
        color,
        verified: verifiedColor === color
      })
    }

    return new Response(JSON.stringify({
      success: true,
      chatId,
      colorAssignments
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error assigning colors:', error)
    return new Response('Server error', { status: 500 })
  }
} 