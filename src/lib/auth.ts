import { NextAuthOptions } from 'next-auth'
import { UpstashRedisAdapter } from '@next-auth/upstash-redis-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { fetchRedis } from '@/helpers/redis'
import { db } from './db'

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || clientId.length === 0) {
    throw new Error('Missing GOOGLE_CLIENT_ID')
  }

  if (!clientSecret || clientSecret.length === 0) {
    throw new Error('Missing GOOGLE_CLIENT_SECRET')
  }

  return { clientId, clientSecret }
}

// Ensure NEXTAUTH_URL is set to a valid value
// NextAuth requires this to construct URLs internally
if (!process.env.NEXTAUTH_URL) {
  if (process.env.NODE_ENV === 'development') {
    // Default to localhost in development
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    console.log('[NextAuth] NEXTAUTH_URL not set, using default: http://localhost:3000')
  } else {
    console.warn('[NextAuth] NEXTAUTH_URL is not set. This may cause issues in production.')
  }
} else {
  // Validate that NEXTAUTH_URL is a valid URL
  try {
    new URL(process.env.NEXTAUTH_URL)
  } catch (error) {
    console.error('[NextAuth] NEXTAUTH_URL is set but invalid:', process.env.NEXTAUTH_URL)
    if (process.env.NODE_ENV === 'development') {
      // Fallback to localhost in development if invalid
      process.env.NEXTAUTH_URL = 'http://localhost:3000'
      console.log('[NextAuth] Using fallback URL: http://localhost:3000')
    } else {
      throw new Error('NEXTAUTH_URL must be a valid URL')
    }
  }
}

export const authOptions: NextAuthOptions = {
  adapter: UpstashRedisAdapter(db),
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  providers: [
    GoogleProvider({
      clientId: getGoogleCredentials().clientId,
      clientSecret: getGoogleCredentials().clientSecret,
    }),
    CredentialsProvider({
      id: 'sim-user',
      name: 'Simulation User',
      credentials: {
        username: { label: 'Username', type: 'text' },
        mode: { label: 'Mode', type: 'text' },
      },
      async authorize(credentials) {
        try {
          const rawUsername = credentials?.username
          const mode = credentials?.mode as 'new' | 'existing' | undefined

          const username = rawUsername?.trim()

          if (!username || !mode) {
            console.warn('[sim-user] Missing username or mode in credentials', {
              hasUsername: !!username,
              mode,
            })
            return null
          }

          const email = `sim-${encodeURIComponent(username)}@example.com`
          const emailKey = `user:email:${email}`
          const existingUserId = (await fetchRedis('get', emailKey)) as
            | string
            | null

          if (mode === 'existing') {
            if (!existingUserId) {
              console.warn(
                '[sim-user] Existing mode but no user found for email',
                { email },
              )
              return null
            }

            const existingUserJson = (await fetchRedis(
              'get',
              `user:${existingUserId}`,
            )) as string | null

            if (!existingUserJson) {
              console.warn(
                '[sim-user] Email mapped to id but user record missing',
                { email, existingUserId },
              )
              return null
            }

            const existingUser = JSON.parse(existingUserJson) as User

            return {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              image: existingUser.image,
            }
          }

          // mode === 'new' – create or reuse a simulation user.
          let userId = existingUserId

          if (!userId) {
            userId =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2)
          }

          const now = new Date().toISOString()
          // Use PNG avatars instead of SVG to avoid Next.js dangerouslyAllowSVG warnings.
          const image = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(
            username,
          )}`

          const userRecord: User & {
            createdAt?: string
            lastActive?: string
            isOnline?: boolean
            isSimUser?: boolean
          } = {
            id: userId!,
            name: username,
            email,
            image,
            createdAt: now,
            lastActive: now,
            isOnline: true,
            isSimUser: true,
          }

          await db.set(`user:${userId}`, JSON.stringify(userRecord))
          await db.set(emailKey, userId)

          return {
            id: userRecord.id,
            name: userRecord.name,
            email: userRecord.email,
            image: userRecord.image,
          }
        } catch (error) {
          console.error('[sim-user] authorize() failed', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const dbUserResult = (await fetchRedis('get', `user:${token.id}`)) as
        | string
        | null

      if (!dbUserResult) {
        if (user) {
          token.id = user!.id
        }

        return token
      }

      const dbUser = JSON.parse(dbUserResult) as User

      return {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        picture: dbUser.image,
      }
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id
        session.user.name = token.name
        session.user.email = token.email
        session.user.image = token.picture
        
        // Check if user is admin
        const { isAdminClient } = await import('./admin')
        session.user.isAdmin = isAdminClient(token.id)
      }

      return session
    },
    // Ensure we always return an absolute URL so any internal `new URL()`
    // calls in NextAuth/Next.js do not receive a relative path like
    // "/dashboard", which would throw "Invalid URL" in the browser.
    redirect({ url, baseUrl }) {
      try {
        // If the URL is already absolute, just return it.
        const parsed = new URL(url)
        return parsed.toString()
      } catch {
        // If it's relative (e.g. "/dashboard"), join it to baseUrl.
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`
        }

        // Fallback: ignore unexpected values and just go to baseUrl.
        return baseUrl
      }
    },
  },
}
