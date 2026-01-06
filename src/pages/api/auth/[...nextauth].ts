import { authOptions } from '@/lib/auth'
import NextAuth from 'next-auth/next'
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  // Minimal request logging to debug OAuth failures that otherwise appear as "?error=google".
  // Do NOT log cookies or tokens.
  try {
    const url = req.url ?? ''
    console.log('[NextAuth][request]', req.method, url)
  } catch {
    // ignore
  }

  try {
    return await NextAuth(req, res, authOptions)
  } catch (error: any) {
    console.error('[NextAuth][handler] Threw', {
      name: error?.name,
      message: error?.message,
    })
    throw error
  }
}