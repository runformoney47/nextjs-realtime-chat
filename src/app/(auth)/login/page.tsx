'use client'
// This file is the /login page (App Router) and is a CLIENT component because:
// - It uses hooks (state, effects, router).
// - It calls the NextAuth client `signIn` helper.
// It renders two flows:
//   1) Google OAuth (NextAuth Google provider).
//   2) A "Temporary Account Simulator" using the custom NextAuth credentials provider "sim-user".
// The sim-user flow logs events (for debugging), persists them to sessionStorage, and mirrors to a debug
// endpoint in development. After successful sign-in, it redirects to /dashboard.

import Button from '@/components/ui/Button'
import clsx from 'clsx'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

type SimLogLevel = 'info' | 'warn' | 'error' | 'debug'

// Key for sessionStorage where we keep a short rolling log of sim-user events
const SIM_LOG_STORAGE_KEY = 'simUserLogs'

/**
 * On mount, replay any sim-user logs from a previous attempt
 * so you can see the trail in the console if the page was reloaded.
 */
function replayStoredLogs() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const raw = window.sessionStorage.getItem(SIM_LOG_STORAGE_KEY)
    if (!raw) return

    const entries = JSON.parse(raw) as SimLogEntry[]
    if (!Array.isArray(entries) || entries.length === 0) {
      return
    }

    console.groupCollapsed(
      `[SimUser] Restored ${entries.length} event(s) from previous attempt`
    )
    entries.forEach(({ timestamp, level, message, payload }) => {
      const method =
        level === 'error'
          ? 'error'
          : level === 'warn'
          ? 'warn'
          : level === 'debug'
          ? 'debug'
          : 'info'

      console[method](`${timestamp} – ${message}`, payload ?? '')
    })
    console.groupEnd()
  } catch (error) {
    console.error('[SimUser] Unable to replay stored logs', error)
  }
}

type SimLogEntry = {
  timestamp: string
  level: SimLogLevel
  message: string
  payload?: unknown
}

