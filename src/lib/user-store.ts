import { db } from './db'
import { fetchRedis } from '@/helpers/redis'

// Canonical application-level user representation stored in Redis
export interface AppUser {
  id: string
  name: string
  email: string
  image: string
  createdAt: string
  lastActive: string
  isOnline: boolean
  // Marker so we can distinguish temp/sim users from OAuth users when needed
  isSimUser?: boolean
}

const USERS_ALL_KEY = 'users:all'

function nowIso() {
  return new Date().toISOString()
}

/**
 * Upsert an AppUser into Redis:
 * - Writes user:<id> JSON
 * - Writes user:email:<email> -> <id> index
 * - Tracks id in users:all set for admin/stats usage
 */
export async function saveAppUser(
  partialUser: Partial<AppUser> & Pick<AppUser, 'id'>,
  context?: { source?: string },
): Promise<AppUser> {
  const createdAt = partialUser.createdAt ?? nowIso()
  const lastActive = partialUser.lastActive ?? nowIso()

  const user: AppUser = {
    id: partialUser.id,
    name: partialUser.name ?? '',
    email: partialUser.email ?? '',
    image: partialUser.image ?? '',
    createdAt,
    lastActive,
    isOnline: partialUser.isOnline ?? true,
    isSimUser: partialUser.isSimUser,
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[UserStore] upsert', {
      id: user.id,
      email: user.email,
      isSimUser: user.isSimUser ?? false,
      source: context?.source ?? 'unknown',
    })
  }

  const tasks: Promise<unknown>[] = [
    db.set(`user:${user.id}`, JSON.stringify(user)),
    db.sadd(USERS_ALL_KEY, user.id),
  ]

  if (user.email) {
    tasks.push(db.set(`user:email:${user.email}`, user.id))
  }

  await Promise.all(tasks)

  return user
}

export async function getAppUserById(id: string): Promise<AppUser | null> {
  const raw = (await fetchRedis('get', `user:${id}`)) as string | null
  if (!raw) return null

  try {
    return JSON.parse(raw) as AppUser
  } catch (error) {
    console.error('[UserStore] Failed to parse user by id', { id, raw })
    return null
  }
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  const id = (await fetchRedis('get', `user:email:${email}`)) as string | null
  if (!id) return null
  return getAppUserById(id)
}

export async function getAllAppUserIds(): Promise<string[]> {
  try {
    const ids = (await fetchRedis('smembers', USERS_ALL_KEY)) as string[] | null
    return ids ?? []
  } catch (error) {
    console.error('[UserStore] Failed to load all user ids', error)
    return []
  }
}


