import { db } from '@/lib/db'
import { fetchRedis } from '@/helpers/redis'
import { addGroupChatId } from '@/lib/group-chats'
import { nanoid } from 'nanoid'
import { messageValidator } from '@/lib/validations/message'

type AppUserLike = { id: string; email?: string; isSimUser?: boolean }

export type Schedule = string[][][]

const ACTIVE_GROUP_CHATS_KEY = 'group_chats:active'
const CURRENT_DAY_KEY = 'schedule:current_day'
const EPOCH_LENGTH_KEY = 'schedule:epoch_length'

const COLORS = ['Green', 'Yellow', 'Orange', 'Red', 'Violet'] as const

function buildIntroText({ senderId, members }: { senderId: string; members: string[] }) {
  const otherCount = Math.max(0, members.length - 1)
  return `Hey everyone — I’m ${senderId}. Quick intros? What should we talk about today? (${otherCount} others here)`
}

function isSimUserRecord(user: Partial<AppUserLike> | null) {
  if (!user) return false
  if (user.isSimUser === true) return true
  if (typeof user.email === 'string' && user.email.endsWith('@example.com')) return true
  return false
}

async function getSimUserIds(): Promise<string[]> {
  const all = ((await fetchRedis('smembers', 'users:all')) as string[] | null) ?? []
  if (!all.length) return []

  const sim: string[] = []
  for (const id of all) {
    const raw = (await fetchRedis('get', `user:${id}`)) as string | null
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<AppUserLike>
      if (isSimUserRecord(parsed)) sim.push(id)
    } catch {
      // ignore malformed
    }
  }
  return sim
}

async function archiveActiveGroupChats(actor: { id: string }) {
  const activeIds = ((await fetchRedis('smembers', ACTIVE_GROUP_CHATS_KEY)) as string[] | null) ?? []
  if (!activeIds.length) return activeIds

  const archivedAt = Date.now()
  for (const chatId of activeIds) {
    const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!raw) continue
    try {
      const data = JSON.parse(raw) as any
      data.archived = true
      data.archivedAt = archivedAt
      data.archivedBy = actor.id
      await Promise.all([
        db.set(`chat:${chatId}`, JSON.stringify(data)),
        db.set(`archive:chat:${chatId}`, JSON.stringify(data)),
      ])
    } catch {
      // ignore malformed
    }
  }

  // Clear active index (but keep canonical group_chats:all intact)
  await db.del(ACTIVE_GROUP_CHATS_KEY)
  return activeIds
}

async function clearSimUserActiveAssignments(simUserIds: string[]) {
  for (const userId of simUserIds) {
    try {
      const existing = ((await fetchRedis('smembers', `user:${userId}:group_chats`)) as string[] | null) ?? []
      if (existing.length) {
        await db.sadd(`user:${userId}:group_chats_history`, ...existing)
      }
    } catch {
      // ignore
    }

    await Promise.all([
      db.del(`user:${userId}:current_group_chat`),
      db.del(`user:${userId}:group_chats`),
    ])
  }
}

export async function loadMasterSchedule(): Promise<Schedule> {
  const raw = await db.get('schedule:master')
  if (!raw) throw new Error('No master schedule configured (schedule:master)')
  const schedule = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : (raw as unknown)
  if (!Array.isArray(schedule)) throw new Error('Invalid master schedule format')
  return schedule as Schedule
}

export async function getCurrentScheduleDay(): Promise<number> {
  const raw = await db.get(CURRENT_DAY_KEY)
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : null
  if (n === null || !Number.isFinite(n)) return -1
  return n
}

export async function getEpochLengthDays(): Promise<number> {
  const raw = await db.get(EPOCH_LENGTH_KEY)
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : null
  // Default: 3-day groupchat epochs
  if (n === null || !Number.isFinite(n) || n <= 0) return 3
  return Math.floor(n)
}

async function getActiveGroupChatIds(): Promise<string[]> {
  return ((await fetchRedis('smembers', ACTIVE_GROUP_CHATS_KEY)) as string[] | null) ?? []
}

/**
 * Apply (or re-apply) the schedule for the epoch containing dayIndex.
 *
 * Semantics:
 * - We always advance the "current day" pointer.
 * - We only rebuild group chats when the epoch changes (default epoch length = 3 days),
 *   or when there are no active group chats yet.
 *
 * Schedule interpretation:
 * - schedule:master is an array of "epochs" (each epoch is an array of groups).
 * - epochIndex chooses scheduleIndex via modulo, so schedules can cycle indefinitely.
 */
