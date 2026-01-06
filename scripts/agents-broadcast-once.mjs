import './load-env.mjs'
import crypto from 'node:crypto'
import { llmChat } from './llm-openai.mjs'
import { styleForAgentId, buildSystemPrompt } from './agent-styles.mjs'

const BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.AGENT_API_SECRET || ''
const USE_LLM = (process.env.AGENT_USE_LLM || '').toLowerCase() === 'true'
const CONCURRENCY = Math.min(Math.max(Number(process.env.BROADCAST_CONCURRENCY || '5') || 5, 1), 25)

const headers = SECRET ? { 'x-agent-secret': SECRET } : {}

// 100 prompts, one per agent (0..99). For now, all placeholders:
export const AGENT_PROMPTS = Array.from({ length: 100 }, () => 'say a simple joke')

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

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function generateText({ userId, prompt, lastMessageText }) {
  if (!USE_LLM) return prompt
  const style = styleForAgentId(userId)
  const system = buildSystemPrompt({ userId, style })
  const user = `Instruction: ${prompt}\n${
    lastMessageText ? `Last message in the chat: "${lastMessageText}"\n` : ''
  }Return only the message text. Keep it to max ${style.policy.maxSentences} sentence${
    style.policy.maxSentences === 1 ? '' : 's'
  }.`
  return await llmChat({ system, user, temperature: 0.9, maxTokens: 80 })
}

async function sendOne(userId) {
  const state = await agentState(userId)
  const chatId = state.chatId
  if (!chatId || !String(chatId).startsWith('group_')) {
    return { userId, ok: false, reason: 'no current group chat' }
  }

  const prompt = AGENT_PROMPTS[Number(userId)] ?? 'say a simple joke'
  const content = await generateText({
    userId,
    prompt,
    lastMessageText: state.lastMessage?.text ?? '',
  })

  const text = `[broadcast agent ${userId}] ${content}`
  await agentSend(userId, chatId, text)
  return { userId, ok: true, chatId }
}

async function main() {
  const userIds = Array.from({ length: 100 }, (_, i) => String(i))

  console.log('[broadcast] base url:', BASE_URL)
  console.log('[broadcast] use llm:', USE_LLM)
  console.log('[broadcast] concurrency:', CONCURRENCY)

  const results = []
  for (const batch of chunk(userIds, CONCURRENCY)) {
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const r = await sendOne(id)
          console.log('[broadcast] sent', r)
          return r
        } catch (e) {
          console.error('[broadcast] failed user', id, e?.message || e)
          return { userId: id, ok: false, reason: e?.message || String(e) }
        }
      }),
    )
    results.push(...batchResults)
  }

  const okCount = results.filter((r) => r.ok).length
  console.log(`[broadcast] done. ok=${okCount}/${results.length}`)
}

main().catch((e) => {
  console.error('[broadcast] fatal', e)
  process.exit(1)
})


