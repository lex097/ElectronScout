# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## What This Is

**ElectronScout** — offline-first mobile scouting app for FIRST Robotics Competition (FRC), built with React Native / Expo. Collect match data, analyze team stats, manage picklists, bet on match outcomes with virtual currency (e-bucks).

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

No lint or test commands configured.

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
- **Local DB**: expo-sqlite — `frc_scout.db`, primary table `matches` with `synced` flag
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **External APIs**: The Blue Alliance (`api/client.ts`) and Statbotics (`api/statboticsClient.ts`)
- **Error tracking**: Sentry (initialized in `app/_layout.tsx`, Metro config in `metro.config.js`)

### Data Flow (Offline-First)

1. Scouting data written to local SQLite (`services/database.ts`) immediately.
2. `services/supabase.sync.ts` orchestrates background sync — unsynced rows (`synced = 0`) transformed via `services/syncTransformer.ts`, batch-uploaded via `batchInsertMatches` Supabase Edge Function.
3. Remote data (team stats, bets, schedules) fetched via React Query hooks and Supabase client.

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
- Login team-code based, validated via Supabase Edge Function.
- JWT access + refresh tokens stored in AsyncStorage via `lib/authTokenProvider.ts`.
- `stores/authStore.ts` handles token refresh; app stays logged in offline.

### Betting System
- `services/bettingService.ts` computes dynamic odds via normal distribution over blended team stats (EPA from Statbotics + locally scouted data).
- `services/teamStatisticsService.ts` manages EPA blend and standard deviation calculations.

### Game Configuration (Annual Update)
- `config/gameConfig.ts` — single file defining all match phases, metric types (counter, boolean, timer, rapid counter), and scoring for current FRC game year.
- 2025 ("Reefscape") config present but commented out; 2026 ("Rebuilt") config active.
- New season: update `gameConfig.ts`, redeploy via EAS.

### Import Alias
`@/*` maps to project root (configured in `tsconfig.json`). Use `@/services/...`, `@/stores/...`, etc.

### Production Notes
- `babel.config.js` strips all `console.log/info/debug` in production (keeps `error` and `warn`).
- expo-sqlite mocked to empty module on web (see `metro.config.js`).
- OTA updates use Expo Updates; native builds use EAS.