# Server Folder Diagram

## The Big Picture

```
server/
│
├── Config (3 files — tells Next.js + TypeScript how to run)
│
├── src/lib/ + src/helpers/ (6 files — reusable building blocks)
│
└── src/app/api/ (8 endpoints — the actual API the phone talks to)
```

---

## Full Tree (annotated)

```
server/
│
│── package.json                 ← "what packages do I need?"
│── tsconfig.json                ← "how should TypeScript work?"
│── next.config.js               ← "how should Next.js work?"
│
└── src/
    │
    ├── app/
    │   │
    │   ├── layout.tsx           ← required by Next.js (boilerplate, ignore)
    │   ├── page.tsx             ← "/" placeholder page (boilerplate, ignore)
    │   │
    │   └── api/                 ← ★ ALL API ROUTES LIVE HERE ★
    │       │                       (file path = URL)
    │       │
    │       ├── health/
    │       │   └── route.ts     → GET /api/health
    │       │                       "is the server alive?"
    │       │
    │       ├── auth/
    │       │   ├── login/
    │       │   │   └── route.ts → POST /api/auth/login
    │       │   │                   "sign in, get a JWT"
    │       │   └── me/
    │       │       └── route.ts → GET /api/auth/me
    │       │                       "who am I?"
    │       │
    │       ├── chat/
    │       │   └── list/
    │       │       └── route.ts → GET /api/chat/list
    │       │                       "what chats am I in?"
    │       │
    │       ├── message/
    │       │   ├── send/
    │       │   │   └── route.ts → POST /api/message/send
    │       │   │                   "send a message"
    │       │   └── list/
    │       │       └── route.ts → GET /api/message/list
    │       │                       "read messages for a chat"
    │       │
    │       ├── profile/
    │       │   └── quiz/
    │       │       └── route.ts → POST + GET /api/profile/quiz
    │       │                       "submit/read onboarding answers"
    │       │
    │       ├── push/
    │       │   └── register/
    │       │       └── route.ts → POST /api/push/register
    │       │                       "save my device token for notifications"
    │       │
    │       └── ranking/
    │           └── route.ts     → POST /api/ranking
    │                               "rank who I'd chat with again"
    │
    ├── lib/                     ← ★ OUR BUILDING BLOCKS ★
    │   │                           (imported by routes, not routes themselves)
    │   │
    │   ├── db.ts                ← creates Redis connection
    │   ├── pusher.ts            ← creates Pusher connection
    │   ├── jwt.ts               ← signToken() + verifyToken()
    │   ├── auth-guard.ts        ← authenticate(req) → user or null
    │   └── user-store.ts        ← upsertUser, getUserById, getUserByEmail
    │
    └── helpers/
        └── redis.ts             ← fetchRedis() — raw REST calls to Redis
```

---

## How Routes Use the Building Blocks

```
Every protected route does this:

    ┌─────────────────────────────────────────────────┐
    │  route.ts                                       │
    │                                                 │
    │  1. authenticate(req)  ←── auth-guard.ts        │
    │         │                      │                │
    │         │                  verifyToken()         │
    │         │                      │                │
    │         │                   jwt.ts              │
    │         ▼                                       │
    │  2. validate input     ←── @groupchat/shared    │
    │     (Zod schemas)          (sendMessageSchema)  │
    │         │                                       │
    │         ▼                                       │
    │  3. read/write data    ←── db.ts (Redis SDK)    │
    │                        ←── redis.ts (REST)      │
    │         │                                       │
    │         ▼                                       │
    │  4. broadcast          ←── pusher.ts            │
    │     (if needed)                                 │
    │         │                                       │
    │         ▼                                       │
    │  5. return ApiResponse                          │
    │     { ok: true, data } or { ok: false, error }  │
    └─────────────────────────────────────────────────┘
```

---

## The Auth Flow (Login → Token → Every Request After)

```
ONCE (at login):

  Phone                         Server
    │                              │
    │  POST /api/auth/login        │
    │  { provider, email, name }   │
    │ ────────────────────────────►│
    │                              │  find/create user in Redis
    │                              │  sign JWT with user ID
    │  { token, user }             │
    │ ◄────────────────────────────│
    │                              │
    │  store token in              │
    │  SecureStore                 │


EVERY REQUEST AFTER:

  Phone                         Server
    │                              │
    │  GET /api/chat/list          │
    │  Authorization: Bearer xxx   │
    │ ────────────────────────────►│
    │                              │  authenticate(req)
    │                              │    → extract "Bearer xxx"
    │                              │    → verifyToken("xxx")
    │                              │    → { sub: "user-id", ... }
    │                              │
    │                              │  use auth.sub for Redis lookups
    │                              │
    │  { ok: true, data: [...] }   │
    │ ◄────────────────────────────│
```

---

## What Lives in Redis (the database)

```
USERS
  user:{id}                    →  { id, name, email, image, ... }    (JSON)
  user:email:{email}           →  "user-id"                          (lookup index)
  users:all                    →  { "id1", "id2", "id3", ... }      (Set of all IDs)
  user:{id}:profile            →  { interests, commStyle, ... }     (JSON)
  user:{id}:group_chats        →  { "chat1", "chat2", ... }         (Set of chat IDs)
  user:{id}:device_tokens      →  { "{token,platform}", ... }       (Set of push tokens)

CHATS
  chat:{chatId}                →  { id, members, active, ... }      (JSON)
  chat:{chatId}:messages       →  [ msg1, msg2, msg3, ... ]         (Sorted Set by timestamp)

CURATION
  curation:pool:active         →  { "id1", "id2", ... }             (users ready for matching)

RANKINGS
  ranking:{chatId}:{userId}    →  { ranking: [...], ... }            (JSON)
  ranking:index:{chatId}       →  { "user1", "user2", ... }         (who ranked this chat)
  ranking:index:user:{userId}  →  { "chat1", "chat2", ... }         (which chats user ranked)
```

---

## One-Liner Per File (cheat sheet)

| File | One-liner |
|---|---|
| `package.json` | Lists dependencies and run scripts |
| `tsconfig.json` | Sets up `@/` import alias and TypeScript rules |
| `next.config.js` | Tells Next.js to compile our shared package |
| `layout.tsx` | Required boilerplate (ignore) |
| `page.tsx` | "/" placeholder (ignore) |
| `lib/db.ts` | Creates the one Redis client instance |
| `lib/pusher.ts` | Creates the one Pusher server instance |
| `lib/jwt.ts` | `signToken()` makes JWTs, `verifyToken()` checks them |
| `lib/auth-guard.ts` | `authenticate(req)` — extracts + verifies Bearer token |
| `lib/user-store.ts` | User CRUD: create, find by ID, find by email |
| `helpers/redis.ts` | `fetchRedis()` — raw HTTP calls to Redis |
| `api/health` | Returns `{ ok: true }` — smoke test |
| `api/auth/login` | Apple/Google sign-in → create user → return JWT |
| `api/auth/me` | Verify token → return user profile |
| `api/chat/list` | Return user's group chats (active/past) |
| `api/message/send` | Validate → save to Redis → broadcast via Pusher |
| `api/message/list` | Read messages from Redis sorted set |
| `api/profile/quiz` | Save/read onboarding quiz, add to curation pool |
| `api/push/register` | Save device push token |
| `api/ranking` | Save end-of-chat ranking + indexes |


