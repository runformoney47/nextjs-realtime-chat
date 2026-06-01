const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
const authToken = process.env.UPSTASH_REDIS_REST_TOKEN

type Command = 'zrange' | 'sismember' | 'get' | 'smembers' | 'keys' | 'del' | 'sadd' | 'set'

export async function fetchRedis(
  command: Command,
  ...args: (string | number)[]
) {
  if (!upstashRedisRestUrl || !authToken) {
    throw new Error(
      'Missing Upstash Redis configuration. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    )
  }

  // Encode all arguments to make sure special characters in keys
  // (colons, asterisks, spaces, etc.) never break the REST URL.
  const encodedArgs = args.map((arg) => encodeURIComponent(String(arg)))
  const commandUrl = `${upstashRedisRestUrl}/${command}/${encodedArgs.join('/')}`

  const response = await fetch(commandUrl, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    // These calls are used for live chat state, so we always bypass any caches.
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Error executing Redis command: ${response.statusText}`)
  }

  const data = await response.json()
  return data.result
}
