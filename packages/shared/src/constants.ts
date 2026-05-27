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

/** How many hours a group chat stays active. */
export const CHAT_WINDOW_HOURS = 72 // 3 days

/** Drop schedule: days of the week (0 = Sunday, 3 = Wednesday, 6 = Saturday). */
export const DROP_DAYS = [3, 6] as const // Wednesday & Saturday

/** Default drop time (hour in 24h format, user's local timezone). */
export const DROP_HOUR = 21 // 9 PM (night drops)

// ─── Pusher Helpers ──────────────────────────────────────────────────────────

/**
 * Pusher channel names can't contain colons.
 * Convert Redis-style keys (chat:abc) → Pusher-safe (chat__abc).
 */
export function toPusherKey(key: string): string {
  return key.replace(/:/g, '__')
}

