import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Coming soon',
  description: 'Coming soon',
}

const SurveyPage = async () => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-700">Coming soon</h1>
        <p className="mt-2 text-gray-500">This page isn’t available yet.</p>
      </div>
    </div>
  )
}

export default SurveyPage

