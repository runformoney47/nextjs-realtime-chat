// ─── Chat Colors ─────────────────────────────────────────────────────────────
// Each member of a group chat is assigned one of these colors (anonymous identity).

export const CHAT_COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet'] as const
export type ChatColor = (typeof CHAT_COLORS)[number]

export const CHAT_COLOR_HEX: Record<ChatColor, string> = {
  Green: '#4CAF50',
  Yellow: '#FFEB3B',
  Orange: '#FF9800',
  Red: '#F44336',
  Violet: '#9C27B0',
}

/** Colors where black text is more readable than white. */
export const LIGHT_COLORS: ChatColor[] = ['Green', 'Yellow']

// ─── Group Chat Config ───────────────────────────────────────────────────────

/** Number of members per group chat. */
export const GROUP_SIZE = 5

/** Smallest group we'll create when the pool doesn't divide evenly. */
export const MIN_GROUP_SIZE = 3

/** How many hours a group chat stays active. */
export const CHAT_WINDOW_HOURS = 72 // 3 days

/** Don't re-pair users who shared a chat in this many recent cycles. */
export const ANTI_REPEAT_CYCLES = 2

/** Drop schedule: days of the week (0 = Sunday, 3 = Wednesday, 6 = Saturday). */
export const DROP_DAYS = [3, 6] as const // Wednesday & Saturday

/** Default drop time (hour in 24h format, UTC for cron). */
export const DROP_HOUR = 21 // 9 PM

/** Conversation starters assigned to new group chats. */
export const ICEBREAKERS = [
  "What's something you've been obsessed with lately?",
  'If you could have dinner with anyone, alive or dead, who would it be?',
  "What's the most underrated thing in your life right now?",
  'Hot take time — drop your most controversial opinion 🔥',
  "What's a skill you wish you had but have never tried to learn?",
] as const

/** Vercel cron expression (UTC) matching DROP_DAYS / DROP_HOUR. */
export const DROP_CRON_EXPRESSION = `0 ${DROP_HOUR} * * ${DROP_DAYS.join(',')}`

// ─── Pusher Helpers ──────────────────────────────────────────────────────────

/**
 * Pusher channel names can't contain colons.
 * Convert Redis-style keys (chat:abc) → Pusher-safe (chat__abc).
 */
export function toPusherKey(key: string): string {
  return key.replace(/:/g, '__')
}