export async function applyScheduleDay(input: {
  dayIndex: number
  actorUserId: string
}) {
  const schedule = await loadMasterSchedule()
  if (input.dayIndex < 0) throw new Error('dayIndex must be >= 0')

  const epochLengthDays = await getEpochLengthDays()
  const currentDay = await getCurrentScheduleDay()
  const prevEpoch = currentDay >= 0 ? Math.floor(currentDay / epochLengthDays) : -1
  const nextEpoch = Math.floor(input.dayIndex / epochLengthDays)

  const simUserIds = await getSimUserIds()
  const activeBefore = await getActiveGroupChatIds()
  const shouldTransition = activeBefore.length === 0 || nextEpoch !== prevEpoch

  const scheduleIndex =
    schedule.length === 0 ? 0 : ((nextEpoch % schedule.length) + schedule.length) % schedule.length

  const dayGroups = shouldTransition ? schedule[scheduleIndex] ?? [] : []

  let archivedChatIds: string[] = []
  // Only rebuild group chats when transitioning epochs (or bootstrapping).
  if (shouldTransition) {
    archivedChatIds = await archiveActiveGroupChats({ id: input.actorUserId })
    await clearSimUserActiveAssignments(simUserIds)

    // Clear available group chats set (used elsewhere)
    await db.del('available_group_chats')
  }

  // Create chats for this day
  const createdGroupChats: { chatId: string; members: string[] }[] = []
  if (shouldTransition) {
    for (const membersRaw of dayGroups) {
      const members = (membersRaw ?? []).filter((id) => simUserIds.includes(id))
      if (!members.length) continue

      const groupChatId = `group_${nanoid()}`
      const groupChat = {
        id: groupChatId,
        name: '',
        creatorId: input.actorUserId,
        members,
        createdAt: Date.now(),
        transitionDate: null,
        scheduleDayIndex: input.dayIndex,
        scheduleEpochIndex: nextEpoch,
        scheduleIndex,
        epochLengthDays,
        archived: false,
      }

      await Promise.all([
        db.set(`chat:${groupChatId}`, JSON.stringify(groupChat)),
        addGroupChatId(groupChatId),
        db.sadd(ACTIVE_GROUP_CHATS_KEY, groupChatId),
      ])

      for (let idx = 0; idx < members.length; idx += 1) {
        const memberId = members[idx]
        const color = COLORS[idx % COLORS.length]
        await Promise.all([
          db.set(`chat:${groupChatId}:user:${memberId}:color`, color),
          db.sadd(`user:${memberId}:group_chats`, groupChatId),
          db.sadd(`user:${memberId}:group_chats_history`, groupChatId),
          db.set(`user:${memberId}:current_group_chat`, groupChatId),
        ])
      }

      // Seed an intro message so new chats never start empty (helps LLM context + UI edge cases).
      try {
        const senderId = members[0]
        const timestamp = Date.now()
        const intro = messageValidator.parse({
          id: `intro_${nanoid()}`,
          senderId,
          text: buildIntroText({ senderId, members }),
          timestamp,
        })
        await db.zadd(`chat:${groupChatId}:messages`, {
          score: timestamp,
          member: JSON.stringify(intro),
        })
      } catch {
        // best-effort only
      }

      // mark available if group is short
      if (members.length < 5) {
        await db.sadd('available_group_chats', groupChatId)
      }

      createdGroupChats.push({ chatId: groupChatId, members })
    }
  }

  await Promise.all([
    db.set(CURRENT_DAY_KEY, String(input.dayIndex)),
    db.set(
      'schedule:last_advance',
      JSON.stringify({
        dayIndex: input.dayIndex,
        epochLengthDays,
        epochIndex: nextEpoch,
        scheduleIndex,
        didTransition: shouldTransition,
        actorUserId: input.actorUserId,
        timestamp: Date.now(),
        createdGroupChats: createdGroupChats.length,
      }),
    ),
  ])

  const activeAfter = shouldTransition ? await getActiveGroupChatIds() : activeBefore

  return {
    dayIndex: input.dayIndex,
    scheduleEpochs: schedule.length,
    epochLengthDays,
    epochIndex: nextEpoch,
    scheduleIndex,
    didTransition: shouldTransition,
    simUsers: simUserIds.length,
    archivedChatIds,
    createdGroupChats,
    activeGroupChatIds: activeAfter,
  }
}


