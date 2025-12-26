# iOS Shell (Capacitor) – Option A (hosted URL)

This creates a minimal iOS app that loads the hosted Next.js deployment inside a WKWebView.

## Prereqs
- Xcode installed (for iOS Simulator/device)
- Node.js + npm

## 1) Install dependencies

From repo root:

```bash
npm install
```

Then:

```bash
cd ios-shell
npm install
```

## 2) Configure the URL

Edit `ios-shell/capacitor.config.ts` and set:
- `server.url` to your deployed site, e.g. `https://your-app.vercel.app`

Or set an env var for the commands below:

```bash
export CAPACITOR_SERVER_URL="https://your-app.vercel.app"
```

## 3) Add iOS + open Xcode

```bash
npx cap add ios
npx cap open ios
```

In Xcode:
- Select an iOS Simulator
- Press **Run**

## 4) Debug

Safari → Develop menu:
- Develop → (Simulator/Device) → (Your App) to inspect console/network/DOM.


