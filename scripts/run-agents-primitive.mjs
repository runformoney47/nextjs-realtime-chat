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
const TOTAL_MESSAGES = Number(process.env.AGENT_MESSAGES || '200')
const RANK_EVERY = Number(process.env.AGENT_RANK_EVERY || '25') // every N messages, submit random rankings
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

async function agentState(userId) {
  const u = new URL('/api/agent/state', BASE_URL)
  u.searchParams.set('userId', userId)
  const res = await fetch(u, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`state(${userId}) failed: ${res.status} ${JSON.stringify(json)}`)
  return json
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

  console.log('[agents] base url:', BASE_URL)
  console.log('[agents] total messages:', TOTAL_MESSAGES)
  console.log('[agents] rank every:', RANK_EVERY)
  console.log('[agents] use llm:', USE_LLM)

  for (let i = 1; i <= TOTAL_MESSAGES; i++) {
    const userId = pick(userIds)
    const state = await agentState(userId)
    const chatId = state.chatId
    const members = state.chat?.members ?? []

    if (!chatId || !String(chatId).startsWith('group_')) continue

    let content = `${pick(PHRASES)}`
    if (USE_LLM) {
      try {
        const last = state.lastMessage?.text ? `Last message: "${state.lastMessage.text}"\n` : ''
        const style = styleForAgentId(userId)
        const system = buildSystemPrompt({ userId, style })
        const user = `You are in a group conversation.\n${last}\nWrite ONE short message (max ${style.policy.maxSentences} sentence${
          style.policy.maxSentences === 1 ? '' : 's'
        }). Contribute naturally.`
        content = await llmChat({ system, user, temperature: 0.8, maxTokens: 80 })
      } catch {
        content = `${pick(PHRASES)}`
      }
    }

    const text = `[agent ${userId}] ${content} (${i})`
    await agentSend(userId, chatId, text)

    if (RANK_EVERY > 0 && i % RANK_EVERY === 0 && Array.isArray(members) && members.length) {
      await agentRank(userId, chatId, members)
      console.log(`[agents] #${i}: user ${userId} sent + ranked in ${chatId}`)
    } else if (i % 10 === 0) {
      console.log(`[agents] #${i}: user ${userId} sent in ${chatId}`)
    }
  }

  console.log('[agents] done')
}

main().catch((e) => {
  console.error('[agents] failed', e)
  process.exit(1)
})


