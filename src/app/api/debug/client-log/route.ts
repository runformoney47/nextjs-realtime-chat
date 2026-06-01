import { NextResponse } from 'next/server'

const allowedLevels = ['log', 'info', 'warn', 'error', 'debug'] as const
type AllowedLevel = (typeof allowedLevels)[number]

type ClientLogBody = {
  level?: AllowedLevel
  message?: string
  payload?: unknown
}

export async function POST(req: Request) {
  try {
    // Avoid noisy logging in production – this is intended for local debugging only.
    if (process.env.NODE_ENV !== 'development') {
      return new NextResponse(null, { status: 204 })
    }

    // Be very defensive: if the body is missing or invalid JSON, just skip logging.
    let body: ClientLogBody = {}
    try {
      // Some browsers / callers may send an empty body or non‑JSON; we treat that
      // as "no payload" instead of throwing a 400 back to the client.
      if (req.headers.get('content-type')?.includes('application/json')) {
        body = ((await req.json()) as ClientLogBody) ?? {}
      }
    } catch {
      // Swallow JSON parse errors – logging should never break the UI.
      body = {}
    }

    const level = (body.level ?? 'log') as AllowedLevel
    const message = body.message ?? ''
    const payload = body.payload

    const method: AllowedLevel = allowedLevels.includes(level) ? level : 'log'
    const timestamp = new Date().toISOString()

    ;(console[method] as (...args: any[]) => void)(
      `[client-log][${timestamp}] ${message}`,
      payload ?? ''
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[client-log] Failed to handle client log', error)
    // Never surface logging failures as client errors.
    return new NextResponse(null, { status: 204 })
  }
}


