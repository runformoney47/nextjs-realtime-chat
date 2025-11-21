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

    const body = (await req.json()) as ClientLogBody
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
    return new NextResponse(null, { status: 400 })
  }
}


