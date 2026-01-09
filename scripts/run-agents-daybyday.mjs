import './load-env.mjs'
import crypto from 'node:crypto'
import { llmChat } from './llm-openai.mjs'
import { styleForAgentId, buildSystemPrompt } from './agent-styles.mjs'
import { generateBurstyDayPlan, peakBinFromPeakHour } from './circadian-plan.mjs'

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffled(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.AGENT_API_SECRET || ''
const DAYS = Number(process.env.SIM_DAYS || '1')
const BINS = Number(process.env.SIM_BINS || '48')
const MSGS_PER_AGENT_PER_DAY = Number(process.env.MESSAGES_PER_AGENT_PER_DAY || '20')
const RANK_EVERY = Number(process.env.AGENT_RANK_EVERY || '25')
const USE_LLM = (process.env.AGENT_USE_LLM || '').toLowerCase() === 'true'
const STRICT_LLM = (process.env.AGENT_STRICT_LLM || '').toLowerCase() === 'true'
const LLM_DEBUG = (process.env.AGENT_LLM_DEBUG || '').toLowerCase() === 'true'
const COMPAT_RANK_LLM = (process.env.AGENT_COMPAT_RANK_LLM || '').toLowerCase() === 'true'
const COMPAT_RANK_EVERY = Number(process.env.AGENT_COMPAT_RANK_EVERY || '0')
const LOG_VERBOSE = (process.env.AGENT_LOG_VERBOSE || 'true').toLowerCase() === 'true'
const STRICT_RANKINGS = (process.env.AGENT_STRICT_RANKINGS || '').toLowerCase() === 'true'

const headers = SECRET ? { 'x-agent-secret': SECRET } : {}

async function readJsonOrText(res) {
  const raw = await res.text()
  try {
    return { raw, json: JSON.parse(raw) }
  } catch {
    return { raw, json: null }
  }
}

function fmt(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v)
}

function rankingOrderString(rankings) {
  try {
    return rankings
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((r) => r.userId)
      .join(' > ')
  } catch {
    return ''
  }
}

function scoresStringFromOpinions(opinions) {
  try {
    return Object.entries(opinions || {})
      .map(([id, v]) => `${id}:${fmt(v?.interest_overlap ?? 0)}`)
      .join(', ')
  } catch {
    return ''
  }
}

const PHRASES = [
  'hey',
  'what’s up',
  'lol',
  'that’s interesting',
  'I agree',
  'I’m not sure about that',
  'tell me more',
  'good point',
  'brb',
  'nice',
  'same',
]

function chooseMode(style) {
  const r = Math.random()
  const pReply = style?.policy?.modeMix?.reply ?? 0.7
  return r < pReply ? 'reply' : 'contribute'
}

function formatTranscript(messages, maxLines = 20) {
  const slice = messages.slice(-maxLines)
  return slice
    .map((m) => {
      const t = typeof m.timestamp === 'number' ? new Date(m.timestamp).toISOString() : ''
      return `[${t}] ${m.senderId}: ${m.text}`
    })
    .join('\n')
}

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','so','to','of','in','on','for','with','as','at','by','from',
  'is','are','was','were','be','been','being','it','this','that','these','those','i','you','we','they','me','my','your',
  'our','their','them','he','she','his','her','him','what','why','how','when','where','who','whom','which',
  'just','like','lol','ok','okay','yeah','yep','nope','brb','nice','same'
])

function extractKeywords(text, max = 8) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))

  const freq = new Map()
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1)
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w)
}

function isActiveParticipant({ output, targetText }) {
  const out = String(output || '').toLowerCase()
  if (!out.trim()) return false
  // Pass if it asks a question
  if (out.includes('?')) return true
  // Or if it references a concrete keyword from the target message
  const keys = extractKeywords(targetText || '', 10)
  return keys.some((k) => out.includes(k))
}

