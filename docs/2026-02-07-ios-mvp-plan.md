# iOS App Store MVP — Planning Document

**Date:** 2026-02-07
**Branch:** iOS standalone branch

---

## 1. Business Context & Background

### The College Version (main branch)

The existing app (on `main`) was built for a **research-oriented** model targeting **college students**:

1. **Survey-driven onboarding** — A survey is sent to a limited set of participants (e.g. a college class) to build personality profiles.
2. **Agent simulation** — AI agents are loaded with those personality profiles and interact through the app's group chat features.
3. **Friendship prediction** — Through group chat interactions (messages, rankings, surveys), the system collects data to develop an algorithm that predicts whether two people would be friends *without ever meeting*.
4. **Controlled cohorts** — The user set is small and known (≤100 agents in 5 cohorts of 20). Group chats are rebuilt on a schedule (3-day epochs), with admin-controlled "day advancement."
5. **Key infrastructure:** Next.js 13, Upstash Redis, Pusher (realtime), NextAuth (Google + sim-user credentials), color-coded anonymous messaging, ranking/survey data collection.

### The iOS App Store Version (this branch)

The goal is a **consumer-facing iOS app** that anyone can download from the App Store. The core experience:

- **Groupchats twice a week** — Users are placed into curated small group chats (~5 people) that rotate on a fixed cadence (e.g. Tuesday & Friday).
- **Guided groupchat curation** — The app intelligently decides *who* gets placed with *whom* based on some combination of profile data, past interactions, and eventually the friendship-prediction algorithm.
- **General audience** — Not limited to a single college class. Users sign up organically, so the system must handle onboarding, cold-start, and varying user pool sizes.

---

## 2. Architecture (Implemented)

We gutted the old codebase and restructured into a **clean monorepo** with three packages:

```
/
├── packages/shared/         # Shared types, Zod validations, constants
├── server/                  # Next.js 14 API-only backend
├── mobile/                  # Expo React Native iOS app
├── docs/                    # Planning documents
├── package.json             # npm workspaces root
└── tsconfig.base.json       # Shared TypeScript config
```

### 2.1 — `packages/shared/` (Types & Validations)

Shared TypeScript types and Zod schemas used by both server and mobile:

- **Types:** `AppUser`, `GroupChat`, `Message`, `UserProfile`, `ChatRanking`, `DeviceToken`, `AuthTokenPayload`, `LoginResponse`, API response envelopes (`ApiResponse<T>`)
- **Validations:** `messageSchema`, `sendMessageSchema`, `onboardingQuizSchema`, `chatRankingSchema`, `deviceTokenSchema`
- **Constants:** Chat colors (Green/Yellow/Orange/Red/Violet), hex values, group size (5), chat window (72h), drop schedule (Tue/Fri 6pm), `toPusherKey()` helper

### 2.2 — `server/` (Next.js API Backend)

Stripped-down Next.js 14 that serves ONLY as an API backend (no web frontend). Deployed to Vercel.

**Auth:** Custom JWT (via `jose` library) instead of NextAuth. No cookies, no sessions — pure Bearer token auth.
- `POST /api/auth/login` — Accept Apple/Google identity token → verify → upsert user → issue JWT
- `GET /api/auth/me` — Return current user from Bearer token

**Chat:**
- `GET /api/chat/list` — List user's group chats (filterable by active/past)

**Messages:**
- `POST /api/message/send` — Send a message to a group chat (validates membership, persists to Redis, broadcasts via Pusher)
- `GET /api/message/list` — Fetch messages for a chat (paginated)

**Profile:**
- `POST /api/profile/quiz` — Submit onboarding quiz answers (adds user to curation pool)
- `GET /api/profile/quiz` — Get current quiz/profile data

**Push:**
- `POST /api/push/register` — Register APNs device token

**Rankings:**
- `POST /api/ranking` — Submit end-of-chat "who would you chat with again?" ranking

**Core libs:**
- `src/lib/db.ts` — Upstash Redis client
- `src/lib/pusher.ts` — Pusher server instance
- `src/lib/jwt.ts` — JWT sign/verify (HS256 via jose)
- `src/lib/auth-guard.ts` — `authenticate(req)` helper for all protected routes
- `src/lib/user-store.ts` — User CRUD operations in Redis
- `src/helpers/redis.ts` — Direct Upstash REST API helper

