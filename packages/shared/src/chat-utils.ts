import type { GroupChat } from './types'

/**
 * Whether the chat accepts new messages (server enforces the same rules).
 * Time-based expiry without `active: false` is treated as ended for UX.
 */
export function isChatWritable(chat: GroupChat, now = Date.now()): boolean {
  return chat.active === true && now < chat.expiresAt
}

/** Inverse of {@link isChatWritable} — drives read-only UI. */
export function isChatEnded(chat: GroupChat, now = Date.now()): boolean {
  return !isChatWritable(chat, now)
}

/**
 * Human-readable expiry line for headers and list cards.
 * Examples: "Ends in 5h", "Ends tomorrow", "Ended"
 */
export function formatChatExpiry(
  chat: Pick<GroupChat, 'expiresAt' | 'active'>,
  now = Date.now(),
): string {
  if (!chat.active || now >= chat.expiresAt) {
    return 'Ended'
  }

  const ms = chat.expiresAt - now
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  if (hours >= 48) {
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
    return days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`
  }
  if (hours >= 1) {
    return `Ends in ${hours}h`
  }
  if (minutes >= 1) {
    return `Ends in ${minutes}m`
  }
  return 'Ending soon'
}
