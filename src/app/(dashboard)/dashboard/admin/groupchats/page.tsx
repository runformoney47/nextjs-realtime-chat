import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import AdminGroupChatsClient from './AdminGroupChatsClient'

export default async function AdminGroupChatsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.isAdmin !== true) redirect('/dashboard')

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-3xl mb-4'>Group Chats</h1>
      <p className='text-sm text-gray-600 mb-6'>
        Admin-only inspector for group chats and their message logs.
      </p>
      <AdminGroupChatsClient />
    </div>
  )
}




