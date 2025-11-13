import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (!session.user.isAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Admin Panel
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Welcome, {session.user.name}
              </span>
              <Link
                href="/dashboard"
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="flex">
          {/* Admin Sidebar */}
          <div className="w-64 bg-white shadow rounded-lg mr-6">
            <nav className="mt-5 px-2">
              <div className="space-y-1">
                <Link
                  href="/admin"
                  className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/users"
                  className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Users
                </Link>
                <Link
                  href="/admin/groups"
                  className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Groups
                </Link>
                <Link
                  href="/admin/simulation"
                  className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Simulation
                </Link>
              </div>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
