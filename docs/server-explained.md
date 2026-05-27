# Server Explained

A deep walkthrough of every file in `server/`, what each line does, and whether it's framework magic or our application logic.

---

## Layer 0: Config Files (The Stuff Next.js Needs Before Your Code Runs)

### `server/package.json` — What this project is and what it depends on

```json
{
  "name": "@groupchat/server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@groupchat/shared": "*",
    "@upstash/redis": "^1.28.0",
    "jose": "^5.2.0",
    "nanoid": "^5.0.0",
    "next": "14.1.0",
    "pusher": "^5.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.0"
  }
}
```

- **`"scripts"`** — commands you run in the terminal:
  - `npm run dev` → starts the server in development mode on port 3001 (hot reload, error overlays)
  - `npm run build` → creates an optimized production build
  - `npm run start` → runs the production build
  - `npm run typecheck` → checks for TypeScript errors without building anything (`--noEmit`)
- **`"dependencies"`** — the packages our code actually imports at runtime:
  - `@groupchat/shared` — our shared types. The `*` means "whatever version is in the workspace"
  - `@upstash/redis` — Redis client SDK
  - `jose` — JWT signing/verification
  - `nanoid` — generates short random IDs (like `V1StGXR8_Z5jdHi6B`) for messages
  - `next` — the Next.js framework itself
  - `pusher` — Pusher **server** SDK (the one that can trigger events, uses the secret key)
  - `react`, `react-dom` — Next.js requires these even for API-only usage (it's built on React)
  - `zod` — runtime validation
- **`"devDependencies"`** — only needed during development, not at runtime:
  - `@types/*` — TypeScript type definitions for Node.js and React
  - `typescript` — the TypeScript compiler

### `server/tsconfig.json` — How TypeScript is configured

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@groupchat/shared": ["../packages/shared/src"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

The two lines that matter most for understanding the code:

- **`"@/*": ["./src/*"]`** — This is a **path alias**. When you see `import { db } from '@/lib/db'` in the code, TypeScript (and Next.js) know that `@/` means `./src/`. It's a shortcut so you don't write `../../lib/db` with relative paths everywhere. **We chose** the `@/` prefix — it's not special to TypeScript. Some people use `~/` or `#/`.
- **`"@groupchat/shared": ["../packages/shared/src"]`** — Tells TypeScript where to find our shared package's source code for type checking.

### `server/next.config.js` — Next.js configuration

```js
const nextConfig = {
  transpilePackages: ['@groupchat/shared'],
}
module.exports = nextConfig
```

- **`transpilePackages`** — **Next.js config option**. Normally Next.js only compiles code inside its own `src/` folder. Our `@groupchat/shared` package is *outside* the server folder and contains raw `.ts` files. This tells Next.js "compile that package too."

### `server/src/app/layout.tsx` and `page.tsx` — Required boilerplate

```tsx
// layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

- **Next.js requires `layout.tsx`** at the root of `app/`. Even though we only care about API routes, Next.js won't start without it. This is the minimum valid layout — just wraps children in `<html><body>`.
- **`{ children }`** is a **React concept** — it's whatever page/content is being rendered inside this layout.

```tsx
// page.tsx
export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 40 }}>
      <h1>GroupChat API</h1>
      <p>This server provides the API for the GroupChat iOS app.</p>
      <p><code>GET /api/health</code> — health check</p>
    </div>
  )
}
```

- This is what shows if you visit `http://localhost:3001/` in a browser. Just a placeholder. The mobile app never hits this — it only talks to `/api/*` routes.

---

## Layer 1: Foundation Libraries (`src/lib/` and `src/helpers/`)

These files are **not** API routes. They're utility modules that the routes import. Next.js doesn't know about them — they're just regular TypeScript files we organized into folders.

### `src/lib/db.ts` — The Redis Connection

```ts
import { Redis } from '@upstash/redis'

export const db = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

- **`Redis`** — A class from the **Upstash SDK**. You construct it with your credentials and get back an object (`db`) with methods like `.set()`, `.get()`, `.sadd()`, `.zadd()`, etc.
- **`process.env.UPSTASH_REDIS_REST_URL`** — **Node.js standard**. `process.env` is a dictionary of environment variables. These values come from a `.env` file locally or from your hosting platform (Vercel) in production.
- **The `!` suffix** — **TypeScript syntax** called "non-null assertion." It tells TypeScript "trust me, this value exists." Without it, TypeScript would complain that the env var might be `undefined`.
- **`export const db`** — We create a single Redis instance and export it. Every file that does `import { db } from '@/lib/db'` gets the **same instance**. This is important — you don't want to create a new connection for every request.

### `src/lib/pusher.ts` — The Pusher Connection

```ts
import PusherServer from 'pusher'