// Main login page component
const Page: FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSimLoading, setIsSimLoading] = useState<boolean>(false)
  const [selectedMode, setSelectedMode] = useState<'new' | 'existing' | null>(
    null
  )
  const [username, setUsername] = useState<string>('')
  const router = useRouter()

  // Disable buttons whenever a login flow is in progress
  const loginDisabled = useMemo(
    () => isLoading || isSimLoading,
    [isLoading, isSimLoading]
  )

  // Google OAuth flow via NextAuth
  async function loginWithGoogle() {
    setIsLoading(true)
    try {
      await signIn('google')
    } catch (error) {
      // display error message to user
      toast.error('Something went wrong with your login.')
    } finally {
      setIsLoading(false)
    }
  }

  // On mount, replay any stored sim-user logs from previous attempts
  useEffect(() => {
    replayStoredLogs()
  }, [])

  // Helper to log sim-user events (console + sessionStorage + optional server mirror)
  const logSimEvent = useCallback(
    (level: SimLogLevel, message: string, payload?: unknown) => {
      const entry: SimLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        payload,
      }

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          const raw = window.sessionStorage.getItem(SIM_LOG_STORAGE_KEY)
          const entries = raw ? (JSON.parse(raw) as SimLogEntry[]) : []
          const nextEntries = [...entries.slice(-199), entry]
          window.sessionStorage.setItem(
            SIM_LOG_STORAGE_KEY,
            JSON.stringify(nextEntries)
          )
        } catch (error) {
          console.warn('[SimUser] Failed to persist log entry', error, entry)
        }
      }

      const method =
        level === 'error'
          ? 'error'
          : level === 'warn'
          ? 'warn'
          : level === 'debug'
          ? 'debug'
          : 'info'

      if (payload !== undefined) {
        console[method](`[SimUser] ${message}`, payload)
      } else {
        console[method](`[SimUser] ${message}`)
      }

      // Also mirror logs to the server terminal via a debug API in development.
      if (process.env.NODE_ENV === 'development') {
        try {
          void fetch('/api/debug/client-log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              level:
                level === 'debug'
                  ? 'debug'
                  : level === 'error'
                  ? 'error'
                  : level === 'warn'
                  ? 'warn'
                  : 'info',
              message,
              payload,
            }),
          })
        } catch (error) {
          // Swallow network errors – logging should never break the UI.
          console.warn('[SimUser] Failed to POST log to /api/debug/client-log', error)
        }
      }
    },
    []
  )

  // Track which temp-user mode is selected
  const handleSelectMode = (mode: 'new' | 'existing') => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      previousMode: selectedMode,
      requestedMode: mode,
      isLoading,
      isSimLoading,
      loginDisabled,
    }

    logSimEvent(
      'info',
      mode === 'new'
        ? 'User selected the CREATE temp account mode.'
        : 'User selected the SIGN IN temp account mode.',
      snapshot
    )

    setSelectedMode(mode)
  }

  // Main handler for the temp account flow (sim-user credentials provider)
  async function loginWithSimulationUser() {
    setIsSimLoading(true)
    const interactionId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)

    const startContext = {
      interactionId,
      timestamp: new Date().toISOString(),
      selectedMode,
      rawUsername: username,
      isLoading,
      isSimLoading,
      loginDisabled,
    }

    logSimEvent(
      'info',
      `Temp account flow started (interaction ${interactionId}).`,
      startContext
    )

    try {
      if (!selectedMode) {
        logSimEvent('warn', 'Validation failed: no mode selected.', {
          interactionId,
        })
        toast.error('Please choose to create or sign in to a temp account.')
        return
      }

      if (!username.trim()) {
        logSimEvent('warn', 'Validation failed: username missing.', {
          interactionId,
          username,
        })
        toast.error('Please enter a username to continue.')
        return
      }

      const normalizedUsername = username.trim()
      const context = {
        interactionId,
        normalizedUsername,
        selectedMode,
        envNextAuthUrl: process.env.NEXTAUTH_URL,
      }

      logSimEvent(
        'info',
        'Validation complete. Calling NextAuth sim-user provider.',
        context
      )

      const result = await signIn('sim-user', {
        username: normalizedUsername,
        mode: selectedMode,
        redirect: false,
      })

      logSimEvent('info', 'NextAuth signIn responded for sim-user.', {
        interactionId,
        result,
      })

      if (result?.error || result?.ok === false) {
        const error = result?.error ?? 'Unknown'

        logSimEvent('error', 'sim-user signIn reported an error.', {
          interactionId,
          error,
          url: result?.url,
        })

        if (error === 'CredentialsSignin' && selectedMode === 'existing') {
          toast.error(
            `No temp account with username "${normalizedUsername}" exists yet. Try "Create temp account" first.`
          )
        } else {
          toast.error(
            `Failed to sign in as a temp user: ${error}`
          )
        }

        return
      }

      const url = '/dashboard'
      logSimEvent('info', 'Redirecting user after successful temp login.', {
        interactionId,
        url,
      })
      router.push(url)
    } catch (error) {
      logSimEvent('error', 'Unexpected failure in temp account flow.', {
        interactionId,
        error,
      })
      toast.error('Something went wrong while creating a simulation user.')
    } finally {
      setIsSimLoading(false)
      logSimEvent('info', 'Temp account flow finished.', {
        interactionId,
        endedAt: new Date().toISOString(),
      })
    }
  }

  return (
    <>
      <div className='flex min-h-full items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='w-full flex flex-col items-center max-w-md space-y-8'>
          <div className='flex flex-col items-center gap-8'>
            logo
            <h2 className='mt-6 text-center text-3xl font-bold tracking-tight text-gray-900'>
              Sign in to your account
            </h2>
          </div>

          <Button
            isLoading={isLoading}
            type='button'
            className='max-w-sm mx-auto w-full'
            onClick={loginWithGoogle}
            disabled={loginDisabled}>
            {isLoading ? null : (
              <svg
                className='mr-2 h-4 w-4'
                aria-hidden='true'
                focusable='false'
                data-prefix='fab'
                data-icon='github'
                role='img'
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'>
                <path
                  d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                  fill='#4285F4'
                />
                <path
                  d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                  fill='#34A853'
                />
                <path
                  d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
                  fill='#FBBC05'
                />
                <path
                  d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                  fill='#EA4335'
                />
                <path d='M1 1h22v22H1z' fill='none' />
              </svg>
            )}
            Google
          </Button>

          <div className='w-full border-t border-gray-200 pt-6'>
            <h3 className='text-sm font-semibold text-gray-700 text-center mb-4'>
              Temporary Account Simulator
            </h3>

            <div className='flex flex-col gap-3'>
              <div className='flex gap-2'>
                <button
                  type='button'
                  className={clsx(
                    'flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                    selectedMode === 'new'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                  )}
                  onClick={() => handleSelectMode('new')}
                  disabled={loginDisabled}>
                  Create temp account
                </button>
                <button
                  type='button'
                  className={clsx(
                    'flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                    selectedMode === 'existing'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                  )}
                  onClick={() => handleSelectMode('existing')}
                  disabled={loginDisabled}>
                  Sign into temp account
                </button>
              </div>

              <div className='flex flex-col gap-2'>
                <label
                  htmlFor='sim-username'
                  className='text-xs font-medium text-gray-500'>
                  Username
                </label>
                <input
                  id='sim-username'
                  type='text'
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  // iOS Safari/WKWebView auto-zooms inputs <16px; keep at least 16px for stable UX.
                  className='w-full rounded-md border border-gray-300 px-3 py-2 text-[16px] shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400'
                  placeholder='e.g. user123'
                  autoComplete='off'
                  disabled={loginDisabled}
                />
              </div>

              <Button
                isLoading={isSimLoading}
                type='button'
                className='w-full'
                onClick={loginWithSimulationUser}
                disabled={loginDisabled}>
                {isSimLoading ? null : 'Continue'}
              </Button>

              <p className='text-xs text-gray-500 text-center'>
                Choose a username to create a new temp account or sign in to an existing
                one. Use simple names to make load-testing scripts easier.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Page
