# GroupChat iOS — Master Task List

**Created:** 2026-02-14
**Approach:** Each task is a single thing you can verify on your phone or in a curl command. Expect bugs at every step — that's why they're small.

---

## Layer 0 — Dev Tooling (test at scale)

The goal: be able to create 20 users and 4 group chats with one command, then log in as any of them from your phone.

### Server endpoints
- [ ] `POST /api/dev/seed` — Create N test users (default 20) with predictable IDs (`test-user-1` through `test-user-20`)
- [ ] `POST /api/dev/seed` — Also creates group chats (groups of 5) with color assignments, icebreakers, and 72h expiry
- [ ] `POST /api/dev/login-as` — Accept `{ userId }`, return JWT + user (no password)
- [ ] `GET /api/dev/users` — List all test users (id, name, email)
- [ ] `DELETE /api/dev/seed` — Wipe all test users, their chats, messages, and rankings
- [ ] Verify: `curl -X POST .../api/dev/seed` returns users and chats
- [ ] Verify: `curl -X POST .../api/dev/login-as -d '{"userId":"test-user-1"}'` returns a valid JWT
- [ ] Verify: Use that JWT to `GET /api/chat/list` and see the seeded chats

### Mobile dev login screen
- [ ] Replace the current "Dev Login" button with a dev user picker screen
- [ ] Screen calls `GET /api/dev/users` and shows a scrollable list of test users
- [ ] Tapping a user calls `POST /api/dev/login-as` with that user's ID
- [ ] Token + user stored in SecureStore, navigates to chat tab
- [ ] Add a "Seed Users" button at the top that calls `POST /api/dev/seed`
- [ ] Add a "Reset All" button that calls `DELETE /api/dev/seed`
- [ ] Verify on phone: open app → tap "Seed Users" → see list populate → tap a user → land on chat tab

---

## Layer 1 — Core Chat Loop

The goal: open the app, see your group chats, tap into one, send a message, and see it appear on another user's screen in real-time.

### Chat list screen (`(tabs)/chat.tsx`)
- [ ] Screen loads and calls `GET /api/chat/list?active=true`
- [ ] Each chat card shows: color dots for members, member count, icebreaker preview, expiry date
- [ ] Verify on phone: after seeding, log in as test-user-1 → see chat card(s) on the chat tab
- [ ] Pull-to-refresh reloads the chat list
- [ ] Empty state shows "No active chats" message when user has no chats
- [ ] Loading spinner shows while fetching

### Chat detail screen (`chat/[id].tsx`)
- [ ] Tapping a chat card navigates to the chat screen
- [ ] Chat screen calls `GET /api/message/list?chatId=xxx` and renders messages
- [ ] Icebreaker banner shows at the top of the chat
- [ ] Chat screen loads the chat metadata (need `GET /api/chat/:id` endpoint or embed in message list response)
- [ ] Verify on phone: tap into a chat → see the icebreaker → empty message list

### Sending messages
- [ ] Type a message and tap send → message appears immediately (optimistic)
- [ ] Message persists to Redis (verify via `GET /api/message/list`)
- [ ] Send button is disabled when text is empty
- [ ] Text input clears after sending
- [ ] Verify on phone: send a message → close the chat → reopen → message is still there

### Real-time (Pusher)
- [ ] Pusher client connects when chat screen opens
- [ ] Pusher client disconnects when chat screen closes
- [ ] Log in as test-user-1 on your phone, log in as test-user-2 via curl
- [ ] Send a message as test-user-2 via curl → see it appear on your phone instantly
- [ ] Verify: no duplicate messages when Pusher event + API response both arrive

### Color-coded messages
- [ ] Your own messages appear on the right side (indigo or your assigned color)
- [ ] Other users' messages appear on the left with their assigned color
- [ ] Color label ("Green", "Red", etc.) shows above the first message in a burst from another user
- [ ] Light colors (Green, Yellow) use black text; dark colors (Red, Violet, Orange) use white text
- [ ] Verify on phone: send messages as 2 different users → see different colors

---

## Layer 2 — Onboarding Flow

The goal: a new user who has never used the app goes through the quiz before seeing any chats.

### Quiz screens (`(auth)/onboarding.tsx`)
- [ ] Step 1: Interest picker (tap chips, up to 5) — "Next" enabled when ≥1 selected
- [ ] Step 2: Communication style picker (5 options) — "Next" enabled when one selected
- [ ] Step 3: Age range picker — "Next" enabled when one selected
- [ ] Step 4: Chat goal picker — "Let's go!" enabled when one selected
- [ ] Progress dots at the top update as you advance
- [ ] "Back" button works on steps 2–4
- [ ] Verify on phone: walk through all 4 steps without crashes

### Quiz submission
- [ ] Tapping "Let's go!" calls `POST /api/profile/quiz` with the answers
- [ ] Server validates with `onboardingQuizSchema` and stores in Redis
- [ ] User is added to `curation:pool:active` set
- [ ] On success, user navigates to chat tab
- [ ] Verify: complete quiz → check Redis for `user:{id}:profile` key

### Routing logic
- [ ] First-time user (no quiz completed) → routed to onboarding after login
- [ ] Returning user (quiz already completed) → routed to chat tab after login
- [ ] Verify on phone: log in as a new test user → see onboarding. Log in as one who completed it → see chat tab.

---

## Layer 3 — Chat Lifecycle

The goal: chats have a visible lifespan. They expire, become read-only, and move to history.

