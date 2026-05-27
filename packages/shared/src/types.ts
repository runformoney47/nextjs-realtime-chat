// ─── User ────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string
  name: string
  email: string
  image: string
  createdAt: string
  lastActive: string
  isOnline: boolean
  timezone?: string
}

/** Lightweight user reference used in chat contexts. */
export interface UserRef {
  id: string
  name: string
  image: string
}

// ─── Profile / Onboarding ────────────────────────────────────────────────────

export interface UserProfile {
  userId: string
  /** Free-form interests selected during onboarding. */
  interests: string[]
  /** Communication style tag (e.g. "listener", "debater", "joker"). */
  commStyle: string
  /** Raw quiz answers for the curation algorithm. */
  quizAnswers: Record<string, unknown>
  completedAt: string
}

// ─── Group Chat ──────────────────────────────────────────────────────────────

export interface GroupChat {
  id: string
  members: string[]
  /** Color assignments: userId → color name. */
  memberColors: Record<string, string>
  createdAt: number
  /** When this chat window closes. */
  expiresAt: number
  /** Whether the chat is still accepting messages. */
  active: boolean
  /** Icebreaker prompt shown at the top of the chat. */
  icebreaker: string | null
}

// ─── Message ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  senderId: string
  text: string
  timestamp: number
}

// ─── Rankings / Vibes ────────────────────────────────────────────────────────

export interface ChatRanking {
  userId: string
  chatId: string
  /** Ordered list of other member IDs, most-want-to-chat-again first. */
  ranking: string[]
  submittedAt: number
}

// ─── Push Notifications ──────────────────────────────────────────────────────

export interface DeviceToken {
  userId: string
  token: string
  platform: 'ios' | 'android'
  createdAt: string
}

// ─── API Response Envelopes ──────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  /** User ID in our system. */
  sub: string
  email: string
  name: string
  iat: number
  exp: number
}

export interface LoginResponse {
  token: string
  user: AppUser
}


