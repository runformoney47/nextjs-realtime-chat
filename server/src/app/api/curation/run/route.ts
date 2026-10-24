import { runCuration } from '@/lib/curation'
import type { ApiResponse, CurationRunResult } from '@groupchat/shared'

/**
 * POST /api/curation/run
 *
 * DEV ONLY. Expires active chats and assigns new groups from curation:pool:active.
 */
export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json(
      { ok: false, error: 'Dev-only endpoint — use /api/curation/cron in production' } satisfies ApiResponse<never>,
      { status: 403 },
    )
  }

  try {
    const result = await runCuration({ expireExisting: true })
    return Response.json({
      ok: true,
      data: result,
    } satisfies ApiResponse<CurationRunResult>)
  } catch (error) {
    console.error('[curation/run] Error:', error)
    return Response.json(
      { ok: false, error: 'Curation failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
