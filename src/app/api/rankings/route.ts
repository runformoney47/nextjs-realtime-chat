// Legacy /api/rankings route is no longer used; POST is handled by
// /api/rankings/[chatId]. This file is kept as a placeholder to
// avoid accidental usage.

export async function GET() {
  return new Response('Not Found', { status: 404 })
}

export async function POST() {
  return new Response('Not Found', { status: 404 })
}