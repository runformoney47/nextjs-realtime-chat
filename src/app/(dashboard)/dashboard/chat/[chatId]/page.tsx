import ChatWrapper from '@/components/ChatWrapper'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { messageArrayValidator } from '@/lib/validations/message'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

// The following generateMetadata function was written after the video and is purely optional
export async function generateMetadata({
  params,
}: {
  params: { chatId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const chatId = params.chatId

  // Check if it's a group chat
  if (chatId.startsWith('group_')) {
    const chatData = await fetchRedis('get', `chat:${chatId}`)
    if (!chatData) notFound()
    
    const groupChat = JSON.parse(chatData) as GroupChat
    return { title: `FriendZone | ${groupChat.name}` }
  }

  // It's a one-to-one chat
  const [userId1, userId2] = chatId.split('--')
  const { user } = session

  const chatPartnerId = user.id === userId1 ? userId2 : userId1
  const chatPartnerRaw = (await fetchRedis(
    'get',
    `user:${chatPartnerId}`
  )) as string
  const chatPartner = JSON.parse(chatPartnerRaw) as User

  return { title: `FriendZone | ${chatPartner.name} chat` }
}

interface PageProps {
  params: {
    chatId: string
  }
}

async function getChatData(chatId: string) {
  // Check if it's a group chat
  if (chatId.startsWith('group_')) {
    const chatData = await fetchRedis('get', `chat:${chatId}`)
    if (!chatData) return null
    return JSON.parse(chatData) as GroupChat
  }

  // It's a one-to-one chat
  const [userId1, userId2] = chatId.split('--')
  if (!userId1 || !userId2) return null

  const user2 = await fetchRedis('get', `user:${userId2}`)
  if (!user2) return null
  
  return {
    id: chatId,
    isGroup: false,
    user: JSON.parse(user2) as User
  }
}

async function getUserColors(chatId: string, members: string[]) {
  // Fetch all user colors for this chat
  const userColors: Record<string, string> = {}
  
  console.log(`Fetching colors for chat ${chatId} with ${members.length} members`)
  
  for (const userId of members) {
    try {
      // Try using db.get directly instead of fetchRedis
      const colorKey = `chat:${chatId}:user:${userId}:color`
      const color = await db.get(colorKey) as string | null
      
      console.log(`User ${userId} color from db.get: ${color}`)
      
      if (color) {
        userColors[userId] = color
      } else {
        console.log(`No color found for user ${userId} in chat ${chatId}`)
      }
    } catch (error) {
      console.error(`Error fetching color for user ${userId}:`, error)
    }
  }

  console.log('Final user colors object:', userColors)
  return userColors
}

async function Page({ params }: PageProps) {
  const { chatId } = params
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const chatData = await getChatData(chatId)
  if (!chatData) notFound()

  const isGroupChat = 'members' in chatData

  // Verify user has access to chat
  if (isGroupChat) {
    const groupChat = chatData as GroupChat
    if (!groupChat.members.includes(session.user.id)) notFound()
    
    // Set this as the user's current chat if it's a group chat
    await db.set(`user:${session.user.id}:current_group_chat`, chatId)
  } else {
    const [userId1, userId2] = chatId.split('--')
    if (session.user.id !== userId1 && session.user.id !== userId2) {
      notFound()
    }
  }

  const initialMessages = await fetchRedis(
    'zrange',
    `chat:${chatId}:messages`,
    0,
    -1
  ) as string[]

  const messages = messageArrayValidator.parse(
    initialMessages.map((message) => JSON.parse(message))
  )

  // Get user colors for group chat
  let userColors = {}
  let members: string[] = []
  if (isGroupChat) {
    const groupChat = chatData as GroupChat
    members = groupChat.members
    userColors = await getUserColors(chatId, members)
  }

  // Set a custom title for group chats
  const title = isGroupChat 
    ? '' // Empty title for group chats
    : (chatData as any).user.name

  const chatPartnerImage = isGroupChat
    ? null // No image for group chats
    : (chatData as any).user.image

  return (
    <ChatWrapper
      chatId={chatId}
      initialMessages={messages}
      sessionId={session.user.id}
      sessionImg={session.user.image}
      chatPartner={isGroupChat ? null : (chatData as any).user}
      title={title}
      chatPartnerImage={chatPartnerImage}
      isGroupChat={isGroupChat}
      userColors={userColors}
      members={members}
    />
  )
}

export default Page