export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
  secret: process.env.PUSHER_APP_SECRET!,
  cluster: process.env.PUSHER_CLUSTER ?? 'us2',
  useTLS: true,
})
```

- **`PusherServer`** — The class from the **`pusher` npm package** (note: this is the *server* SDK, different from `pusher-js` which is the *client* SDK the mobile app uses). The server SDK can **trigger events** (broadcast to channels). The client SDK can only **listen**.
- **`appId`, `key`, `secret`** — Pusher gives you these when you create an app on their dashboard. The `secret` is the critical one — it lets you send events. It must never appear in client-side code.
- **`NEXT_PUBLIC_` prefix** — **Next.js convention**. Env vars starting with `NEXT_PUBLIC_` are exposed to both server and client code. We named the key this way because the mobile app also needs the same Pusher key (but not the secret).
- **`??` (nullish coalescing)** — **JavaScript operator**. "Use the left value, but if it's `null` or `undefined`, fall back to the right value." So if `PUSHER_CLUSTER` isn't set, it defaults to `'us2'`.

### `src/helpers/redis.ts` — Raw Redis REST Calls

```ts
const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
const authToken = process.env.UPSTASH_REDIS_REST_TOKEN

type Command =
  | 'zrange' | 'sismember' | 'get' | 'smembers'
  | 'keys' | 'del' | 'sadd' | 'set'

export async function fetchRedis(
  command: Command,
  ...args: (string | number)[]
) {
  if (!upstashRedisRestUrl || !authToken) {
    throw new Error('Missing Upstash Redis configuration.')
  }

  const encodedArgs = args.map((arg) => encodeURIComponent(String(arg)))
  const commandUrl = `${upstashRedisRestUrl}/${command}/${encodedArgs.join('/')}`

  const response = await fetch(commandUrl, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Redis command failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.result
}
```

**Why does this exist when we already have `db`?** Two different ways to talk to the same Redis database:

- **`db` (the SDK)** — Convenient methods, but it auto-parses JSON responses. If you stored a JSON string like `'{"name":"Dan"}'`, the SDK gives you back `{name: "Dan"}` (an object). Sometimes we want the raw string.
- **`fetchRedis` (raw REST)** — Makes HTTP calls directly to Upstash's REST API. Returns the raw string, giving us full control over parsing.

How the REST API works: Upstash exposes every Redis command as a URL. To run `GET user:abc123`, you call:
```
https://your-redis.upstash.io/get/user%3Aabc123
```
The URL is: `base_url / command / arg1 / arg2 / ...`

- **`type Command`** — **Our TypeScript type** that restricts which Redis commands we use. A union of string literals. If someone tried to call `fetchRedis('FLUSHALL')` TypeScript would catch it at compile time.
- **`...args: (string | number)[]`** — **TypeScript rest parameter**. The `...` means "accept any number of additional arguments." So `fetchRedis('zrange', 'key', 0, -1)` works — the args are `['key', 0, -1]`.
- **`encodeURIComponent`** — **JavaScript built-in**. Escapes special characters for URLs. Our Redis keys have colons (`user:abc123`), which need to become `user%3Aabc123` in a URL.
- **`cache: 'no-store'`** — **Fetch API option**. Tells the runtime "never cache this response." Important because Redis data changes constantly — we always want fresh reads.

### `src/lib/jwt.ts` — Signing and Verifying Tokens

```ts
import { SignJWT, jwtVerify } from 'jose'
import type { AuthTokenPayload } from '@groupchat/shared'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
)

const TOKEN_EXPIRY = '30d'

