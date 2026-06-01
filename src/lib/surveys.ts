import { db } from './db'
import { fetchRedis } from '@/helpers/redis'
import { nanoid } from 'nanoid'

export interface SurveyResponse {
  responseId: string
  userId: string
  chatId?: string | null
  studyId?: string | null
  sessionId?: string | null
  surveyId: string
  surveyVersion: number
  timepoint?: string | null
  createdAt: number
  answers: unknown
}

export interface SaveSurveyResponseInput {
  userId: string
  chatId?: string | null
  studyId?: string | null
  sessionId?: string | null
  surveyId: string
  surveyVersion: number
  timepoint?: string | null
  answers: unknown
}

const ALL_RESPONSES_KEY = 'survey:responses:all'

// A single "ranking transition" event: one user changing their ranking
// for a particular chat at a specific time.
export interface RankingTransitionInput {
  userId: string
  chatId: string
  studyId?: string | null
  sessionId?: string | null
  before: string[] // previous ordering of userIds
  after: string[]  // new ordering of userIds
}

// A snapshot of a user's ranking at the time of a groupchat transition.
export interface TransitionRankingInput {
  userId: string
  chatId: string
  studyId?: string | null
  sessionId: string
  ranking: { userId: string; position: number }[]
  transitionTimestamp: number
}

export interface PeerRatings1to10Input {
  userId: string
  chatId: string
  studyId?: string | null
  sessionId?: string | null
  /**
   * Ratings of *other* users in the groupchat on a 1-10 scale.
   * `targetUserId` must not equal `userId`.
   */
  ratings: { targetUserId: string; rating: number }[]
  timepoint?: string | null
}

export interface PeerRatingZScoreRecord {
  targetUserId: string
  rawRating: number
  zScore: number
}

export interface PeerRatingsZScoreStats {
  n: number
  mean: number
  stdDev: number
  stdDevType: 'population'
}

export function computePeerRatingsZScores(
  ratings: { targetUserId: string; rating: number }[],
): { stats: PeerRatingsZScoreStats; zScored: PeerRatingZScoreRecord[] } {
  const n = ratings.length
  const mean = n === 0 ? 0 : ratings.reduce((sum, r) => sum + r.rating, 0) / n
  const variance =
    n === 0
      ? 0
      : ratings.reduce((sum, r) => {
          const d = r.rating - mean
          return sum + d * d
        }, 0) / n
  const stdDev = Math.sqrt(variance)

  const zScored: PeerRatingZScoreRecord[] = ratings.map((r) => ({
    targetUserId: r.targetUserId,
    rawRating: r.rating,
    zScore: stdDev > 0 ? (r.rating - mean) / stdDev : 0,
  }))

  return {
    stats: { n, mean, stdDev, stdDevType: 'population' },
    zScored,
  }
}

/**
 * Persist a survey response as an immutable record and update
 * useful indexes for later querying/export.
 */
export async function saveSurveyResponse(
  input: SaveSurveyResponseInput,
): Promise<SurveyResponse> {
  const responseId = nanoid()
  const createdAt = Date.now()

  const response: SurveyResponse = {
    responseId,
    userId: input.userId,
    chatId: input.chatId ?? null,
    studyId: input.studyId ?? null,
    sessionId: input.sessionId ?? null,
    surveyId: input.surveyId,
    surveyVersion: input.surveyVersion,
    timepoint: input.timepoint ?? null,
    createdAt,
    answers: input.answers,
  }

  const tasks: Promise<unknown>[] = []

  if (process.env.NODE_ENV === 'development') {
    console.log('[Surveys] saveSurveyResponse', {
      responseId,
      surveyId: response.surveyId,
      userId: response.userId,
      chatId: response.chatId,
    })
  }

  // Primary document
  tasks.push(
    db.set(`survey:response:${responseId}`, JSON.stringify(response)),
    // Track in "all responses" index for export
    db.sadd(ALL_RESPONSES_KEY, responseId),
    // User index
    db.sadd(`survey:index:user:${response.userId}`, responseId),
    // Survey type index
    db.sadd(`survey:index:survey:${response.surveyId}`, responseId),
  )

  if (response.chatId) {
    tasks.push(db.sadd(`survey:index:chat:${response.chatId}`, responseId))
  }

  if (response.studyId) {
    tasks.push(db.sadd(`survey:index:study:${response.studyId}`, responseId))
  }

  if (response.sessionId) {
    tasks.push(db.sadd(`survey:index:session:${response.sessionId}`, responseId))
  }

  // Pointer to "current" response for this survey/user
  tasks.push(db.set(`survey:current:${response.surveyId}:user:${response.userId}`, responseId))

  await Promise.all(tasks)

  return response
}

