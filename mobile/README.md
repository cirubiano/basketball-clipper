# Basketball Clipper — Mobile

React Native + Expo app for the Basketball Clipper platform (iOS + Android).

## Stack

- **Expo ~51** with **Expo Router** (file-based routing)
- **TypeScript**
- **React Query** — data fetching
- **expo-av** — video playback

## Setup

```bash
npm install
cp .env.example .env   # fill in API URL if needed
```

## Run

```bash
# Start Expo dev server
npx expo start

# Open on Android emulator
npx expo start --android

# Open on iOS simulator (macOS only)
npx expo start --ios
```

## Project structure

```
app/
  _layout.tsx       Root layout with Expo Router Stack
  index.tsx         Dashboard screen
  upload.tsx        Video upload screen
  clips/
    index.tsx       Clip list screen
    [id].tsx        Clip detail screen
components/
  VideoUploader.tsx Shared component (mirrors web/components/video/)
  ClipPlayer.tsx    Shared component (mirrors web/components/video/)
lib/
  queryClient.ts    React Query client singleton
```

## Rules

- Reuse `shared/types` and `shared/api` — same contract as web
- Keep component names identical to their web counterparts
- Use Expo SDK — avoid installing raw native packages unless strictly necessary