export async function signToken(payload: {
  sub: string
  email: string
  name: string
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyToken(
  token: string,
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as AuthTokenPayload
  } catch {
    return null
  }
}
```

Two functions, each does one thing:

**`signToken`** — Creates a new JWT. Called once during login. The chain works like this:
1. `new SignJWT(payload)` — **jose class**. Creates a builder with our data (`sub`, `email`, `name`) inside the token.
2. `.setProtectedHeader({ alg: 'HS256' })` — **jose method**. Every JWT has a header that says which algorithm was used to sign it. `HS256` = HMAC-SHA256 (a symmetric algorithm — same secret signs and verifies).
3. `.setIssuedAt()` — **jose method**. Stamps the current time into the `iat` (issued at) claim.
4. `.setExpirationTime('30d')` — **jose method**. Sets the `exp` claim to 30 days from now. After that, `verifyToken` will reject it.
5. `.sign(JWT_SECRET)` — **jose method**. Actually performs the cryptographic signing. Returns a string like `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOi...`

**`verifyToken`** — Decodes and validates an existing JWT. Called on every authenticated request.
1. `jwtVerify(token, JWT_SECRET)` — **jose function**. Checks: is the signature valid? Is it expired? Was it signed with our secret? If any check fails, it throws.
2. The `try/catch` means invalid tokens return `null` instead of crashing the server.
3. `payload as unknown as AuthTokenPayload` — **TypeScript casting**. jose returns a generic payload type. We cast it to our specific `AuthTokenPayload` type (which has `sub`, `email`, `name`, `iat`, `exp`).

### `src/lib/auth-guard.ts` — The Authentication Middleware

```ts
import { verifyToken } from './jwt'
import type { AuthTokenPayload } from '@groupchat/shared'

export async function authenticate(
  req: Request,
): Promise<AuthTokenPayload | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  return verifyToken(token)
}
```

This is the **single most important function in the server**. Every protected route starts by calling it. Here's what each line does:

1. **`req.headers.get('authorization')`** — Reads the `Authorization` HTTP header from the incoming request. The mobile app's API client sets this to `Bearer eyJhbGciOi...`
2. **`authHeader?.startsWith('Bearer ')`** — The `?.` is **optional chaining** (JavaScript). If `authHeader` is null, this short-circuits to `null` instead of crashing. `startsWith` checks that the header follows the `Bearer <token>` format.
3. **`authHeader.slice(7)`** — `'Bearer '.length` is 7. This strips the prefix to get just the raw JWT string.
4. **`verifyToken(token)`** — Calls our jwt.ts function. Returns the decoded payload (with `sub`, `email`, etc.) or `null` if the token is invalid/expired.

The return type `AuthTokenPayload | null` means: either we know who the user is, or we don't. Every route checks:
```ts
const auth = await authenticate(req)
if (!auth) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
// If we get here, auth.sub is the user's ID
```

### `src/lib/user-store.ts` — User CRUD

```ts
import { db } from './db'
import { fetchRedis } from '@/helpers/redis'
import type { AppUser } from '@groupchat/shared'

const USERS_ALL_KEY = 'users:all'

function nowIso() {
  return new Date().toISOString()
}

export async function upsertUser(
  partial: Partial<AppUser> & Pick<AppUser, 'id'>,
): Promise<AppUser> {
  const user: AppUser = {
    id: partial.id,
    name: partial.name ?? '',
    email: partial.email ?? '',
    image: partial.image ?? '',
    createdAt: partial.createdAt ?? nowIso(),
    lastActive: partial.lastActive ?? nowIso(),
    isOnline: partial.isOnline ?? true,
    timezone: partial.timezone,
  }

  await Promise.all([
    db.set(`user:${user.id}`, JSON.stringify(user)),
    db.sadd(USERS_ALL_KEY, user.id),
    user.email ? db.set(`user:email:${user.email}`, user.id) : Promise.resolve(),
  ])

  return user
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const raw = (await fetchRedis('get', `user:${id}`)) as string | null
  if (!raw) return null
  try {
    return JSON.parse(raw) as AppUser
  } catch {
    return null
  }
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const id = (await fetchRedis('get', `user:email:${email}`)) as string | null
  if (!id) return null
  return getUserById(id)
}