async function advanceDay(dayIndex = null) {
  const u = new URL('/api/agent/advance-day', BASE_URL)
  if (dayIndex !== null) u.searchParams.set('dayIndex', String(dayIndex))
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`advanceDay failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentState(userId) {
  const u = new URL('/api/agent/state', BASE_URL)
  u.searchParams.set('userId', userId)
  const res = await fetch(u, { headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`state(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentMessages(userId, chatId, limit = 60) {
  const u = new URL('/api/agent/messages', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('limit', String(limit))
  const res = await fetch(u, { headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`messages(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentGetChatState(userId, chatId) {
  const u = new URL('/api/agent/agent-state', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  const res = await fetch(u, { headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`agent-state GET failed: ${res.status} ${raw.slice(0, 500)}`)
  return json?.state ?? {}
}

async function agentPatchChatState(userId, chatId, patch) {
  const u = new URL('/api/agent/agent-state', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('patch', JSON.stringify(patch))
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`agent-state POST failed: ${res.status} ${raw.slice(0, 500)}`)
  return json?.state ?? {}
}

async function agentSend(userId, chatId, text) {
  const u = new URL('/api/agent/send', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('text', text)
  u.searchParams.set('id', crypto.randomUUID())
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`send(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentRankRandom(userId, chatId, members) {
  const others = members.filter((m) => m !== userId)
  const order = shuffled(others)
  const rankings = order.map((id, idx) => ({ userId: id, position: idx + 1 }))

  const u = new URL('/api/agent/rank', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('rankings', JSON.stringify(rankings))
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`rank(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentRankSubmit(userId, chatId, rankings) {
  const u = new URL('/api/agent/rank', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('rankings', JSON.stringify(rankings))
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`rank(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

async function agentRankSubmitTyped(userId, chatId, rankings, type) {
  const u = new URL('/api/agent/rank', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('rankings', JSON.stringify(rankings))
  u.searchParams.set('type', type)
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`rank(${userId})[${type}] failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

function extractJsonArray(text) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(slice)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateRankings({ userId, members, rankings }) {
  const others = members.filter((m) => m !== userId)
  const otherSet = new Set(others)
  if (!Array.isArray(rankings)) return null

  const cleaned = []
  for (const r of rankings) {
    if (!r || typeof r !== 'object') continue
    const uid = r.userId
    const pos = r.position
    if (typeof uid !== 'string' || typeof pos !== 'number') continue
    if (!otherSet.has(uid)) continue
    cleaned.push({ userId: uid, position: pos })
  }

  // Ensure all others appear exactly once; positions 1..N
  const seen = new Set(cleaned.map((r) => r.userId))
  if (seen.size !== others.length) return null

  const sorted = cleaned.slice().sort((a, b) => a.position - b.position)
  return sorted.map((r, idx) => ({ userId: r.userId, position: idx + 1 }))
}

function extractJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(slice)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function validateOpinions({ userId, members, opinions }) {
  if (!opinions || typeof opinions !== 'object') return null
  const others = members.filter((m) => m !== userId)
  const otherSet = new Set(others)
  const cleaned = {}

  for (const [k, v] of Object.entries(opinions)) {
    if (!otherSet.has(k)) continue
    // Support scalar or {interest_overlap} only.
    let interest_overlap = null
    if (typeof v === 'number' && Number.isFinite(v)) interest_overlap = v
    else if (v && typeof v === 'object' && typeof v.interest_overlap === 'number') interest_overlap = v.interest_overlap
    if (interest_overlap === null || !Number.isFinite(interest_overlap)) continue
    cleaned[k] = { interest_overlap: Math.max(-1, Math.min(1, interest_overlap)) }
  }

  // Require vectors for all other members
  if (Object.keys(cleaned).length !== others.length) return null
  return cleaned
}

async function agentSaveOpinions({ userId, chatId, dayIndex, opinions }) {
  const u = new URL('/api/agent/opinions', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('dayIndex', String(dayIndex))
  u.searchParams.set('opinions', JSON.stringify(opinions))
  const res = await fetch(u, { method: 'POST', headers })
  const { raw, json } = await readJsonOrText(res)
  if (!res.ok) throw new Error(`opinions(${userId}) failed: ${res.status} ${raw.slice(0, 500)}`)
  return json ?? {}
}

function computeInterestOverlap({ style, transcript, targetText }) {
  const interests = Array.isArray(style?.interests) ? style.interests : []
  const text = `${transcript || ''}\n${targetText || ''}`.toLowerCase()
  if (!interests.length) return 0
  const hits = interests.filter((kw) => text.includes(String(kw).toLowerCase())).length
  // Map [0..1] -> [-1..+1] with a mild baseline.
  const frac = hits / interests.length
  return Math.max(-1, Math.min(1, frac * 2 - 1))
}

function rankingFromOpinions({ userId, members, opinions }) {
  const others = members.filter((m) => m !== userId)
  const scored = others.map((id) => ({
    id,
    score: typeof opinions?.[id]?.interest_overlap === 'number' ? opinions[id].interest_overlap : 0,
  }))
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return scored.map((s, idx) => ({ userId: s.id, position: idx + 1 }))
}

function buildOpinionsFromMessages({ userId, members, style, messages }) {
  const opinions = {}
  const others = members.filter((m) => m !== userId)
  for (const otherId of others) {
    const otherText = (messages || [])
      .filter((m) => m?.senderId === otherId)
      .slice(-12)
      .map((m) => m?.text ?? '')
      .join('\n')
    const interest_overlap = computeInterestOverlap({ style, transcript: '', targetText: otherText })
    opinions[otherId] = { interest_overlap }
  }
  return opinions
}

async function llmCompatibilityRank({ userId, style, members, messages, day, bin }) {
  const others = members.filter((m) => m !== userId)
  const transcript = formatTranscript(messages ?? [], 40)
  const interests = Array.isArray(style?.interests) ? style.interests : []
  const system = buildSystemPrompt({ userId, style })
  const user = `You are ranking compatibility in a group chat.\n\nYour interests: ${interests.length ? interests.join(', ') : '(none provided)'}\n\nOther members (exclude yourself): ${others.join(
    ', ',
  )}\n\nRecent transcript:\n${transcript}\n\nTask:\nRank the other members from MOST compatible to LEAST compatible for YOU, based on shared interests, topics, and conversational fit.\n\nReturn STRICT JSON ONLY: an array like [{"userId":"<id>","position":1}, ...].\nRules:\n- Include EVERY other member exactly once.\n- position must be 1..N.\n- No extra text.`

  const out = await llmChat({ system, user, temperature: 0.2, maxTokens: 220 })
  const parsed = extractJsonArray(out)
  const validated = validateRankings({ userId, members, rankings: parsed })
  if (!validated) {
    throw new Error(`[compat-rank] invalid LLM output day=${day} bin=${bin}`)
  }
  return validated
}

async function main() {
  const userIds = Array.from({ length: 100 }, (_, i) => String(i))

  console.log('[daybyday] base url:', BASE_URL)
  console.log('[daybyday] days:', DAYS)
  console.log('[daybyday] bins/day:', BINS)
  console.log('[daybyday] msgs/agent/day:', MSGS_PER_AGENT_PER_DAY)
  console.log('[daybyday] use llm:', USE_LLM)
  console.log('[daybyday] strict llm:', STRICT_LLM)

  for (let day = 0; day < DAYS; day++) {
    const adv = await advanceDay(day)
    console.log(`[daybyday] advanced to day ${adv.dayIndex}: ${adv.createdGroupChats.length} chats`)

    // Build per-agent per-bin quotas (circadian curve that sums to exactly MSGS_PER_AGENT_PER_DAY).
    const planCountsByUser = new Map()
    for (const userId of userIds) {
      const style = styleForAgentId(userId)
      const peakBin = peakBinFromPeakHour({
        peakHourLocal: style.timing?.circadian?.peakHourLocal,
        bins: BINS,
      })
      // Across-bin burstiness: sessions span multiple bins (still totals exactly MSGS_PER_AGENT_PER_DAY).
      // We map the style timing into a mean session length in bins, clamped to at least 2 bins.
      const sessionLenMeanBins = Math.max(
        2,
        Math.round((style.timing?.burstiness?.sessionMeanMinutes ?? 12) / (24 * 60 / BINS)),
      )

      const plan = generateBurstyDayPlan({
        userId,
        dayIndex: day,
        bins: BINS,
        total: MSGS_PER_AGENT_PER_DAY,
        peakBin,
        sessionLenMeanBins,
      })
      planCountsByUser.set(userId, plan.counts)
    }

    let totalSent = 0
    let llmAttempts = 0
    let llmFailures = 0
    let llmFallbacks = 0

    // Execute bins sequentially; interleave required sends within each bin.
    for (let bin = 0; bin < BINS; bin++) {
      const events = []
      for (const userId of userIds) {
        const counts = planCountsByUser.get(userId)
        const k = counts ? counts[bin] : 0
        for (let j = 0; j < k; j++) events.push(userId)
      }

      if (!events.length) continue
      const shuffledEvents = shuffled(events)

      for (const userId of shuffledEvents) {
        const state = await agentState(userId)
        const chatId = state.chatId
        const members = state.chat?.members ?? []
        if (!chatId || !String(chatId).startsWith('group_')) continue

        let content = `${pick(PHRASES)}`
        let recentMessages = null
        let usedLLM = false
        let modeUsed = 'canned'
        let targetId = null
        if (USE_LLM) {
          try {
            llmAttempts += 1
            const style = styleForAgentId(userId)
            const system = buildSystemPrompt({ userId, style })
            const mode = chooseMode(style)
            modeUsed = mode

            const agentChatState = await agentGetChatState(userId, chatId)
            const lastReadTs =
              typeof agentChatState.lastReadTs === 'number' ? agentChatState.lastReadTs : 0

            const msgResp = await agentMessages(userId, chatId, 80)
            const messages = msgResp.messages ?? []
            recentMessages = messages

            const newestTs = messages.length ? messages[messages.length - 1].timestamp : lastReadTs
            const unread = messages.filter(
              (m) =>
                typeof m.timestamp === 'number' &&
                m.timestamp > lastReadTs &&
                m.senderId !== userId,
            )

            const transcript = formatTranscript(messages, 25)
            const target = unread.length ? unread[unread.length - 1] : null
            targetId = target?.senderId ?? null

            const instruction =
              mode === 'reply' && target
                ? `Reply to ${target.senderId}: "${target.text}".`
                : `Contribute to the group conversation.`

            const participationRule =
              'You MUST be an active participant: your message must EITHER (a) reference a specific concrete detail someone mentioned (a topic/claim/example) OR (b) ask a specific question about something that was said. No generic filler.'

            const user = `Day ${day}, bin ${bin}/${BINS - 1}.\n\nRecent transcript:\n${transcript}\n\nTask: ${instruction}\n\n${participationRule}\nOutput: ONE message, max ${style.policy.maxSentences} sentence${
              style.policy.maxSentences === 1 ? '' : 's'
            }.`

            content = await llmChat({ system, user, temperature: 0.75, maxTokens: 90 })
            usedLLM = true

            // Quality gate: ensure it references a detail or asks a question.
            const targetTextForCheck = target?.text ?? (unread.length ? unread[unread.length - 1]?.text : '')
            if (!isActiveParticipant({ output: content, targetText: targetTextForCheck })) {
              const repairUser = `${user}\n\nYour previous message was too generic. Revise it to clearly reference one concrete detail from the transcript or ask a specific question about it. Return ONLY the revised message.`
              content = await llmChat({ system, user: repairUser, temperature: 0.6, maxTokens: 90 })
              usedLLM = true
            }

            await agentPatchChatState(userId, chatId, { lastReadTs: newestTs })
          } catch (e) {
            llmFailures += 1
            llmFallbacks += 1
            if (LLM_DEBUG || llmFailures <= 5) {
              console.error('[daybyday][llm] failed; falling back to canned phrase', {
                day,
                bin,
                userId,
                chatId,
                error: e?.message ?? String(e),
              })
            }
            if (STRICT_LLM) {
              throw e
            }
            content = `${pick(PHRASES)}`
            usedLLM = false
            modeUsed = 'canned'
            targetId = null
          }
        }

        const text = `[day ${day} bin ${bin} agent ${userId}] ${content}`
        try {
          await agentSend(userId, chatId, text)
        } catch (e) {
          console.error('[daybyday][send] FAILED', {
            day,
            bin,
            userId,
            chatId,
            error: e?.message ?? String(e),
          })
          if (STRICT_RANKINGS) throw e
          continue
        }
        totalSent += 1
        if (LOG_VERBOSE) {
          console.log('[daybyday][send]', {
            day,
            bin,
            n: totalSent,
            userId,
            chatId,
            usedLLM,
            mode: modeUsed,
            targetId,
            preview: String(content || '').slice(0, 140),
          })
        }

        // Update opinions + rankings AFTER EVERY MESSAGE (for fast feedback).
        // This uses a simple interest keyword overlap heuristic so we don't rely on "human emotion" inference.
        if (Array.isArray(members) && members.length) {
          try {
            const style = styleForAgentId(userId)
            if (!recentMessages) {
              recentMessages = (await agentMessages(userId, chatId, 80)).messages ?? []
            }
            const opinions = buildOpinionsFromMessages({ userId, members, style, messages: recentMessages })
            const rankings = rankingFromOpinions({ userId, members, opinions })

            if (LOG_VERBOSE) {
              console.log('[daybyday][rank][heuristic][computed]', {
                day,
                bin,
                n: totalSent,
                userId,
                chatId,
                scores: scoresStringFromOpinions(opinions),
                order: rankingOrderString(rankings),
              })
            }

            await agentSaveOpinions({ userId, chatId, dayIndex: day, opinions })
            if (LOG_VERBOSE) {
              console.log('[daybyday][opinions][saved]', { day, bin, n: totalSent, userId, chatId })
            }

            await agentRankSubmit(userId, chatId, rankings)
            if (LOG_VERBOSE) {
              console.log('[daybyday][rank][heuristic][saved]', {
                day,
                bin,
                n: totalSent,
                userId,
                chatId,
                order: rankingOrderString(rankings),
              })
            }
          } catch (e) {
            console.error('[daybyday][rank][heuristic] FAILED', {
              day,
              bin,
              n: totalSent,
              userId,
              chatId,
              error: e?.message ?? String(e),
            })
            if (STRICT_RANKINGS) throw e
          }

          // Optional: LLM-based compatibility ranking stored separately (does not overwrite heuristic).
          // Note: this can be expensive; control with AGENT_COMPAT_RANK_EVERY (set 1 for every message).
          if (USE_LLM && COMPAT_RANK_LLM && COMPAT_RANK_EVERY > 0 && totalSent % COMPAT_RANK_EVERY === 0) {
            try {
              const compat = await llmCompatibilityRank({
                userId,
                style,
                members,
                messages: recentMessages,
                day,
                bin,
              })
              await agentRankSubmitTyped(userId, chatId, compat, 'compat_llm')
              if (LOG_VERBOSE) {
                console.log('[daybyday][rank][compat_llm][saved]', {
                  day,
                  bin,
                  n: totalSent,
                  userId,
                  chatId,
                  order: rankingOrderString(compat),
                })
              }
            } catch (e) {
              console.error('[daybyday][rank][compat_llm] FAILED', {
                day,
                bin,
                n: totalSent,
                userId,
                chatId,
                error: e?.message ?? String(e),
              })
              if (STRICT_RANKINGS) throw e
            }
          }
        }
      }

      if (bin % 8 === 0) {
        console.log(`[daybyday] day ${day} bin ${bin}: totalSent=${totalSent}`)
      }
    }

    // End-of-day ranking (cheap heuristic): recompute from interest_overlap only.
    for (const userId of userIds) {
      const state = await agentState(userId)
      const chatId = state.chatId
      const members = state.chat?.members ?? []
      if (!chatId || !String(chatId).startsWith('group_') || !Array.isArray(members) || members.length < 2) {
        continue
      }

      try {
        const style = styleForAgentId(userId)
        const msgResp = await agentMessages(userId, chatId, 120)
        const messages = msgResp.messages ?? []
        const opinions = buildOpinionsFromMessages({ userId, members, style, messages })
        await agentSaveOpinions({ userId, chatId, dayIndex: day, opinions })
        const rankings = rankingFromOpinions({ userId, members, opinions })
        await agentRankSubmit(userId, chatId, rankings)
      } catch {
        await agentRankRandom(userId, chatId, members)
      }
    }

    console.log('[daybyday] day summary', {
      day,
      totalSent,
      llmAttempts,
      llmFailures,
      llmFallbacks,
    })
  }

  console.log('[daybyday] done')
}

main().catch((e) => {
  console.error('[daybyday] failed', e)
  process.exit(1)
})