### 2.3 — `mobile/` (Expo React Native App)

Expo SDK 52, expo-router for navigation, zustand for state.

**Screens:**
- `(auth)/login` — Apple Sign-In button + dev login for testing
- `(auth)/onboarding` — 4-step quiz (interests, comm style, age, goal)
- `(tabs)/chat` — Active group chat list with color dot previews
- `(tabs)/history` — Past (expired) group chats
- `(tabs)/profile` — User info + settings + logout
- `chat/[id]` — Full chat screen with color-coded bubbles, optimistic sending, Pusher realtime

**Libraries:**
- `src/lib/api.ts` — HTTP client that auto-attaches Bearer token from SecureStore
- `src/lib/pusher.ts` — Pusher client + `usePusher()` React hook for realtime events
- `src/lib/notifications.ts` — Push notification permission + device token registration
- `src/stores/authStore.ts` — Zustand auth state (token + user in SecureStore)

---

## 3. What Was Removed from College Version

- ❌ All web React components and pages
- ❌ NextAuth (replaced with custom JWT)
- ❌ Google OAuth web flow
- ❌ Agent simulation system (scripts, API routes, LLM integration)
- ❌ Admin dashboard
- ❌ Capacitor iOS shell
- ❌ Friend requests / 1:1 DMs
- ❌ Tailwind / PostCSS / web styling
- ❌ Survey system (replaced with in-app onboarding quiz)
- ❌ Schedule advancement (replaced with automated cron)

---

## 4. What Still Needs to Be Built

### Critical Path (before App Store submission)

- [ ] **Apple identity token verification** — Server-side verification of Apple Sign-In tokens (currently trusts client claims)
- [ ] **Curation engine** — The algorithm that assigns users to groups twice a week
- [ ] **Curation cron job** — Vercel Cron or Upstash QStash trigger for Tue/Fri drops
- [ ] **APNs push notifications** — Actually sending push notifications (server-side APNs integration)
- [ ] **Chat expiration logic** — Auto-close chats after 72 hours
- [ ] **Icebreaker prompts** — Curate or generate conversation starters for new chats
- [ ] **Content moderation** — Apple requires reporting/blocking for UGC apps
- [ ] **App Store assets** — Icon, screenshots, description, privacy policy

### Nice to Have (post-launch)

- [ ] Typing indicators (server infra exists from college version, just wire to mobile)
- [ ] Progressive identity reveal (end-of-chat option to show real name)
- [ ] Streak / engagement tracking
- [ ] V1 curation: interest-based matching from quiz data
- [ ] V2 curation: interaction-data-driven matching (friendship prediction algorithm)

---

## 5. Open Questions

1. **Anonymity model** — Fully anonymous (colors only) like the college version? Or show first names? Or progressive reveal?
2. **Cold start** — What happens when < 5 users have signed up? Waitlist? Smaller groups? AI backfill?
3. **Timezone handling** — Do group chats drop at a fixed time per timezone, or one global time?
4. **Chat prompts** — Who writes the icebreakers? Are they curated, random, or AI-generated?
5. **Retention hooks** — Beyond the twice-weekly cadence, what keeps users coming back?

---

## 6. How to Run

### Server (API backend)
```bash
cd server
cp .env.example .env    # Fill in Upstash Redis, Pusher, JWT_SECRET
npm install
npm run dev             # → http://localhost:3001
```

### Mobile (iOS app)
```bash
cd mobile
npm install
npx expo start          # → Expo dev server, press 'i' for iOS Simulator
```

### Install all workspaces at once (from root)
```bash
npm install             # Installs all workspaces
npm run dev:server      # Start API server
npm run dev:mobile      # Start Expo dev server
```

---

## 7. Environment Variables (Server)

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `PUSHER_APP_ID` | Pusher app ID |
| `NEXT_PUBLIC_PUSHER_APP_KEY` | Pusher app key (also used by mobile client) |
| `PUSHER_APP_SECRET` | Pusher app secret |
| `PUSHER_CLUSTER` | Pusher cluster (default: us2) |
| `JWT_SECRET` | Secret key for signing JWTs |

---

*This document will be updated as decisions are made. Refer back to it at the start of each session.*