export async function getAllUserIds(): Promise<string[]> {
  return ((await fetchRedis('smembers', USERS_ALL_KEY)) as string[] | null) ?? []
}
```

**`upsertUser`** — "Upsert" means "insert or update." If the user exists, it overwrites. If not, it creates.

- **`Partial<AppUser> & Pick<AppUser, 'id'>`** — **TypeScript utility types.** `Partial<AppUser>` makes every field optional. `Pick<AppUser, 'id'>` means `id` is required. Combined: "you must provide `id`, everything else is optional."
- **`partial.name ?? ''`** — If the caller didn't provide a name, default to empty string.
- **Three Redis operations in parallel:**
  1. `db.set(`user:${id}`, ...)` — Store the full user JSON under their ID key
  2. `db.sadd('users:all', id)` — Add their ID to the master set of all users (`sadd` = "set add" — adds to a Redis Set, which only stores unique values)
  3. `db.set(`user:email:${email}`, id)` — Create an email → ID index so we can look up users by email
- **`Promise.all([...])`** — **JavaScript standard**. Runs all three operations simultaneously instead of waiting for each one to finish before starting the next. Faster.

**`getUserByEmail`** — A two-step lookup. First reads the email index to get the ID, then reads the user by ID. This is a common pattern in key-value databases that don't have SQL-style queries.

---

## Layer 2: The API Routes

Every route follows the same pattern:
1. Authenticate (except login and health)
2. Validate the input
3. Do the business logic (read/write Redis, trigger Pusher)
4. Return `ApiResponse<T>`

### How Next.js File-Based Routing Works

The file path determines the URL:

| File Path | URL |
|---|---|
| `src/app/api/health/route.ts` | `GET /api/health` |
| `src/app/api/auth/login/route.ts` | `POST /api/auth/login` |
| `src/app/api/auth/me/route.ts` | `GET /api/auth/me` |
| `src/app/api/chat/list/route.ts` | `GET /api/chat/list` |
| `src/app/api/message/send/route.ts` | `POST /api/message/send` |
| `src/app/api/message/list/route.ts` | `GET /api/message/list` |
| `src/app/api/profile/quiz/route.ts` | `GET & POST /api/profile/quiz` |
| `src/app/api/push/register/route.ts` | `POST /api/push/register` |
| `src/app/api/ranking/route.ts` | `POST /api/ranking` |

Rules:
- Every API endpoint is a file called **`route.ts`** (Next.js keyword filename)
- The HTTP method is determined by the **exported function name**: `export async function GET()` handles GET, `export async function POST()` handles POST, etc.
- The folder path = the URL path

### `GET /api/health` — Smoke Test

```ts
export async function GET() {
  return Response.json({ ok: true, timestamp: Date.now() })
}
```

The simplest possible route. No auth, no input. Just "yes, the server is alive." Useful for monitoring and deployment checks.

- **`Response.json()`** — **Web standard API** (not Next.js-specific). Creates an HTTP response with a JSON body.
- **`Date.now()`** — **JavaScript built-in**. Returns the current time as milliseconds since January 1, 1970.

### `POST /api/auth/login` — Where Users Enter the System

```ts
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { provider } = body

    let email: string
    let name: string
    let image = ''

    if (provider === 'apple') {
      // TODO: Verify Apple identity token
      email = body.email
      name = body.name ?? ''
    } else if (provider === 'google') {
      // TODO: Verify Google identity token
      email = body.email
      name = body.name ?? ''
      image = body.image ?? ''
    } else if (provider === 'dev' && process.env.NODE_ENV === 'development') {
      email = body.email
      name = body.name ?? 'Dev User'
      image = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(email)}`
    } else {
      return Response.json(
        { ok: false, error: 'Unsupported auth provider' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    if (!email) {
      return Response.json(
        { ok: false, error: 'Email is required' } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    // Find or create user
    let user = await getUserByEmail(email)

    if (!user) {
      const userId = crypto.randomUUID()
      user = await upsertUser({ id: userId, name, email, image })
    } else {
      user = await upsertUser({
        ...user,
        name: name || user.name,
        image: image || user.image,
        lastActive: new Date().toISOString(),
        isOnline: true,
      })
    }

    // Issue JWT
    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    })

    const response: ApiResponse<LoginResponse> = {
      ok: true,
      data: { token, user },
    }

    return Response.json(response)
  } catch (error) {
    console.error('[auth/login] Error:', error)
    return Response.json(
      { ok: false, error: 'Login failed' } satisfies ApiResponse<never>,
      { status: 500 },
    )
  }
}
```

This is the **only unprotected route** (besides health). It's the entry point — you can't have a token before you log in. Step by step:

