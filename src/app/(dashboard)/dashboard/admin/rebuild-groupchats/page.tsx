'use client'

import Button from '@/components/ui/Button'
import { FC, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface PageProps {}

type Schedule = string[][][]

const RebuildGroupChatsPage: FC<PageProps> = ({}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isAddingUser, setIsAddingUser] = useState<boolean>(false)
  const [result, setResult] = useState<any>(null)
  const [transitionDate, setTransitionDate] = useState<string>('')
  const [transitionStep, setTransitionStep] = useState<string>('')
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false)
  const [importedText, setImportedText] = useState<string>('')
  const [importedSchedule, setImportedSchedule] = useState<Schedule | null>(null)
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false)
  const [currentSchedule, setCurrentSchedule] = useState<Schedule | null>(null)
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState<boolean>(false)
  const [selectedScheduleDay, setSelectedScheduleDay] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await fetch('/api/schedule')
        if (!res.ok) return
        const data = (await res.json()) as { schedule: Schedule | null }
        setCurrentSchedule(data.schedule)
      } catch (error) {
        console.error('Failed to load current schedule', error)
      }
    }

    fetchSchedule()
  }, [])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setImportedText(text)

      const parsed = JSON.parse(text) as unknown

      // Basic runtime validation for string[][][]
      if (
        !Array.isArray(parsed) ||
        !parsed.every(
          (day) =>
            Array.isArray(day) &&
            day.every(
              (group) => Array.isArray(group) && group.every((user) => typeof user === 'string'),
            ),
        )
      ) {
        toast.error('Invalid schedule format. Expected a 3-level array of userId strings.')
        setImportedSchedule(null)
        return
      }

      setImportedSchedule(parsed as Schedule)
      toast.success('Schedule file parsed successfully.')
    } catch (error) {
      console.error('Error reading schedule file:', error)
      toast.error('Failed to read or parse the schedule file.')
      setImportedSchedule(null)
    }
  }

  const handleSaveSchedule = async () => {
    if (!importedSchedule) {
      toast.error('No valid schedule to save.')
      return
    }

    setIsSavingSchedule(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schedule: importedSchedule }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save schedule')
      }

      setCurrentSchedule(importedSchedule)
      toast.success('Master schedule imported successfully.')
      setIsImportOpen(false)
    } catch (error) {
      console.error('Error saving schedule:', error)
      toast.error('Failed to save schedule.')
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const handleGenerateSchedule = async () => {
    if (isGeneratingSchedule || isLoading) return
    setIsGeneratingSchedule(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'PUT',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate schedule')
      }

      const generated = data.schedule as Schedule
      setCurrentSchedule(generated)
      setImportedSchedule(generated)
      toast.success(
        `Generated schedule with ${data.meta?.totalUsers ?? 'N'} users over ${
          data.meta?.days ?? '?'
        } days.`,
      )
    } catch (error) {
      console.error('Error generating schedule:', error)
      toast.error('Failed to generate schedule.')
    } finally {
      setIsGeneratingSchedule(false)
    }
  }

  const handleAddRandomUser = async () => {
    if (isAddingUser) return
    setIsAddingUser(true)

    try {
      // Simple random name generator – good enough for test data.
      const baseNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma']
      const base = baseNames[Math.floor(Math.random() * baseNames.length)]
      const suffix = Math.floor(Math.random() * 10_000)
      const username = `${base}-${suffix}`

      const response = await fetch('/api/sim-user/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      })

      const data = await response.json()

      if (!response.ok || !data.created) {
        toast.error('Failed to add random user.')
        return
      }

      toast.success(`Added user "${data.user.name}" (${data.user.id}).`)
    } catch (error) {
      console.error('Error adding random user:', error)
      toast.error('Failed to add random user. See console for details.')
    } finally {
      setIsAddingUser(false)
    }
  }

  const handleRebuild = async () => {
    setIsLoading(true)
    setTransitionStep('Starting transition process...')
    
    // Immediately trigger a global notification to show loading states on all clients
    try {
      // First notify all connected clients about the upcoming transition
      const notifyResponse = await fetch('/api/notifications/global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'group_chat_transition_started',
          message: 'Group chat transition is starting...'
        }),
      });
      
      if (!notifyResponse.ok) {
        console.warn('Failed to send global notification, proceeding anyway');
      }
      
      // Show toast for admin
      toast.loading('Rebuilding group chats. Please wait...', {
        id: 'rebuild-toast',
        duration: 5000,
      })
      
      setTransitionStep('Notifying all users about the transition')
      
      // Use the transition endpoint
      setTransitionStep('Creating new group chat assignments')
      const response = await fetch('/api/group-chat/transition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transitionDate: transitionDate ? new Date(transitionDate).getTime() : null,
          mode:
            currentSchedule && selectedScheduleDay !== null ? ('schedule' as const) : ('random' as const),
          scheduleDayIndex:
            currentSchedule && selectedScheduleDay !== null ? selectedScheduleDay : null,
        }),
      })

      setTransitionStep('Finalizing group chat assignments')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rebuild group chats')
      }
      
      setResult(data)
      toast.dismiss('rebuild-toast')
      
      if (data.allUsersVerified) {
        setTransitionStep('All users have been successfully assigned to new group chats')
        toast.success('Group chats have been rebuilt successfully!')
      } else {
        setTransitionStep('Transition completed with some warnings - check logs')
        toast.success('Group chats rebuilt, but some users may need to refresh their browser')
      }
      
      // Wait a moment before redirect 
      setTransitionStep('Redirecting to your new group chat...')
      setTimeout(() => {
        // Get the current user's new chat ID from the response and redirect
        if (data.currentUserChatId) {
          window.location.href = `/dashboard/chat/${data.currentUserChatId}`
        } else {
          // If not available, refresh the dashboard
          window.location.href = '/dashboard'
        }
      }, 2000)
    } catch (error) {
      console.error('Error rebuilding group chats:', error)
      toast.dismiss('rebuild-toast')
      toast.error('Failed to rebuild group chats. Please try again.')
      setTransitionStep('Error occurred during transition')
      setIsLoading(false)
    }
  }

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-5xl mb-8'>Rebuild Group Chats</h1>
      
      <div className='max-w-3xl'>
        <p className='mb-4 text-lg'>
          This tool will advance users to the next set of group chats, ensuring:
        </p>
        
        <ul className='list-disc pl-6 mb-6 space-y-2'>
          <li>Each user is assigned to a group of up to 5 people</li>
          <li>Each user gets a unique color in their group (Green, Yellow, Orange, Red, or Violet)</li>
          <li>All users maintain their anonymity in group chats</li>
          <li>Users will be automatically redirected to their new group chat</li>
        </ul>
        
        <div className='bg-yellow-50 border border-yellow-200 p-4 rounded-md mb-8'>
          <h3 className='text-yellow-800 font-semibold mb-2'>Important Note</h3>
          <p className='text-yellow-800 mb-2'>
            This process may take a few moments to complete. All users will see a loading screen until their new group chat is ready.
          </p>
          <p className='text-yellow-700'>
            Current group chat messages will be preserved but not accessible through the regular interface.
          </p>
        </div>
        
        {/* Optional scheduled transition date */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scheduled Transition Date (Optional)
          </label>
          <input
            type="datetime-local"
            value={transitionDate}
            onChange={(e) => setTransitionDate(e.target.value)}
            className="w-full p-2 border rounded mb-2"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500">
            If set, this will be recorded as the official transition date. Leave empty for immediate transition.
          </p>
        </div>
        
        {/* Controls */}
        <div className='flex items-center gap-4 mb-8'>
          <Button
            isLoading={isAddingUser}
            type='button'
            onClick={handleAddRandomUser}
            disabled={isLoading || isAddingUser}
          >
            Add user with random name
          </Button>
          <Button
            type='button'
            onClick={handleGenerateSchedule}
            disabled={isLoading || isGeneratingSchedule}
            isLoading={isGeneratingSchedule}
          >
            Generate whole schedule
          </Button>
          <Button
            type='button'
            onClick={() => setIsImportOpen(true)}
            disabled={isLoading}
          >
            Import schedule
          </Button>
        </div>

        {/* Schedule day selector */}
        {currentSchedule && currentSchedule.length > 0 && (
          <div className='mb-6'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              Schedule day index
            </label>
            <select
              className='w-full md:w-64 p-2 border rounded'
              value={selectedScheduleDay !== null ? String(selectedScheduleDay) : ''}
              onChange={(e) => {
                const value = e.target.value
                if (value === '') {
                  setSelectedScheduleDay(null)
                } else {
                  const idx = Number(value)
                  setSelectedScheduleDay(Number.isFinite(idx) ? idx : null)
                }
              }}
              disabled={isLoading}
            >
              <option value=''>Random (ignore schedule)</option>
              {currentSchedule.map((_, idx) => (
                <option key={idx} value={idx}>
                  {idx}
                </option>
              ))}
            </select>
            <p className='text-xs text-gray-500 mt-1'>
              Choose a day index (0 – {currentSchedule.length - 1}). When set, &quot;Advance to Next
              Group Chat Set&quot; will assign users using that day of the schedule instead of random
              groups.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 mb-8">
            <div className="flex items-center mb-4">
              <Loader2 className="h-5 w-5 text-indigo-600 animate-spin mr-2" />
              <span className="font-medium text-gray-700">Transition in Progress</span>
            </div>
            <p className="text-gray-600 mb-2">{transitionStep}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-indigo-600 h-2.5 rounded-full animate-pulse"></div>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Please do not close this page until the process completes.
            </p>
          </div>
        ) : (
          <Button
            isLoading={isLoading}
            onClick={handleRebuild}
            type='button'>
            Advance to Next Group Chat Set
          </Button>
        )}

        {/* Current schedule preview */}
        {currentSchedule && (
          <div className='mt-8 bg-white border border-gray-200 rounded-md p-4'>
            <h2 className='text-lg font-semibold mb-2'>Current master schedule</h2>
            <p className='text-sm text-gray-600 mb-2'>
              Only one master schedule is stored at a time. Importing a new schedule will replace
              the existing one.
            </p>
            <pre className='text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-64'>
              {JSON.stringify(currentSchedule, null, 2)}
            </pre>
          </div>
        )}

        {/* Import schedule modal */}
        {isImportOpen && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-lg max-w-2xl w-full p-6'>
              <h2 className='text-xl font-semibold mb-4'>Import schedule</h2>
              <p className='text-sm text-gray-600 mb-4'>
                Upload a text or JSON file containing a 3-level array of user IDs, e.g.
                <code> string[][][] </code>. This will become the master schedule and will replace
                any existing schedule.
              </p>

              <input
                type='file'
                accept='.txt,.json'
                onChange={handleFileChange}
                className='mb-4'
              />

              {importedSchedule && (
                <div className='mb-4'>
                  <h3 className='font-medium mb-2'>Parsed schedule preview</h3>
                  <pre className='text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-64'>
                    {JSON.stringify(importedSchedule, null, 2)}
                  </pre>
                </div>
              )}

              <div className='flex justify-end gap-3 mt-4'>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => {
                    setIsImportOpen(false)
                    setImportedSchedule(null)
                    setImportedText('')
                  }}
                  disabled={isSavingSchedule}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
                  onClick={handleSaveSchedule}
                  isLoading={isSavingSchedule}
                  disabled={!importedSchedule || isSavingSchedule}
                >
                  Save as master schedule
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {result && !isLoading && (
          <div className='mt-8 bg-gray-50 p-4 rounded-md'>
            <h2 className='text-xl font-semibold mb-2'>Results</h2>
            <p>Successfully created {result.groupChats.length} group chats</p>
            {result.transitionDate && (
              <p className="mt-2">
                Transition date: {new Date(result.transitionDate).toLocaleString()}
              </p>
            )}
            {result.allUsersVerified === false && (
              <p className="mt-2 text-amber-600">
                Note: Some users may need to refresh their browser to see their new group chat.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RebuildGroupChatsPage 