### Expiration display
- [ ] Chat card shows "Expires in X hours" or "Expires tomorrow" (relative time)
- [ ] Chat detail screen shows expiry in the header or a banner
- [ ] Expired chat card shows "Ended" label instead of expiry time

### Chat expiration logic (server)
- [ ] Add `GET /api/chat/:id` endpoint that returns full chat metadata
- [ ] Message send endpoint rejects messages to expired chats (already coded, verify it works)
- [ ] Add a `POST /api/dev/expire-chat` endpoint to manually expire a chat for testing
- [ ] Verify: expire a chat via curl → try to send a message → get 403

### Read-only expired chats (mobile)
- [ ] Expired chat hides the input bar
- [ ] Expired chat shows a banner: "This chat has ended"
- [ ] Messages are still readable (scroll through history)
- [ ] Verify on phone: expire a chat → reopen it → see read-only state

### History tab (`(tabs)/history.tsx`)
- [ ] Calls `GET /api/chat/list?active=false` and shows expired chats
- [ ] Tapping an expired chat opens it in read-only mode
- [ ] Verify on phone: expire a chat → switch to History tab → see it there

### End-of-chat ranking
- [ ] When a chat expires, show a "Rate your groupmates" prompt
- [ ] Ranking UI: drag-to-reorder or tap-to-rank the other members by color
- [ ] Submit calls `POST /api/ranking` with the ordered list
- [ ] After submitting, ranking prompt disappears
- [ ] Verify on phone: expire a chat → see ranking prompt → submit → see it saved in Redis

---

## Layer 4 — Curation Engine

The goal: an algorithm creates group chats automatically from the user pool.

### Core algorithm (server)
- [ ] `POST /api/curation/run` — Reads users from `curation:pool:active`, creates groups
- [ ] Shuffles users randomly (V0 — no matching intelligence yet)
- [ ] Anti-repeat: don't put users together who were in the same chat in the last 2 cycles
- [ ] Assign colors, set 72h expiry, pick an icebreaker
- [ ] Store curation history: `curation:history:{userId}` tracks recent groupmates
- [ ] Handles remainder users (< groupSize) gracefully: skip them or make a smaller group
- [ ] Returns created chats
- [ ] Verify: seed 20 users, run curation → get 4 chats with no repeat pairings

### Manual trigger (for testing)
- [ ] Add "Run Curation" button to mobile dev screen
- [ ] Button calls `POST /api/curation/run`
- [ ] Shows toast: "Created X group chats"
- [ ] Verify on phone: tap Run Curation → switch to Chat tab → see new chats

### Automated scheduling (cron)
- [ ] Create `POST /api/curation/cron` endpoint with a secret key check
- [ ] Set up Vercel Cron (or Upstash QStash) to hit it on Tue/Fri at 6pm
- [ ] Cron also expires old chats before creating new ones
- [ ] Verify: check Vercel dashboard for cron execution logs

---

## Layer 5 — Push Notifications

The goal: users get notified when a new chat drops or when someone sends a message.

### Setup
- [ ] Configure APNs key in Apple Developer portal
- [ ] Set up Expo push notification credentials (`eas credentials`)
- [ ] Add APNs key to server environment variables
- [ ] Install server-side push library (e.g., `apn` or use Expo's push API)

### Device registration
- [ ] On login, mobile calls `registerForPushNotifications()` (already written in `notifications.ts`)
- [ ] `POST /api/push/register` stores the token (already written)
- [ ] Verify: log in on phone → check Redis for `user:{id}:device_tokens`

### Sending notifications (server)
- [ ] New chat created → send "Your new group chat is ready! 💬" to all members
- [ ] New message received → send "New message in your group chat" to offline members
- [ ] Message notifications are batched (don't send one per message)
- [ ] Verify: send a push → see it on your phone lock screen

---

## Layer 6 — App Store Prep

The goal: everything Apple requires to accept the app.

### Security
- [ ] Apple Sign-In: verify identity tokens server-side (not just trust the client)
- [ ] Rate limiting on auth endpoints
- [ ] JWT refresh flow (handle expired tokens gracefully on mobile)

### Content moderation (Apple requires this for UGC apps)
- [ ] Long-press a message → "Report" option
- [ ] `POST /api/report` endpoint that stores the report
- [ ] Block user functionality (blocked users' messages are hidden)
- [ ] Terms of service / community guidelines screen

### Polish
- [ ] Real app icon (replace placeholder)
- [ ] Real splash screen
- [ ] Loading skeletons on chat list and chat screen
- [ ] Error states: network error, server error, empty states
- [ ] Haptic feedback on send button
- [ ] Keyboard dismissal (tap outside input to dismiss)

### Submission
- [ ] Apple Developer account ($99/year) — sign up if not already
- [ ] Privacy policy URL
- [ ] App Store description + keywords
- [ ] Screenshots (6.7" and 6.1" required)
- [ ] EAS Build: `eas build --platform ios`
- [ ] TestFlight: `eas submit --platform ios` → internal testing
- [ ] Test on 2-3 real users via TestFlight
- [ ] Submit for App Store review

---

## Open Questions (decide as you go)

- [ ] **Anonymity model:** Colors only? First names? Progressive reveal at end of chat?
- [ ] **Cold start:** What if < 5 users are in the pool? Waitlist? Smaller group? AI filler?
- [ ] **Timezone:** Drop chats at user's local 6pm or one global time?
- [ ] **Icebreakers:** Hand-curated list? AI-generated? User-submitted?
- [ ] **Retention:** Streaks? Points? "Your next chat drops in X hours" countdown?
- [ ] **Monetization:** Free forever? Freemium? What's the business model for App Store?