/**
 * Load all survey responses recorded in the system.
 * Intended primarily for admin export/analysis.
 */
export async function getAllSurveyResponses(): Promise<SurveyResponse[]> {
  // Use the same Redis client (`db`) for both writing and reading the index
  // to avoid any subtle mismatches between SDK and REST calls.
  const ids = ((await db.smembers(ALL_RESPONSES_KEY)) as string[]) ?? []

  if (process.env.NODE_ENV === 'development') {
    console.log('[Surveys] getAllSurveyResponses index size', ids.length)
  }

  if (ids.length === 0) return []

  const responses: SurveyResponse[] = []

  for (const id of ids) {
    try {
      const raw = await db.get(`survey:response:${id}`)
      if (!raw) continue

      let parsed: SurveyResponse | null = null

      // Newer records: we explicitly stored JSON strings
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw) as SurveyResponse
        } catch (error) {
          console.error('[Surveys] Failed to JSON.parse string response', { id, error })
        }
      } else if (typeof raw === 'object') {
        // Older records: Upstash client may have already deserialized to an object
        parsed = raw as SurveyResponse
      }

      if (parsed) {
        responses.push(parsed)
      }
    } catch (error) {
      console.error('[Surveys] Failed to parse response', { id, error })
    }
  }

  return responses
}

/**
 * Convenience helper to record a "ranking transition" as a SurveyResponse.
 * This uses surveyId = "ranking-transition" and stores before/after arrays
 * in the answers field.
 */
export async function saveRankingTransition(
  input: RankingTransitionInput,
): Promise<SurveyResponse> {
  return saveSurveyResponse({
    userId: input.userId,
    chatId: input.chatId,
    studyId: input.studyId ?? null,
    sessionId: input.sessionId ?? null,
    surveyId: 'ranking-transition',
    surveyVersion: 1,
    timepoint: 'in-session',
    answers: {
      before: input.before,
      after: input.after,
    },
  })
}

/**
 * Convenience helper to record a "transition ranking" snapshot as a SurveyResponse.
 * This uses surveyId = "transition-ranking" and stores the final ranking array
 * in the answers field.
 */
export async function saveTransitionRanking(
  input: TransitionRankingInput,
): Promise<SurveyResponse> {
  return saveSurveyResponse({
    userId: input.userId,
    chatId: input.chatId,
    studyId: input.studyId ?? null,
    sessionId: input.sessionId,
    surveyId: 'transition-ranking',
    surveyVersion: 1,
    timepoint: 'transition',
    answers: {
      ranking: input.ranking,
      transitionTimestamp: input.transitionTimestamp,
    },
  })
}

/**
 * Record a 1-10 peer rating survey as a SurveyResponse, storing each target's
 * rating as a z-score normalized within the current rater's distribution.
 *
 * surveyId = "peer-rating-zscore"
 */
export async function savePeerRatingsZScore(
  input: PeerRatings1to10Input,
): Promise<SurveyResponse> {
  const { stats, zScored } = computePeerRatingsZScores(input.ratings)

  return saveSurveyResponse({
    userId: input.userId,
    chatId: input.chatId,
    studyId: input.studyId ?? null,
    sessionId: input.sessionId ?? null,
    surveyId: 'peer-rating-zscore',
    surveyVersion: 1,
    timepoint: input.timepoint ?? 'in-session',
    answers: {
      scale: { min: 1, max: 10 },
      stats,
      ratings: zScored,
    },
  })
}