1. **`req.json()`** — **Web standard**. Parses the JSON request body. The mobile app sent `{ provider: 'apple', email: '...', name: '...' }`.
2. **Provider branching** — Determines which auth provider the client used. Right now it trusts the client's claims for Apple/Google (the TODOs are where server-side verification should go). The `'dev'` provider only works when `NODE_ENV === 'development'` — it's a shortcut for testing without real Apple Sign-In.
3. **`crypto.randomUUID()`** — **Web standard API**. Generates a UUID like `550e8400-e29b-41d4-a716-446655440000`. This is the user's permanent ID in our system.
4. **`getUserByEmail` → `upsertUser`** — If this email has logged in before, update them. If not, create a new user. The `...user` spread in the update case means "keep all existing fields, but overwrite these specific ones."
5. **`signToken({ sub: user.id, ... })`** — Mint a JWT. The `sub` claim is set to the user's ID — this is what `auth.sub` returns in every protected route.
6. **Return `{ token, user }`** — The mobile app stores the token in SecureStore and the user in zustand.
7. **`satisfies ApiResponse<never>`** — **TypeScript keyword** (`satisfies`). It type-checks that the object literal matches our `ApiResponse` shape without changing the inferred type. `never` means "there's no data in this error response."

### `GET /api/auth/me` — "Who Am I?"

```ts
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) {
    return Response.json(
      { ok: false, error: 'Unauthorized' } satisfies ApiResponse<never>,
      { status: 401 },
    )
  }

  const user = await getUserById(auth.sub)
  if (!user) {
    return Response.json(
      { ok: false, error: 'User not found' } satisfies ApiResponse<never>,
      { status: 404 },
    )
  }

  const response: ApiResponse<AppUser> = { ok: true, data: user }
  return Response.json(response)
}
```

A simple "verify my token and give me my profile" endpoint. The mobile app could call this on startup to check if the stored token is still valid, or to get a fresh copy of the user's profile.

**`auth.sub`** — Remember, `sub` is the user ID that was baked into the JWT during login. We use it to look up the full user record from Redis.

### `GET /api/chat/list` — User's Group Chats

```ts
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) { /* 401 */ }

  const url = new URL(req.url)
  const activeFilter = url.searchParams.get('active')

  const chatIds = ((await fetchRedis(
    'smembers',
    `user:${auth.sub}:group_chats`,
  )) as string[] | null) ?? []

  if (!chatIds.length) {
    return Response.json({ ok: true, data: [] } satisfies ApiResponse<GroupChat[]>)
  }

  const chats: GroupChat[] = []

  for (const chatId of chatIds) {
    const raw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!raw) continue
    try {
      const chat = JSON.parse(raw) as GroupChat
      if (activeFilter === 'true' && !chat.active) continue
      if (activeFilter === 'false' && chat.active) continue
      chats.push(chat)
    } catch { }
  }

  chats.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return b.createdAt - a.createdAt
  })

  return Response.json({ ok: true, data: chats } satisfies ApiResponse<GroupChat[]>)
}
```

1. **`new URL(req.url).searchParams.get('active')`** — **Web standard**. Parses query parameters from the URL. If the request is `/api/chat/list?active=true`, this returns `'true'`.
2. **`fetchRedis('smembers', `user:${auth.sub}:group_chats`)`** — `smembers` is a **Redis command** that returns all members of a Set. The key `user:abc123:group_chats` is **our naming convention** — it's a Set of chat IDs that this user belongs to. The curation engine (not built yet) will populate this when it assigns users to groups.
3. **For each chat ID**, it reads the full chat object from Redis (`chat:group_xyz`), parses it, and optionally filters by `active` status.
4. **Sorting** — Active chats first, then newest first within each group.

### `POST /api/message/send` — The Core Action

```ts
export async function POST(req: Request) {
  try {
    const auth = await authenticate(req)
    if (!auth) { /* 401 */ }

    const body = await req.json()
    const parsed = sendMessageSchema.safeParse(body)
    if (!parsed.success) { /* 400 */ }

    const { chatId, text, clientId } = parsed.data

    // Verify user is a member of this chat
    const chatRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
    if (!chatRaw) { /* 404 */ }

    const chat = JSON.parse(chatRaw)
    if (!chat.members?.includes(auth.sub)) { /* 403 */ }

    if (chat.active === false) { /* 403 - expired */ }

    const timestamp = Date.now()
    const message: Message = {
      id: clientId || nanoid(),
      senderId: auth.sub,
      text,
      timestamp,
    }

    messageSchema.parse(message)

    // Persist to Redis
    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    })

    // Broadcast via Pusher
    const channelName = toPusherKey(`chat:${chatId}`)
    await pusherServer.trigger(channelName, 'incoming-message', message)

    // TODO: Trigger push notification for offline members

    return Response.json({ ok: true, data: message } satisfies ApiResponse<Message>)
  } catch (error) { /* 500 */ }
}
```

