import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAllAppUserIds } from '@/lib/user-store'
import { fetchRedis } from '@/helpers/redis'
import AgentSetupButton from '@/components/AgentSetupButton'

interface UserHealthRow {
  id: string
  name: string
  email: string
  currentGroupChatId: string | null
  groupMembers: string[]
}


//The "Promise" of this function is an arraw of UserHealthRows
async function getHealthData(): Promise<UserHealthRow[]> {

  //starts with pulling all the UserIds
  const userIds = await getAllAppUserIds()


  //once this is populated it will be returned
  const rows: UserHealthRow[] = []


  
  for (const userId of userIds) {
    try {
      const rawUser = (await fetchRedis('get', `user:${userId}`)) as string | null
      let name = '(unknown)'
      let email = ''

      if (rawUser) {
        try {
          const parsed = JSON.parse(rawUser) as { name?: string; email?: string }
          if (parsed.name) name = parsed.name
          if (parsed.email) email = parsed.email
        } catch {
          // ignore malformed user; keep defaults
        }
      }

      const currentGroupChatId = (await fetchRedis(
        'get',
        `user:${userId}:current_group_chat`,
      )) as string | null

      let groupMembers: string[] = []

      if (currentGroupChatId && currentGroupChatId.startsWith('group_')) {
        try {
          const rawChat = (await fetchRedis(
            'get',
            `chat:${currentGroupChatId}`,
          )) as string | null

          if (rawChat) {
            const chat = JSON.parse(rawChat) as { members?: string[] }
            if (Array.isArray(chat.members)) {
              groupMembers = chat.members
            }
          }
        } catch {
          // ignore malformed chat; keep members empty
        }
      }

      rows.push({
        id: userId,
        name,
        email,
        currentGroupChatId,
        groupMembers,
      })
    } catch (error) {
      console.error('[HealthView] Failed to load data for user', userId, error)
    }
  }

  // Sort for nicer display: those with a current groupchat first
  rows.sort((a, b) => {
    const aHasChat = a.currentGroupChatId ? 1 : 0
    const bHasChat = b.currentGroupChatId ? 1 : 0
    if (aHasChat !== bHasChat) return bHasChat - aHasChat
    return a.name.localeCompare(b.name)
  })

  return rows
}

export default async function HealthPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const rows = await getHealthData()

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-3xl mb-4'>Groupchat Health Debug View</h1>
      <p className='text-sm text-gray-600 mb-6'>
        Temporary troubleshooting view. Shows each known user, their current groupchat, and the
        members of that chat according to Redis.
      </p>

      <div className='mb-8'>
        <AgentSetupButton />
        <div className='mt-3'>
          <Link
            href='/dashboard/admin/groupchats'
            className='inline-flex items-center rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800'
          >
            Inspect group chats
          </Link>
        </div>
      </div>

      <div className='overflow-x-auto rounded border border-gray-200 bg-white'>
        <table className='min-w-full text-sm'>
          <thead className='bg-gray-50'>
            <tr>
              <th className='px-3 py-2 text-left font-semibold text-gray-700'>User</th>
              <th className='px-3 py-2 text-left font-semibold text-gray-700'>Email</th>
              <th className='px-3 py-2 text-left font-semibold text-gray-700'>
                Current Groupchat ID
              </th>
              <th className='px-3 py-2 text-left font-semibold text-gray-700'>Group Members</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200'>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className='px-3 py-2'>
                  <div className='font-medium text-gray-900'>{row.name || '(no name)'}</div>
                  <div className='text-xs text-gray-500'>{row.id}</div>
                </td>
                <td className='px-3 py-2 text-gray-700'>{row.email || '—'}</td>
                <td className='px-3 py-2 font-mono text-xs text-gray-800'>
                  {row.currentGroupChatId ?? 'None'}
                </td>
                <td className='px-3 py-2 text-gray-700'>
                  {row.groupMembers.length ? row.groupMembers.join(', ') : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className='px-3 py-4 text-center text-gray-500' colSpan={4}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


