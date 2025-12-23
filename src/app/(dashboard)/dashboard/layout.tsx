import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import { ReactNode } from 'react'
import { fetchRedis } from '@/helpers/redis'
import { getFriendsByUserId } from '@/helpers/get-friends-by-user-id'
import MobileChatLayout from '@/components/MobileChatLayout'
import { SidebarOption } from '@/types/typings'
import GroupChatTransitionListener from '@/components/GroupChatTransitionListener'
import CollapsibleSidebar from '@/components/CollapsibleSidebar'
import UserNavigation from '@/components/UserNavigation'
import { db } from '@/lib/db'

interface LayoutProps {
  children: ReactNode
}

// Done after the video and optional: add page metadata
export const metadata = {
  title: 'FriendZone | Dashboard',
  description: 'Your dashboard',
}

const sidebarOptions: SidebarOption[] = [
  {
    id: 3,
    name: 'Health debug',
    href: '/dashboard/admin/health',
    Icon: 'RefreshCw',
  },
]

const Layout = async ({ children }: LayoutProps) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const isAdmin = session.user.isAdmin === true

  const friends = await getFriendsByUserId(session.user.id)
  console.log('friends', friends)

  const unseenRequestCount = (
    (await fetchRedis(
      'smembers',
      `user:${session.user.id}:incoming_friend_requests`
    )) as User[]
  ).length

  // Get current group chat for user navigation
  const currentGroupChatId = await db.get(`user:${session.user.id}:current_group_chat`) as string | null

  // Admin-only sidebar options
  const adminSidebarOptions: SidebarOption[] = [
    {
      id: 2,
      name: 'Rebuild Group Chats',
      href: '/dashboard/admin/rebuild-groupchats',
      Icon: 'RefreshCw',
    },
  ]

  // Admin view with sidebar
  if (isAdmin) {
    return (
      <div className='w-full flex h-screen overflow-hidden'>
        {/* Global listener for group chat transitions */}
        <GroupChatTransitionListener sessionUserId={session.user.id} />
        <div className='md:hidden'>
          <MobileChatLayout
            friends={friends}
            session={session}
            sidebarOptions={sidebarOptions}
            unseenRequestCount={unseenRequestCount}
          />
        </div>

        <CollapsibleSidebar
          friends={friends}
          session={session}
          sidebarOptions={sidebarOptions}
          adminSidebarOptions={adminSidebarOptions}
          unseenRequestCount={unseenRequestCount}
          isAdmin={isAdmin}
        />

        <main className='flex-1 h-full overflow-auto'>
          {children}
        </main>
      </div>
    )
  }

  // User view - simple layout with navigation spheres
  return (
    <div className='w-full flex flex-col h-screen overflow-hidden'>
      {/* Global listener for group chat transitions */}
      <GroupChatTransitionListener sessionUserId={session.user.id} />
      
      {/* User navigation with two spheres */}
      <UserNavigation currentGroupChatId={currentGroupChatId} userName={session.user.name || null} />

      {/* Main content area */}
      <main className='flex-1 h-full overflow-auto'>
        {children}
      </main>
    </div>
  )
}

export default Layout
