const BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.AGENT_API_SECRET || ''

const dayIndexArg = process.argv.find((a) => a.startsWith('--day='))
const dayIndex = dayIndexArg ? Number(dayIndexArg.split('=')[1]) : null

const headers = SECRET ? { 'x-agent-secret': SECRET } : {}

async function main() {
  const u = new URL('/api/agent/advance-day', BASE_URL)
  if (dayIndex !== null) u.searchParams.set('dayIndex', String(dayIndex))

  const res = await fetch(u, { method: 'POST', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`advance-day failed: ${res.status} ${JSON.stringify(json)}`)
  }

  console.log(JSON.stringify(json, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


