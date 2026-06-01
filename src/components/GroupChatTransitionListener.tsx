'use client'

import { useGroupChatTransitionListener } from '@/hooks/useGroupChatTransitionListener'

interface Props {
  sessionUserId: string
}

/**
 * Thin client wrapper that mounts the global group chat transition
 * listener once for the dashboard. This keeps all Pusher transition
 * logic in a single place instead of scattering it across components.
 */
export default function GroupChatTransitionListener({ sessionUserId }: Props) {
  useGroupChatTransitionListener({ sessionUserId })
  return null
}


