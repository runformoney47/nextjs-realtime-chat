import { Redis } from '@upstash/redis'

// Simple utility script to dump (most of) the current Redis database contents
// to JSON. It is intended for development/debugging only.
//
// Usage:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//   node scripts/dump-redis.mjs > redis-dump.json
//
// The output format is:
//   {
//     "key:name": {
//       "type": "string" | "set" | "zset" | "hash" | "list" | ...,
//       "value": ...
//     },
//     ...
//   }

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

if (!url || !token) {
  console.error(
    'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment.',
  )
  process.exit(1)
}

const redis = new Redis({ url, token })

async function dumpRedis() {
  const output = {}

  // scanIterator yields keys lazily so we don't have to know how many exist
  for await (const key of redis.scanIterator()) {
    const type = await redis.type(key)

    let value
    switch (type) {
      case 'string':
        value = await redis.get(key)
        break
      case 'set':
        value = await redis.smembers(key)
        break
      case 'zset':
        // Include scores so message ordering/debugging is preserved
        value = await redis.zrange(key, 0, -1, { withScores: true })
        break
      case 'hash':
        value = await redis.hgetall(key)
        break
      case 'list':
        value = await redis.lrange(key, 0, -1)
        break
      default:
        // Fallback: just return the type, without attempting to decode
        value = null
        break
    }

    output[key] = { type, value }
  }

  // Pretty-print so it's easier for humans (and for you to diff / copy slices)
  process.stdout.write(JSON.stringify(output, null, 2))
}

dumpRedis().catch((error) => {
  console.error('Failed to dump Redis:', error)
  process.exit(1)
})



