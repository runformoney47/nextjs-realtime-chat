'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { pusherClient } from '@/lib/pusher'
import { toast } from 'react-hot-toast'

interface UseGroupChatTransitionListenerOptions {
  sessionUserId: string
}

/**
 * Central listener for group chat lifecycle events.
 *
 * Responsibilities:
 * - Listen to global Pusher events about group chat transitions.
 * - When a rebuild/transition completes, ask the backend which
 *   group chat is current for this user and navigate there.
 * - Show consistent toasts so users understand what's happening.
 *
 * This hook does NOT render anything; it should be mounted once
 * in any shell that is always present when a user is signed in
 * (e.g. dashboard layout, sidebar shell, or top-level client
 * component).
 */
export function useGroupChatTransitionListener(
  options: UseGroupChatTransitionListenerOptions,
) {
  const { sessionUserId } = options
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!sessionUserId) return

    const globalChannel = pusherClient.subscribe('global_notifications')

    const handleTransitionStarted = (data: unknown) => {
      console.log('[GroupChatTransition] started', data)

      toast.loading('Group chats are being updated. Please wait...', {
        id: 'group-chat-transition',
        duration: 10_000,
      })
    }

    const handleGroupChatUpdate = async (data: { eventType?: string } | unknown) => {
      const event = data as { eventType?: string }
      console.log('[GroupChatTransition] update', event)

      if (event.eventType !== 'rebuild') return

      try {
        const resp = await fetch(`/api/group-chat/current?userId=${sessionUserId}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })

        if (!resp.ok) {
          console.warn('[GroupChatTransition] current group chat lookup failed', resp.status)
          return
        }

        const payload = (await resp.json()) as { id: string | null; error?: string | null }
        if (!payload.id || payload.error) {
          console.log('[GroupChatTransition] no current group chat for user', payload)
          return
        }

        const targetPath = `/dashboard/chat/${payload.id}`

        // If already on that chat, just refresh data.
        if (pathname === targetPath) {
          router.refresh()
        } else {
          router.push(targetPath)
        }

        toast.dismiss('group-chat-transition')
        toast.success('You have been moved to your new group chat.', {
          id: 'group-chat-transition-complete',
          duration: 5_000,
        })
      } catch (error) {
        console.error('[GroupChatTransition] failed to resolve current group chat', error)
      }
    }

    globalChannel.bind('group_chat_transition_started', handleTransitionStarted)
    globalChannel.bind('group_chat_update', handleGroupChatUpdate)

    return () => {
      globalChannel.unbind('group_chat_transition_started', handleTransitionStarted)
      globalChannel.unbind('group_chat_update', handleGroupChatUpdate)
    }
  }, [sessionUserId, pathname, router])
}


