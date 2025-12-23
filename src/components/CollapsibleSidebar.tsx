'use client'

import { FC, useState } from 'react'
import { Icons } from '@/components/Icons'
import Image from 'next/image'
import Link from 'next/link'
import SignOutButton from '@/components/SignOutButton'
import FriendRequestSidebarOptions from '@/components/FriendRequestSidebarOptions'
import SidebarChatList from '@/components/SidebarChatList'
import { SidebarOption } from '@/types/typings'
import { ChevronLeft, Menu } from 'lucide-react'

interface CollapsibleSidebarProps {
  friends: User[]
  session: {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
  sidebarOptions: SidebarOption[]
  adminSidebarOptions: SidebarOption[]
  unseenRequestCount: number
  isAdmin: boolean
}

const CollapsibleSidebar: FC<CollapsibleSidebarProps> = ({
  friends,
  session,
  sidebarOptions,
  adminSidebarOptions,
  unseenRequestCount,
  isAdmin,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="hidden md:block h-full">
      {/* Collapsed state - thin strip */}
      {!isExpanded && (
        <div className="flex flex-col items-center py-4 bg-white border-r border-gray-200 w-16 h-full">
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
            aria-label="Expand sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Minimized user avatar at bottom */}
          <div className="mt-auto mb-4">
            <div className="relative h-8 w-8">
              <Image
                fill
                referrerPolicy="no-referrer"
                className="rounded-full"
                src={session.user.image || ''}
                alt="Your profile picture"
              />
            </div>
          </div>
        </div>
      )}

      {/* Expanded state - full sidebar */}
      {isExpanded && (
        <div className="flex h-full w-72 flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
        <div className="flex h-16 shrink-0 items-center justify-end">
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        {friends.length > 0 ? (
          <div className="text-xs font-semibold leading-6 text-gray-400">
            Your chats
          </div>
        ) : null}

        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <SidebarChatList sessionId={session.user.id} friends={friends} />
            </li>
            <li>
              <div className="text-xs font-semibold leading-6 text-gray-400">
                Overview
              </div>

              <ul role="list" className="-mx-2 mt-2 space-y-1">
                {sidebarOptions.map((option) => {
                  const Icon = Icons[option.Icon]
                  return (
                    <li key={option.id}>
                      <Link
                        href={option.href}
                        className="text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex gap-3 rounded-md p-2 text-sm leading-6 font-semibold"
                      >
                        <span className="text-gray-400 border-gray-200 group-hover:border-indigo-600 group-hover:text-indigo-600 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[0.625rem] font-medium bg-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{option.name}</span>
                      </Link>
                    </li>
                  )
                })}

                {isAdmin &&
                  adminSidebarOptions.map((option) => {
                    const Icon = Icons[option.Icon]
                    return (
                      <li key={option.id}>
                        <Link
                          href={option.href}
                          className="text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex gap-3 rounded-md p-2 text-sm leading-6 font-semibold"
                        >
                          <span className="text-gray-400 border-gray-200 group-hover:border-indigo-600 group-hover:text-indigo-600 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[0.625rem] font-medium bg-white">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate">{option.name}</span>
                        </Link>
                      </li>
                    )
                  })}

                <li>
                  <FriendRequestSidebarOptions
                    sessionId={session.user.id}
                    initialUnseenRequestCount={unseenRequestCount}
                  />
                </li>
              </ul>
            </li>

            <li className="-mx-6 mt-auto flex items-center">
              <div className="flex flex-1 items-center gap-x-4 px-6 py-3 text-sm font-semibold leading-6 text-gray-900">
                <div className="relative h-8 w-8 bg-gray-50">
                  <Image
                    fill
                    referrerPolicy="no-referrer"
                    className="rounded-full"
                    src={session.user.image || ''}
                    alt="Your profile picture"
                  />
                </div>

                <span className="sr-only">Your profile</span>
                <div className="flex flex-col">
                  <span aria-hidden="true">{session.user.name}</span>
                  <span className="text-xs text-zinc-400" aria-hidden="true">
                    {session.user.email}
                  </span>
                </div>
              </div>

              <SignOutButton className="h-full aspect-square" />
            </li>
          </ul>
        </nav>
        </div>
      )}
    </div>
  )
}

export default CollapsibleSidebar

