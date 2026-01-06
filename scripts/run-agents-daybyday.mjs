import './load-env.mjs'
import crypto from 'node:crypto'
import { llmChat } from './llm-openai.mjs'
import { styleForAgentId, buildSystemPrompt } from './agent-styles.mjs'

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
const MSGS_PER_DAY = Number(process.env.MESSAGES_PER_DAY || '200')
const RANK_EVERY = Number(process.env.AGENT_RANK_EVERY || '25')
const USE_LLM = (process.env.AGENT_USE_LLM || '').toLowerCase() === 'true'

const headers = SECRET ? { 'x-agent-secret': SECRET } : {}

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

async function advanceDay(dayIndex = null) {
  const u = new URL('/api/agent/advance-day', BASE_URL)
  if (dayIndex !== null) u.searchParams.set('dayIndex', String(dayIndex))
  const res = await fetch(u, { method: 'POST', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`advanceDay failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function agentState(userId) {
  const u = new URL('/api/agent/state', BASE_URL)
  u.searchParams.set('userId', userId)
  const res = await fetch(u, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`state(${userId}) failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function agentMessages(userId, chatId, limit = 60) {
  const u = new URL('/api/agent/messages', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('limit', String(limit))
  const res = await fetch(u, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`messages(${userId}) failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function agentGetChatState(userId, chatId) {
  const u = new URL('/api/agent/agent-state', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  const res = await fetch(u, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`agent-state GET failed: ${res.status} ${JSON.stringify(json)}`)
  return json?.state ?? {}
}

async function agentPatchChatState(userId, chatId, patch) {
  const u = new URL('/api/agent/agent-state', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('patch', JSON.stringify(patch))
  const res = await fetch(u, { method: 'POST', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`agent-state POST failed: ${res.status} ${JSON.stringify(json)}`)
  return json?.state ?? {}
}

async function agentSend(userId, chatId, text) {
  const u = new URL('/api/agent/send', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('text', text)
  u.searchParams.set('id', crypto.randomUUID())
  const res = await fetch(u, { method: 'POST', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`send(${userId}) failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function agentRank(userId, chatId, members) {
  const others = members.filter((m) => m !== userId)
  const order = shuffled(others)
  const rankings = order.map((id, idx) => ({ userId: id, position: idx + 1 }))

  const u = new URL('/api/agent/rank', BASE_URL)
  u.searchParams.set('userId', userId)
  u.searchParams.set('chatId', chatId)
  u.searchParams.set('rankings', JSON.stringify(rankings))
  const res = await fetch(u, { method: 'POST', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`rank(${userId}) failed: ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function main() {
  const userIds = Array.from({ length: 100 }, (_, i) => String(i))

  console.log('[daybyday] base url:', BASE_URL)
  console.log('[daybyday] days:', DAYS)
  console.log('[daybyday] msgs/day:', MSGS_PER_DAY)
  console.log('[daybyday] use llm:', USE_LLM)

  for (let day = 0; day < DAYS; day++) {
    const adv = await advanceDay(day)
    console.log(`[daybyday] advanced to day ${adv.dayIndex}: ${adv.createdGroupChats.length} chats`)

    for (let i = 1; i <= MSGS_PER_DAY; i++) {
      const userId = pick(userIds)
      const state = await agentState(userId)
      const chatId = state.chatId
      const members = state.chat?.members ?? []

      if (!chatId || !String(chatId).startsWith('group_')) continue

      let content = `${pick(PHRASES)}`
      if (USE_LLM) {
        try {
          const style = styleForAgentId(userId)
          const system = buildSystemPrompt({ userId, style })
          const mode = chooseMode(style)

          // Read recent messages + unread since lastReadTs
          const agentChatState = await agentGetChatState(userId, chatId)
          const lastReadTs = typeof agentChatState.lastReadTs === 'number' ? agentChatState.lastReadTs : 0

          const msgResp = await agentMessages(userId, chatId, 60)
          const messages = msgResp.messages ?? []

          const newestTs = messages.length ? messages[messages.length - 1].timestamp : lastReadTs
          const unread = messages.filter(
            (m) => typeof m.timestamp === 'number' && m.timestamp > lastReadTs && m.senderId !== userId,
          )

          const transcript = formatTranscript(messages, 20)
          const target = unread.length ? unread[unread.length - 1] : null

          const instruction =
            mode === 'reply' && target
              ? `Reply to the most recent message from ${target.senderId}: "${target.text}".`
              : `Contribute to the ongoing group conversation.`

          const user = `Day ${day}. You are in a group chat.\n\nRecent transcript:\n${transcript}\n\nTask: ${instruction}\n\nOutput: ONE message, max ${style.policy.maxSentences} sentence${
            style.policy.maxSentences === 1 ? '' : 's'
          }.`
          content = await llmChat({ system, user, temperature: 0.8, maxTokens: 80 })

          // Persist what we have read (even if we don't reply to everything)
          await agentPatchChatState(userId, chatId, { lastReadTs: newestTs })
        } catch (e) {
          // If LLM fails, fall back to canned text so the sim keeps running.
          content = `${pick(PHRASES)}`
        }
      }

      const text = `[day ${day} agent ${userId}] ${content} (${i})`
      await agentSend(userId, chatId, text)

      if (RANK_EVERY > 0 && i % RANK_EVERY === 0 && Array.isArray(members) && members.length) {
        await agentRank(userId, chatId, members)
      }

      if (i % 50 === 0) {
        console.log(`[daybyday] day ${day} sent ${i}/${MSGS_PER_DAY}`)
      }
    }
  }

  console.log('[daybyday] done')
}

main().catch((e) => {
  console.error('[daybyday] failed', e)
  process.exit(1)
})


