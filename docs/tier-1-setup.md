# Tier 1 — Dev demo setup

Changes in this tier make the Expo app work reliably against the local API with realtime, lifecycle UI, and test hooks.

## Environment (mobile)

1. Copy `mobile/.env.example` → `mobile/.env`
2. Set `EXPO_PUBLIC_PUSHER_APP_KEY` to the same value as server `NEXT_PUBLIC_PUSHER_APP_KEY`
3. Restart Expo (`npx expo start -c` clears the config cache)

Config flow:

```
mobile/.env  →  app.config.js (dotenv at build/start)  →  Constants.expoConfig.extra  →  src/lib/config.ts
```

## API URL

| Mode | Resolution |
|------|------------|
| Dev | `http://<expo-host>:3001/api` from Metro debugger host |
| Production | `EXPO_PUBLIC_API_URL` (+ `/api` if omitted) |

## New server routes

| Route | Purpose |
|-------|---------|
| `GET /api/chat/:id` | Chat metadata for history detail; membership check |
| `POST /api/dev/expire-chat` | `{ chatId }` → `active: false` (development only) |

## Shared lifecycle helpers (`packages/shared/src/chat-utils.ts`)

- `isChatWritable` / `isChatEnded` — align mobile UI with server send rules
- `formatChatExpiry` — relative expiry copy for headers and history list

## Manual verification

1. Start server: `npm run dev:server`
2. Start mobile: `npm run dev:mobile`
3. Seed + log in as two users on two simulators/devices
4. Send message as user A → appears on user B via Pusher
5. Tap **Expire** (dev, main chat tab) → input hidden, yellow banner, send returns 403
6. History tab → open ended chat → read-only, icebreaker visible
