# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**ElectronScout** is an offline-first mobile scouting app for FIRST Robotics Competition (FRC), built with React Native / Expo. Teams use it to collect match data, analyze team statistics, manage picklists, and even bet on match outcomes with virtual currency (e-bucks).

## Commands

```bash
# Start dev server
npx expo start

# Run on specific platform
npx expo start --ios
npx expo start --android
npx expo start --web

# Supabase local dev
npx supabase start
npx supabase functions serve   # Serve Edge Functions locally
npx supabase db push           # Apply migrations

# EAS Build (production)
eas build --platform ios
eas build --platform android
```

There are no lint or test commands configured.

## Environment Variables

Required in `.env`:
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon JWT
- `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` — Supabase service role JWT (used in Edge Functions)
- `EXPO_PUBLIC_TBA_API_KEY` — The Blue Alliance API key
- `SENTRY_AUTH_TOKEN` — Sentry auth token

## Architecture

### Stack
- **Routing**: Expo Router (file-based, `app/` directory)
- **State**: Zustand stores (`stores/`)
- **Server state / caching**: React Query (`config/queryClient.ts`, `config/queryKeys.ts`)
- **Local DB**: expo-sqlite — `frc_scout.db`, primary table `matches` with a `synced` flag
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **External APIs**: The Blue Alliance (`api/client.ts`) and Statbotics (`api/statboticsClient.ts`)
- **Error tracking**: Sentry (initialized in `app/_layout.tsx`, Metro config in `metro.config.js`)

### Data Flow (Offline-First)

1. Scouting data is written to local SQLite (`services/database.ts`) immediately.
2. `services/supabase.sync.ts` orchestrates background sync — unsynchronized rows (where `synced = 0`) are transformed via `services/syncTransformer.ts` and batch-uploaded via the `batchInsertMatches` Supabase Edge Function.
3. Remote data (team stats, bets, schedules) is fetched via React Query hooks and Supabase client.

### Key Directories

| Path | Purpose |
|------|---------|
| `app/` | Screens and navigation (Expo Router). `(tabs)/` = main tabs, `(admin)/` = admin-only screens |
| `services/` | Business logic: database, sync, auth, admin, betting, statistics, picklist, QR, schedules |
| `stores/` | Zustand global state (auth, admin, e-bucks, bet notifications, QR, demo mode) |
| `hooks/` | React Query hooks wrapping services and APIs |
| `api/` | Axios clients for TBA and Statbotics; type definitions |
| `lib/` | Supabase client setup, Edge Function callers, JWT token provider |
| `config/` | `gameConfig.ts` (game-specific metrics — update yearly), React Query client/keys |
| `migrations/` | Supabase SQL migrations (numbered `003_` → `020_+`) |
| `supabase/functions/` | Supabase Edge Function implementations |
| `components/` | Shared UI components; `betting/` and `admin/` subdirectories |

### Authentication
- Login is team-code based, validated via a Supabase Edge Function.
- JWT access + refresh tokens are stored in AsyncStorage via `lib/authTokenProvider.ts`.
- `stores/authStore.ts` handles token refresh; the app stays logged in when offline.

### Betting System
- `services/bettingService.ts` computes dynamic odds using normal distribution over blended team statistics (EPA from Statbotics + locally scouted data).
- `services/teamStatisticsService.ts` manages the EPA blend and standard deviation calculations.

### Game Configuration (Annual Update)
- `config/gameConfig.ts` is the single file that defines all match phases, metric types (counter, boolean, timer, rapid counter), and scoring for the current FRC game year.
- The 2025 ("Reefscape") config is present but commented out; the 2026 ("Rebuilt") config is active.
- When a new season starts: update `gameConfig.ts` and redeploy via EAS.

### Import Alias
`@/*` maps to the project root (configured in `tsconfig.json`). Use `@/services/...`, `@/stores/...`, etc.

### Production Notes
- `babel.config.js` strips all `console.log/info/debug` calls in production (keeps `error` and `warn`).
- expo-sqlite is mocked to an empty module on web (see `metro.config.js`).
- OTA updates use Expo Updates; native builds use EAS.
