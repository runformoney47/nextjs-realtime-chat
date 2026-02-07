import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isLocalDevRequest(req: Request) {
  const url = new URL(req.url)
  return (
    process.env.NODE_ENV === 'development' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

function assertAgentAccess(req: Request) {
  if (process.env.AGENT_MODE !== 'true') {
    return { ok: false as const, res: NextResponse.json({ error: 'Not Found' }, { status: 404 }) }
  }

  const secret = process.env.AGENT_API_SECRET
  const provided = req.headers.get('x-agent-secret') ?? ''
  const isLocal = isLocalDevRequest(req)

  if (!isLocal || secret) {
    if (!secret) {
      return {
        ok: false as const,
        res: NextResponse.json({ error: 'Missing AGENT_API_SECRET' }, { status: 500 }),
      }
    }
    if (provided !== secret) {
      return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
  }

  return { ok: true as const }
}

type AgentChatState = {
  lastReadTs?: number
  messagesSentToday?: number
  updatedAt?: number
}

function key(userId: string, chatId: string) {
  return `agent_state:user:${userId}:chat:${chatId}`
}

/**
 * GET /api/agent/agent-state?userId=...&chatId=...
 */
export async function GET(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    if (!userId || !chatId) {
      return NextResponse.json({ error: 'userId and chatId are required' }, { status: 400 })
    }

    const raw = await db.get(key(userId, chatId))
    const state =
      typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw) as AgentChatState
            } catch {
              return {}
            }
          })()
        : (raw as AgentChatState | null) ?? {}

    return NextResponse.json({ userId, chatId, state }, { status: 200 })
  } catch (error) {
    console.error('[Agent][AgentState][GET] Failed', error)
    return NextResponse.json({ error: 'Failed to load agent state' }, { status: 500 })
  }
}

/**
 * POST /api/agent/agent-state?userId=...&chatId=...&patch=<json>
 * patch merges into existing state.
 */
export async function POST(req: Request) {
  try {
    const gate = assertAgentAccess(req)
    if (!gate.ok) return gate.res

    const url = new URL(req.url)
    const userId = url.searchParams.get('userId') ?? ''
    const chatId = url.searchParams.get('chatId') ?? ''
    const patchRaw = url.searchParams.get('patch') ?? ''

    if (!userId || !chatId) {
      return NextResponse.json({ error: 'userId and chatId are required' }, { status: 400 })
    }
    if (!patchRaw) {
      return NextResponse.json({ error: 'patch is required' }, { status: 400 })
    }

    let patch: AgentChatState
    try {
      patch = JSON.parse(patchRaw) as AgentChatState
    } catch {
      return NextResponse.json({ error: 'Invalid patch JSON' }, { status: 400 })
    }

    const existingRaw = await db.get(key(userId, chatId))
    const existing =
      typeof existingRaw === 'string'
        ? (() => {
            try {
              return JSON.parse(existingRaw) as AgentChatState
            } catch {
              return {}
            }
          })()
        : (existingRaw as AgentChatState | null) ?? {}

    const next: AgentChatState = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    }

    await db.set(key(userId, chatId), JSON.stringify(next))

    return NextResponse.json({ ok: true, userId, chatId, state: next }, { status: 200 })
  } catch (error) {
    console.error('[Agent][AgentState][POST] Failed', error)
    return NextResponse.json({ error: 'Failed to update agent state' }, { status: 500 })
  }
}




