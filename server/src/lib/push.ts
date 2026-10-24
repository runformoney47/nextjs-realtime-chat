import { db } from './db'
import { fetchRedis } from '@/helpers/redis'

export type PushMessage = {
  to: string
  title?: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  channelId?: string
}

export async function getUserDeviceTokens(userId: string): Promise<string[]> {
  const tokensRaw = (await fetchRedis('smembers', `user:${userId}:device_tokens`)) as string[] | null
  if (!tokensRaw || tokensRaw.length === 0) {
    return []
  }

  const tokens: string[] = []
  for (const raw of tokensRaw) {
    try {
      const parsed = JSON.parse(raw) as { token?: string }
      if (parsed.token) {
        tokens.push(parsed.token)
      } else if (typeof raw === 'string' && raw.startsWith('ExponentPushToken')) {
        tokens.push(raw)
      }
    } catch {
      if (typeof raw === 'string' && raw.startsWith('ExponentPushToken')) {
        tokens.push(raw)
      }
    }
  }
  return tokens
}

export async function sendPushToUser(
  userId: string,
  message: Omit<PushMessage, 'to'>,
): Promise<void> {
  const tokens = await getUserDeviceTokens(userId)
  if (tokens.length === 0) {
    return
  }
  await sendPushes(tokens, message)
}

export async function sendPushes(
  tokens: string[],
  message: Omit<PushMessage, 'to'>,
): Promise<void> {
  if (tokens.length === 0) {
    return
  }

  const messages: PushMessage[] = tokens.map((token) => ({
    to: token,
    sound: message.sound ?? 'default',
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    badge: message.badge,
    channelId: message.channelId,
  }))

  try {
    // Expo push API accepts up to 100 messages per request
    const chunks: PushMessage[][] = []
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100))
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          console.error('[push] Expo push send failed:', res.status, text)
        }
      }),
    )
  } catch (error) {
    console.error('[push] Error sending pushes:', error)
  }
}
