import { db } from './db'
import { fetchRedis } from '@/helpers/redis'
import type { AppUser } from '@groupchat/shared'

const USERS_ALL_KEY = 'users:all'

function nowIso() {
  return new Date().toISOString()
}

/**
 * Create or update a user in Redis.
 */
export async function upsertUser(
  partial: Partial<AppUser> & Pick<AppUser, 'id'>,
): Promise<AppUser> {
  const user: AppUser = {
    id: partial.id,
    name: partial.name ?? '',
    email: partial.email ?? '',
    image: partial.image ?? '',
    createdAt: partial.createdAt ?? nowIso(),
    lastActive: partial.lastActive ?? nowIso(),
    isOnline: partial.isOnline ?? true,
    timezone: partial.timezone,
  }

  await Promise.all([
    db.set(`user:${user.id}`, JSON.stringify(user)),
    db.sadd(USERS_ALL_KEY, user.id),
    user.email ? db.set(`user:email:${user.email}`, user.id) : Promise.resolve(),
  ])

  return user
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const raw = (await fetchRedis('get', `user:${id}`)) as string | null
  if (!raw) return null
  try {
    return JSON.parse(raw) as AppUser
  } catch {
    return null
  }
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const id = (await fetchRedis('get', `user:email:${email}`)) as string | null
  if (!id) return null
  return getUserById(id)
}

export async function getAllUserIds(): Promise<string[]> {
  return ((await fetchRedis('smembers', USERS_ALL_KEY)) as string[] | null) ?? []
}


