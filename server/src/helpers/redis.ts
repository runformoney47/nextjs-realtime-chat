const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
const authToken = process.env.UPSTASH_REDIS_REST_TOKEN

type Command =
  | 'zrange'
  | 'sismember'
  | 'get'
  | 'smembers'
  | 'keys'
  | 'del'
  | 'sadd'
  | 'set'

/**
 * Direct REST calls to Upstash Redis.
 * Useful when the SDK's automatic JSON parsing gets in the way.
 */
export async function fetchRedis(
  command: Command,
  ...args: (string | number)[]
) {
  if (!upstashRedisRestUrl || !authToken) {
    throw new Error(
      'Missing Upstash Redis configuration. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    )
  }

  const encodedArgs = args.map((arg) => encodeURIComponent(String(arg)))
  const commandUrl = `${upstashRedisRestUrl}/${command}/${encodedArgs.join('/')}`

  const response = await fetch(commandUrl, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Redis command failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.result
}


