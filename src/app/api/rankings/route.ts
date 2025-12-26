// Legacy /api/rankings route is no longer used; POST is handled by
// /api/rankings/[chatId]. This file is kept as a placeholder to
// avoid accidental usage.

export function GET() {
  return new Response(
    JSON.stringify({
      error: 'Deprecated endpoint. Use /api/rankings/[chatId].',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  )
}

export function POST() {
  return new Response(
    JSON.stringify({
      error: 'Deprecated endpoint. Use /api/rankings/[chatId].',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  )
}
