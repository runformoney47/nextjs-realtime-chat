import { z } from 'zod'

// ─── Messages ────────────────────────────────────────────────────────────────

export const messageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  text: z.string().min(1).max(5000),
  timestamp: z.number(),
})

export const messageArraySchema = z.array(messageSchema)

export type MessageInput = z.infer<typeof messageSchema>

// ─── Send Message (client → server) ─────────────────────────────────────────

export const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1).max(5000),
  /** Optional client-generated ID for optimistic updates. */
  clientId: z.string().optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>

// ─── Onboarding Quiz ────────────────────────────────────────────────────────

export const onboardingQuizSchema = z.object({
  interests: z.array(z.string()).min(1).max(10),
  commStyle: z.enum(['listener', 'debater', 'joker', 'storyteller', 'supporter']),
  ageRange: z.enum(['18-22', '23-27', '28-34', '35+']),
  chatGoal: z.enum(['meet-people', 'deep-convos', 'just-vibes', 'debate-ideas']),
})

export type OnboardingQuizInput = z.infer<typeof onboardingQuizSchema>

// ─── Chat Ranking (end-of-chat vibe check) ──────────────────────────────────

export const chatRankingSchema = z.object({
  chatId: z.string().min(1),
  /** Ordered list of member IDs the user wants to chat with again. */
  ranking: z.array(z.string()).min(1),
})

export type ChatRankingInput = z.infer<typeof chatRankingSchema>

// ─── Device Token Registration ───────────────────────────────────────────────

export const deviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
})

export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>


