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

/** Resolve a user from their Apple `sub` claim (stable across sign-ins). */
export async function getUserByAppleSub(appleSub: string): Promise<AppUser | null> {
  const id = (await fetchRedis('get', `user:apple:${appleSub}`)) as string | null
  if (!id) return null
  return getUserById(id)
}

/** Link Apple `sub` → internal user id (call on every Apple login). */
export async function linkAppleSub(userId: string, appleSub: string): Promise<void> {
  await db.set(`user:apple:${appleSub}`, userId)
}

export async function getAllUserIds(): Promise<string[]> {
  return ((await fetchRedis('smembers', USERS_ALL_KEY)) as string[] | null) ?? []
}