This is the most complex route. Every decision explained:

1. **Zod validation** — `sendMessageSchema.safeParse(body)` checks that the body has `chatId` (string), `text` (1–5000 chars), and optionally `clientId`. If validation fails, the user gets a 400. `.safeParse()` is a **Zod method** that returns `{ success: true, data }` or `{ success: false, error }` without throwing.
2. **Membership check** — Reads the chat from Redis and checks if `auth.sub` (the requester's ID) is in the `members` array. This prevents people from sending messages to chats they're not in.
3. **Active check** — If the chat has expired (`active === false`), reject the message with 403.
4. **`clientId || nanoid()`** — If the mobile app sent a `clientId` (for optimistic updates), use it. Otherwise generate a new random ID with **nanoid** (a library that generates URL-safe IDs like `V1StGXR8_Z5jdHi6B-aRjq`).
5. **`senderId: auth.sub`** — The sender is always the authenticated user. The client can't fake this — it's extracted from the verified JWT.
6. **`messageSchema.parse(message)`** — A second validation pass on the constructed message. `.parse()` (unlike `.safeParse()`) **throws** if validation fails — the `catch` block at the bottom would turn it into a 500.
7. **`db.zadd(...)`** — **Upstash SDK method** wrapping the Redis `ZADD` command. Stores the message in a Redis Sorted Set. The `score` is the timestamp, `member` is the JSON string. Sorted Sets keep everything ordered by score automatically, so when we read messages back with `zrange`, they come in chronological order.
8. **`pusherServer.trigger(...)`** — **Pusher SDK method**. Broadcasts the message to every phone that has this chat open via their `usePusher` hook. `channelName` and `'incoming-message'` are strings **we chose**.

### `GET /api/message/list` — Reading Messages Back

```ts
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (!auth) { /* 401 */ }

  const url = new URL(req.url)
  const chatId = url.searchParams.get('chatId')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)

  if (!chatId) { /* 400 */ }

  // Verify membership
  const chatRaw = (await fetchRedis('get', `chat:${chatId}`)) as string | null
  const chat = JSON.parse(chatRaw)
  if (!chat.members?.includes(auth.sub)) { /* 403 */ }

  const rawMessages = (await fetchRedis(
    'zrange',
    `chat:${chatId}:messages`,
    0,
    -1,
  )) as string[]

  const messages: Message[] = []
  for (const raw of rawMessages ?? []) {
    try {
      messages.push(JSON.parse(raw) as Message)
    } catch { }
  }

  messages.sort((a, b) => a.timestamp - b.timestamp)
  const sliced = messages.slice(-limit)

  return Response.json({ ok: true, data: sliced } satisfies ApiResponse<Message[]>)
}
```

1. **`Math.min(parseInt(...), 200)`** — Parses the `limit` query param and caps it at 200. Prevents a client from requesting a million messages.
2. **`fetchRedis('zrange', key, 0, -1)`** — `zrange` is a **Redis command** that returns members of a Sorted Set within a range. `0` to `-1` means "from the first to the last" (i.e., everything). Redis returns them in score order (which is timestamp order for us).
3. **`messages.slice(-limit)`** — **JavaScript array method**. Negative argument means "take from the end." `slice(-50)` returns the last 50 messages.

### `POST /api/profile/quiz` and `GET /api/profile/quiz` — Onboarding

```ts
// POST — submit quiz
export async function POST(req: Request) {
  const auth = await authenticate(req)
  // ...validate with onboardingQuizSchema...

  const profile: UserProfile = {
    userId: auth.sub,
    interests: parsed.data.interests,
    commStyle: parsed.data.commStyle,
    quizAnswers: parsed.data as Record<string, unknown>,
    completedAt: new Date().toISOString(),
  }

  await Promise.all([
    db.set(`user:${auth.sub}:profile`, JSON.stringify(profile)),
    db.sadd('curation:pool:active', auth.sub),
  ])

  return Response.json({ ok: true, data: profile })
}

// GET — read quiz back
export async function GET(req: Request) {
  const auth = await authenticate(req)
  // ...read `user:${auth.sub}:profile` from Redis, return profile or null...
}
```

This is the **only route with both GET and POST** in the same file. Next.js allows this — it dispatches based on the HTTP method.

The key line is **`db.sadd('curation:pool:active', auth.sub)`** — when a user completes onboarding, their ID is added to the **curation pool**. This is the Set of users who are eligible to be placed into group chats. The curation engine (which we haven't built yet) will read this Set when it creates new groups.

### `POST /api/push/register` — Device Token Registration

```ts
export async function POST(req: Request) {
  const auth = await authenticate(req)
  // ...validate with deviceTokenSchema...

  await db.sadd(`user:${auth.sub}:device_tokens`, JSON.stringify({
    token: parsed.data.token,
    platform: parsed.data.platform,
    createdAt: new Date().toISOString(),
  }))

  return Response.json({ ok: true, data: { registered: true } })
}
```

When the mobile app gets push notification permission from iOS, it receives a **device token** (a string that identifies this specific device for push notifications). The app sends that token here, and we store it in Redis as a Set under the user's ID. One user can have multiple devices (phone + iPad), so it's a Set not a single value.

Later, when we implement actual push notification sending, the server will read these tokens and use Apple's Push Notification Service (APNs) to send notifications.

### `POST /api/ranking` — End-of-Chat Vibe Check

```ts
export async function POST(req: Request) {
  const auth = await authenticate(req)
  // ...validate with chatRankingSchema...
  // ...verify membership...

  const chatRanking: ChatRanking = {
    userId: auth.sub,
    chatId,
    ranking,
    submittedAt: Date.now(),
  }

  await Promise.all([
    db.set(`ranking:${chatId}:${auth.sub}`, JSON.stringify(chatRanking)),
    db.sadd(`ranking:index:${chatId}`, auth.sub),
    db.sadd(`ranking:index:user:${auth.sub}`, chatId),
  ])

  return Response.json({ ok: true, data: chatRanking })
}
```

When a chat expires, users rank the other members ("who would you want to chat with again?"). Three things get stored:

1. **`ranking:${chatId}:${userId}`** — The actual ranking data (who they ranked and in what order)
2. **`ranking:index:${chatId}`** — "Which users submitted rankings for this chat?" (so the curation engine can pull all rankings for a chat)
3. **`ranking:index:user:${userId}`** — "Which chats has this user submitted rankings for?" (so the curation engine can see a user's full history)

This is how you do "indexes" in a key-value store. There's no SQL `WHERE` clause — you build lookup tables yourself.

---

## The Redis Key Map

Every Redis key the server uses, all in one place:

| Key Pattern | Redis Type | Purpose |
|---|---|---|
| `user:${id}` | String (JSON) | Full user record |
| `user:email:${email}` | String | Maps email → user ID |
| `users:all` | Set | All user IDs in the system |
| `user:${id}:profile` | String (JSON) | Onboarding quiz answers |
| `user:${id}:group_chats` | Set | Chat IDs the user is in |
| `user:${id}:device_tokens` | Set | Push notification tokens |
| `chat:${chatId}` | String (JSON) | Full group chat record |
| `chat:${chatId}:messages` | Sorted Set | Messages, scored by timestamp |
| `curation:pool:active` | Set | Users eligible for next group assignment |
| `ranking:${chatId}:${userId}` | String (JSON) | One user's ranking for one chat |
| `ranking:index:${chatId}` | Set | Which users ranked this chat |
| `ranking:index:user:${userId}` | Set | Which chats this user ranked |

---

## Summary

The server is **8 API endpoints + 5 utility modules + 3 config files**.

The utility modules do the heavy lifting (auth, Redis, Pusher). The routes are thin wrappers that validate input, call the utilities, and return responses.

Every protected route follows the exact same pattern:
```ts
export async function POST(req: Request) {
  // 1. Authenticate
  const auth = await authenticate(req)
  if (!auth) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  // 2. Validate input
  const parsed = someSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ ok: false, error: '...' }, { status: 400 })

  // 3. Business logic (Redis reads/writes, Pusher triggers)
  // ...

  // 4. Return typed response
  return Response.json({ ok: true, data: result } satisfies ApiResponse<SomeType>)
}
```


