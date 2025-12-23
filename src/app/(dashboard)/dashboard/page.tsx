import { getFriendsByUserId } from '@/helpers/get-friends-by-user-id'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { chatHrefConstructor } from '@/lib/utils'
import { db } from '@/lib/db'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const isAdmin = session.user.isAdmin === true

  console.log('[AdminCheck][DashboardPage]', {
    sessionUserId: session.user.id,
    isAdmin: session.user.isAdmin,
  })

  // For regular users, check if they have a current group chat and redirect them
  if (!isAdmin) {
    const currentGroupChatId = await db.get(`user:${session.user.id}:current_group_chat`) as string | null
    
    if (!currentGroupChatId) {
      // Show "No groupchat" page for regular users without a group chat
      return (
        <div className='flex flex-col items-center justify-center h-full'>
          <MessageSquare className='h-16 w-16 text-gray-300 mb-4' />
          <h1 className='text-2xl font-semibold text-gray-700'>No Group Chat</h1>
          <p className='mt-2 text-gray-500'>You are not currently assigned to a group chat.</p>
        </div>
      )
    }
    
    // Redirect regular users to their current group chat
    const { redirect } = await import('next/navigation')
    redirect(`/dashboard/chat/${currentGroupChatId}`)
  }

  // Admin view - show recent chats
  const friends = await getFriendsByUserId(session.user.id)

  const friendsWithLastMessage = await Promise.all(
    friends.map(async (friend) => {
      const [lastMessageRaw] = (await fetchRedis(
        'zrange',
        `chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`,
        -1,
        -1
      )) as string[]

      let lastMessage: Message | undefined = undefined
      
      if (lastMessageRaw) {
        lastMessage = JSON.parse(lastMessageRaw) as Message
      } else {
        lastMessage = {
          id: 'placeholder',
          senderId: friend.id,
          receiverId: session.user.id,
          text: 'No messages yet',
          timestamp: Date.now(),
        }
      }

      return {
        ...friend,
        lastMessage,
      }
    })
  )

  return (
    <div className='container py-12'>
      <div className='flex justify-between items-center mb-8'>
        <h1 className='font-bold text-5xl'>Recent chats</h1>
        {session.user.isAdmin && (
          <Link
            href='/admin'
            className='bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors'
          >
            Admin Panel
          </Link>
        )}
      </div>
      {friendsWithLastMessage.length === 0 ? (
        <p className='text-sm text-zinc-500'>Nothing to show here...</p>
      ) : (
        friendsWithLastMessage.map((friend) => (
          <div
            key={friend.id}
            className='relative bg-zinc-50 border border-zinc-200 p-3 rounded-md'>
            <div className='absolute right-4 inset-y-0 flex items-center'>
              <ChevronRight className='h-7 w-7 text-zinc-400' />
            </div>

            <Link
              href={`/dashboard/chat/${chatHrefConstructor(
                session.user.id,
                friend.id
              )}`}
              className='relative sm:flex'>
              <div className='mb-4 flex-shrink-0 sm:mb-0 sm:mr-4'>
                <div className='relative h-6 w-6'>
                  <Image
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                    alt={`${friend.name} profile picture`}
                    src={friend.image}
                    fill
                  />
                </div>
              </div>

              <div>
                <h4 className='text-lg font-semibold'>{friend.name}</h4>
                <p className='mt-1 max-w-md'>
                  <span className='text-zinc-400'>
                    {friend.lastMessage && friend.lastMessage.senderId === session.user.id
                      ? 'You: '
                      : ''}
                  </span>
                  {friend.lastMessage ? friend.lastMessage.text : 'No messages yet'}
                </p>
              </div>
            </Link>
          </div>
        ))
      )}
    </div>
  )
}

export default page
