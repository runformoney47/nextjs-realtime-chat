'use client'

import Button from '@/components/ui/Button'
import { FC, useMemo, useState } from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'

const Page: FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSimLoading, setIsSimLoading] = useState<boolean>(false)
  const [selectedMode, setSelectedMode] = useState<'new' | 'existing' | null>(
    null
  )
  const [username, setUsername] = useState<string>('')
  const router = useRouter()

  const loginDisabled = useMemo(
    () => isLoading || isSimLoading,
    [isLoading, isSimLoading]
  )

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

  async function loginWithSimulationUser() {
    setIsSimLoading(true)
    try {
      if (!selectedMode) {
        toast.error('Please choose to create or sign in to a temp account.')
        return
      }

      if (!username.trim()) {
        toast.error('Please enter a username to continue.')
        return
      }

      const baseUrl =
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXTAUTH_URL || 'http://localhost:3000'

      const randomSeed =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)

      const email = `sim-${randomSeed}@example.com`
      const normalizedUsername = username.trim()

      const result = await signIn('sim-user', {
        name: normalizedUsername,
        mode: selectedMode,
        redirect: false,
        callbackUrl: `${baseUrl}/dashboard`,
      })

      console.log('[SimUser][signIn][result]', result)

      if (result?.error) {
        toast.error(
          `Failed to sign in as a simulation user: ${result.error}`
        )
        return
      }

      const url = result?.url ?? '/dashboard'
      router.push(url)
    } catch (error) {
      console.error('[SimUser][loginWithSimulationUser] Failed to sign in', error)
      toast.error('Something went wrong while creating a simulation user.')
    } finally {
      setIsSimLoading(false)
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
                  onClick={() => setSelectedMode('new')}
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
                  onClick={() => setSelectedMode('existing')}
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
                  className='w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400'
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
