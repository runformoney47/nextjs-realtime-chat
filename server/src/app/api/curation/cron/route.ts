import { runCuration } from '@/lib/curation'
import type { ApiResponse, CurationRunResult } from '@groupchat/shared'

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const headerSecret = req.headers.get('x-cron-secret')

  if (process.env.NODE_ENV !== 'production') {
    if (!secret) return true
    return authHeader === `Bearer ${secret}` || headerSecret === secret
  }

  if (!secret) return false
  return authHeader === `Bearer ${secret}` || headerSecret === secret
}

async function handleCron(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  try {
    const result = await runCuration({ expireExisting: true })
    return Response.json({
      ok: true,
      data: result,
    } satisfies ApiResponse<CurationRunResult>)
  } catch (error) {
    console.error('[curation/cron] Error:', error)
    return Response.json(
      { ok: false, error: 'Curation cron failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}

/** Vercel Cron sends GET. */
export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}
