import { NextAuthOptions } from 'next-auth'
import { UpstashRedisAdapter } from '@next-auth/upstash-redis-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { fetchRedis } from '@/helpers/redis'
import { db } from './db'
import {
  AppUser,
  getAppUserByEmail,
  getAppUserById,
  saveAppUser,
} from './user-store'

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
  // IMPORTANT: NextAuth debug logs can print sensitive fields (e.g. provider clientSecret).
  // Only enable when explicitly requested.
  debug: process.env.NEXTAUTH_DEBUG === 'true',
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  logger: {
    error(code, metadata) {
      // Never log secrets/tokens. NextAuth metadata can contain provider/account payloads.
      const redact = (value: unknown): unknown => {
        if (!value) return value
        if (typeof value === 'string') {
          // redact long token-ish strings
          if (value.length > 60) return '[REDACTED]'
          return value
        }
        if (Array.isArray(value)) return value.map(redact)
        if (typeof value === 'object') {
          const out: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const key = k.toLowerCase()
            if (
              key.includes('secret') ||
              key.includes('token') ||
              key.includes('id_token') ||
              key.includes('access_token') ||
              key.includes('refresh_token')
            ) {
              out[k] = '[REDACTED]'
            } else {
              out[k] = redact(v)
            }
          }
          return out
        }
        return value
      }

      console.error('[NextAuth][logger.error]', code, redact(metadata))
    },
    warn(code) {
      console.warn('[NextAuth][logger.warn]', code)
    },
    debug(code, metadata) {
      // Only output debug logs when explicitly requested.
      if (process.env.NEXTAUTH_DEBUG === 'true') {
        console.log('[NextAuth][logger.debug]', code, metadata ? '[metadata omitted]' : '')
      }
    },
  },
  events: {
    async error(message) {
      // message can contain nested data; keep it minimal
      console.error('[NextAuth][event.error]', {
        name: (message as any)?.name,
        message: (message as any)?.message,
      })
    },
  },
  providers: [
    GoogleProvider({
      clientId: getGoogleCredentials().clientId,
      clientSecret: getGoogleCredentials().clientSecret,
      // In this codebase we store "real" users (Gmail) in Redis and treat them as admins.
      // Because the Upstash NextAuth adapter uses the same `user:*` keys, it's possible to
      // have an existing user record by email without an OAuth account link yet. In that
      // case NextAuth throws OAuthAccountNotLinked unless we allow linking by email.
      //
      // Keep this dev-only by default; you can explicitly enable in prod if desired.
      allowDangerousEmailAccountLinking:
        process.env.ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING === 'true' ||
        process.env.NODE_ENV === 'development',
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
          const existingUser = await getAppUserByEmail(email)

          if (mode === 'existing') {
            if (!existingUser) {
              console.warn(
                '[sim-user] Existing mode but no user found for email',
                { email },
              )
              return null
            }

            return {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              image: existingUser.image,
            }
          }

          // mode === 'new' – create or reuse a simulation user.
          let userId = existingUser?.id

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

          const userRecord: Partial<AppUser> & { id: string } = {
            id: userId!,
            name: username,
            email,
            image,
            lastActive: now,
            isOnline: true,
            isSimUser: true,
          }

          const saved = await saveAppUser(userRecord, {
            source: 'sim-user-authorize',
          })

          return {
            id: saved.id,
            name: saved.name,
            email: saved.email,
            image: saved.image,
          }
        } catch (error) {
          console.error('[sim-user] authorize() failed', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Ensure token.id is always set when we have a user
      if (user && !token.id) {
        token.id = user.id
      }

      const userId = token.id as string | undefined

      if (!userId) {
        return token
      }

      // Try to load the AppUser from Redis
      let dbUser = await getAppUserById(userId)

      // If we have a freshly authenticated user (first JWT call after login),
      // make sure we "upgrade" whatever is in Redis (including the bare
      // NextAuth adapter user) into our full AppUser shape so that:
      // - Google users and temp users end up identical structurally
      // - createdAt / lastActive / isOnline / isSimUser are always present
      if (user) {
        const provider = account?.provider ?? 'unknown'
        const isSimUser = provider === 'sim-user'
        const now = new Date().toISOString()

        const needsUpgrade =
          !dbUser ||
          !('createdAt' in dbUser) ||
          !('lastActive' in dbUser) ||
          typeof dbUser.isOnline !== 'boolean'

        if (needsUpgrade) {
          const partial: Partial<AppUser> & { id: string } = {
            id: user.id,
            name: user.name ?? dbUser?.name ?? '',
            email: user.email ?? dbUser?.email ?? '',
            image: (user as any).image ?? (dbUser as any)?.image ?? '',
            createdAt: dbUser?.createdAt ?? now,
            lastActive: now,
            isOnline: true,
            isSimUser: dbUser?.isSimUser ?? isSimUser,
          }

          dbUser = await saveAppUser(partial, {
            source: `jwt-${provider}-upgrade`,
          })
        }
      }

      if (!dbUser) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Auth][jwt] No AppUser found for token id', {
            id: userId,
          })
        }
        return token
      }

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
        
        // Check if user is admin:
        // - Google users (real emails) are admins
        // - Sim users (emails ending with @example.com) are regular users
        const email = token.email || ''
        const isSimUser = email.endsWith('@example.com')
        session.user.isAdmin = !isSimUser
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
