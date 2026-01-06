'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'

type GroupChatListItem = {
  id: string
  members: string[]
  createdAt?: number
  transitionDate?: number | null
  messageCount?: number
}

type MemberUser = {
  id: string
  name: string
  email: string
  image: string
  isSimUser?: boolean
}

type Message = {
  id: string
  text: string
  senderId: string
  timestamp: number
}

export default function AdminGroupChatsClient() {
  const [groupChats, setGroupChats] = useState<GroupChatListItem[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [selectedChatId, setSelectedChatId] = useState<string>('')
  const [limit, setLimit] = useState(200)
  const [listError, setListError] = useState<string>('')

  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [chat, setChat] = useState<any>(null)
  const [members, setMembers] = useState<MemberUser[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [messageTotal, setMessageTotal] = useState<number>(0)

  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return groupChats
    return groupChats.filter((c) => c.id.toLowerCase().includes(f))
  }, [groupChats, filter])

  const loadList = async () => {
    setIsLoadingList(true)
    setListError('')
    try {
      const res = await fetch('/api/admin/groupchats')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(data?.error || `Failed to load group chats (${res.status})`)
        setGroupChats([])
        return
      }
      setGroupChats(data.groupChats ?? [])
    } catch (e: any) {
      setListError(e?.message || 'Failed to load group chats')
      setGroupChats([])
    } finally {
      setIsLoadingList(false)
    }
  }

  const loadChat = async (chatId: string) => {
    setIsLoadingChat(true)
    try {
      const res = await fetch(`/api/admin/groupchats/${encodeURIComponent(chatId)}?limit=${limit}`)
      const data = await res.json()
      setChat(data.chat ?? null)
      setMembers(data.members ?? [])
      setMessages(data.messages ?? [])
      setMessageTotal(data.messageTotal ?? 0)
    } finally {
      setIsLoadingChat(false)
    }
  }

  useEffect(() => {
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedChatId) loadChat(selectedChatId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId])

  const senderName = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) map.set(m.id, m.name || m.email || m.id)
    return (id: string) => map.get(id) ?? id
  }, [members])

  return (
    <div className='space-y-6'>
      <div className='rounded border border-gray-200 bg-white p-4'>
        <div className='flex items-center justify-between gap-4 flex-wrap'>
          <div>
            <div className='font-semibold text-gray-900'>Group Chat Inspector</div>
            <div className='text-sm text-gray-600'>
              Browse any group chat (admin-only) and view the most recent messages.
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Button isLoading={isLoadingList} onClick={loadList}>
              Refresh list
            </Button>
          </div>
        </div>

        <div className='mt-3 flex items-center gap-3 flex-wrap'>
          <input
            className='w-64 rounded border border-gray-300 px-3 py-2 text-sm'
            placeholder='Filter by chat id...'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <label className='text-sm text-gray-700 flex items-center gap-2'>
            Limit
            <input
              className='w-24 rounded border border-gray-300 px-3 py-2 text-sm'
              type='number'
              min={1}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(Number(e.target.value) || 200, 1), 2000))}
            />
          </label>
        </div>

        {listError && (
          <div className='mt-3 text-sm text-red-700'>
            {listError}
          </div>
        )}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='rounded border border-gray-200 bg-white overflow-hidden'>
          <div className='px-4 py-3 border-b border-gray-200 font-semibold text-gray-900'>
            Group chats ({filtered.length})
          </div>
          <div className='max-h-[70vh] overflow-auto'>
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChatId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                  selectedChatId === c.id ? 'bg-gray-50' : ''
                }`}
              >
                <div className='font-mono text-xs text-gray-700'>{c.id}</div>
                <div className='text-xs text-gray-600 mt-1'>
                  {c.members?.length ?? 0} members • {c.messageCount ?? 0} messages
                </div>
              </button>
            ))}
            {!filtered.length && (
              <div className='px-4 py-6 text-sm text-gray-600'>No group chats found.</div>
            )}
          </div>
        </div>

        <div className='lg:col-span-2 rounded border border-gray-200 bg-white overflow-hidden'>
          <div className='px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap'>
            <div>
              <div className='font-semibold text-gray-900'>Chat</div>
              <div className='text-xs text-gray-600 font-mono'>{selectedChatId || '(none)'}</div>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                isLoading={isLoadingChat}
                onClick={() => selectedChatId && loadChat(selectedChatId)}
              >
                Refresh chat
              </Button>
            </div>
          </div>

          {!selectedChatId ? (
            <div className='p-6 text-sm text-gray-600'>Select a group chat to inspect.</div>
          ) : (
            <div className='p-4 space-y-4'>
              <div className='text-sm text-gray-700'>
                <span className='font-semibold'>Messages:</span> showing last {messages.length} of{' '}
                {messageTotal}
              </div>

              <details>
                <summary className='cursor-pointer text-sm text-gray-700'>Members</summary>
                <div className='mt-2 grid grid-cols-1 md:grid-cols-2 gap-2'>
                  {members.map((m) => (
                    <div key={m.id} className='rounded border border-gray-100 bg-gray-50 p-2'>
                      <div className='font-semibold text-sm text-gray-900'>{m.name || m.id}</div>
                      <div className='text-xs text-gray-600 font-mono'>{m.email}</div>
                    </div>
                  ))}
                </div>
              </details>

              <details>
                <summary className='cursor-pointer text-sm text-gray-700'>Chat JSON</summary>
                <pre className='mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs'>
                  {JSON.stringify(chat, null, 2)}
                </pre>
              </details>

              <div className='rounded border border-gray-100'>
                <div className='max-h-[55vh] overflow-auto p-3 space-y-2'>
                  {messages.map((msg) => (
                    <div key={msg.id} className='rounded bg-gray-50 p-2'>
                      <div className='text-xs text-gray-600 flex items-center justify-between gap-4'>
                        <div className='font-mono'>
                          {senderName(msg.senderId)} ({msg.senderId})
                        </div>
                        <div className='font-mono'>{new Date(msg.timestamp).toLocaleString()}</div>
                      </div>
                      <div className='text-sm text-gray-900 mt-1 whitespace-pre-wrap'>{msg.text}</div>
                    </div>
                  ))}
                  {!messages.length && (
                    <div className='text-sm text-gray-600'>No messages yet for this chat.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


