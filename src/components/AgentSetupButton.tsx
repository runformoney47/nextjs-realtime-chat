'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { toast } from 'react-hot-toast'

export default function AgentSetupButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any>(null)

  const run = async () => {
    const ok = window.confirm(
      'Agent Setup will delete chats/rankings/schedules and rebuild 100 sim users (0-99). Continue?',
    )
    if (!ok) return

    setIsRunning(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/agent-setup', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      setResult(data)
      toast.success('Agent setup complete')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Agent setup failed')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className='rounded border border-gray-200 bg-white p-4'>
      <div className='flex items-center justify-between gap-4 flex-wrap'>
        <div>
          <div className='font-semibold text-gray-900'>Agent Setup</div>
          <div className='text-sm text-gray-600'>
            Clears sim data, creates users <span className='font-mono'>0..99</span>, and creates 20
            group chats (5 per chat).
          </div>
        </div>

        <Button isLoading={isRunning} onClick={run}>
          Agent Setup
        </Button>
      </div>

      {result && (
        <div className='mt-4 text-sm'>
          <div className='text-gray-700'>
            <span className='font-semibold'>Login:</span>{' '}
            <span className='font-mono'>/agent/login?userId=&lt;id&gt;</span>
          </div>
          <div className='text-gray-700 mt-1'>
            <span className='font-semibold'>Example:</span>{' '}
            <span className='font-mono'>/agent/login?userId=0</span>
          </div>
          <details className='mt-3'>
            <summary className='cursor-pointer text-gray-700'>
              Show JSON result
            </summary>
            <pre className='mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs'>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}




