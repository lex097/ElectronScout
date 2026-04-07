# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**
- TypeScript ~5.9.2 — All application code in `app/`, `services/`, `stores/`, `hooks/`, `api/`, `lib/`, `config/`, `components/`
- Deno (TypeScript) — Supabase Edge Functions in `supabase/functions/`

**Secondary:**
- SQL — Supabase migrations in `migrations/`
- JavaScript — Config files (`babel.config.js`, `metro.config.js`)

## Runtime

**Environment:**
- React Native 0.81.5 (New Architecture enabled: `newArchEnabled: true`)
- Node.js — Development tooling
- Deno — Edge Function runtime (Supabase managed)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Expo ~54.0.30 — Managed workflow, native module bridging, OTA updates
- React 19.1.0 — UI rendering
- React Native 0.81.5 — Mobile framework

**Routing:**
- expo-router ~6.0.21 — File-based routing; `app/` directory is the route tree
  - Entry point: `expo-router/entry` (set in `package.json` `"main"`)
  - `app/(tabs)/` — main tab navigator
  - `app/(admin)/` — admin-only screens
  - Typed routes enabled: `experiments.typedRoutes: true`

**State Management:**
- Zustand ^5.0.8 — Global client state
  - `stores/authStore.ts` — auth tokens, user identity, token refresh
  - `stores/adminStore.ts` — admin unlock state (persisted)
  - `stores/ebucksStore.ts` — virtual currency balance (real + demo)
  - `stores/demoStore.ts` — demo mode toggle
  - `stores/dataVisibilityStore.ts` — cross-team data visibility scope
  - `stores/betNotificationStore.ts` — bet result notifications
  - `stores/qrCodeStore.ts` — QR code generation state
  - `stores/scouterScheduleStore.ts` — scouter assignment display

**Server State / Caching:**
- @tanstack/react-query ^5.90.8 — Remote data fetching and caching
  - Config: `config/queryClient.ts` (staleTime: 5 min, gcTime: 10 min, retry: 2)
  - Keys: `config/queryKeys.ts` — centralized key factory for all query domains
  - Provider mounted in `app/_layout.tsx`

**Navigation:**
- @react-navigation/native ^7.1.8 — Core navigation primitives
- @react-navigation/material-top-tabs ^7.4.1 — Tab views inside screens
- react-native-tab-view ^4.2.0 — Swipeable tab view
- react-native-pager-view 6.9.1 — Underlying pager for tab views

## Local Database

**Engine:**
- expo-sqlite ~16.0.10 — SQLite on device
- Database file: `frc_scout.db`
- Primary table: `matches` (id, match_number, team_number, scouter_id, game_year, metrics TEXT/JSON, timestamp, synced INTEGER, notes, survey, alliance)
- Indexes: `idx_match_number`, `idx_team_number`, `idx_synced`
- Service singleton: `services/database.ts` exports `db`
- **Web platform**: expo-sqlite is mocked to empty module (see `metro.config.js`)

## Backend

**Platform:**
- Supabase — PostgreSQL + RLS + Edge Functions + custom JWT auth
- Client: @supabase/supabase-js ^2.78.0
- Client setup: `lib/supabase.ts`
  - `auth.persistSession: false`, `auth.autoRefreshToken: false`
  - Custom fetch interceptor injects Bearer token from `lib/authTokenProvider.ts`

**Edge Functions Runtime:**
- Deno with `npm:@supabase/supabase-js@2`, `npm:jose@5`
- Functions: `supabase/functions/`
  - `auth-operations` — sign-in, token refresh
  - `team-operations` — team CRUD, code validation, admin code
  - `match-operations` — insert/batch/update/fetch matches
  - `picklist-operations` — save/fetch picklists
  - `bets` — bet placement and resolution
  - `ebucks-balance` — e-bucks queries
  - `leaderboard` — leaderboard data
  - `_shared/sentry.ts` — shared Sentry init for Edge Functions

## External APIs

**The Blue Alliance (TBA):**
- Base URL: `https://www.thebluealliance.com/api/v3`
- Client: `api/client.ts` (Axios, 10s timeout, `X-TBA-Auth-Key` header)
- API version: v3

**Statbotics:**
- Base URL: `https://api.statbotics.io/v3`
- Client: `api/statboticsClient.ts` (Axios, 20s timeout, no auth required)
- API version: v3

## Error Tracking

**Sentry:**
- @sentry/react-native ^7.11.0 (client app)
- `https://deno.land/x/sentry@7.91.0` (Edge Functions)
- DSN: `https://231c578472c2942afdfc4b074dee9a04@o4510829492895744.ingest.us.sentry.io/4510829498073088`
- Initialized in `app/_layout.tsx` via `Sentry.wrap()` on the root layout component
- Features: Mobile Replay, Feedback, Session Replay (10% sample / 100% on error), PII data enabled
- Edge Functions: initialized via `supabase/functions/_shared/sentry.ts`

## Build Tooling

**Metro Bundler:**
- Config: `metro.config.js`
- Extended with `getSentryExpoConfig` for source maps
- Adds `.wasm` to `assetExts` and `sourceExts`
- Mocks `expo-sqlite` on web platform

**Babel:**
- Config: `babel.config.js`
- Preset: `babel-preset-expo`
- Plugin: `transform-remove-console` — strips `console.log/info/debug` in production, keeps `error` and `warn`

**EAS (Expo Application Services):**
- eas-cli ^16.28.0 (devDependency)
- Project ID: `753b98be-adbc-44ff-ad33-8da220a6b540`
- iOS bundle: `com.valencerobotics.electronscout`
- Android package: `com.valencerobotics.electronscout`
- OTA updates URL: `https://u.expo.dev/753b98be-adbc-44ff-ad33-8da220a6b540`
- Runtime version policy: `appVersion`

**TypeScript:**
- Version: ~5.9.2
- Config: `tsconfig.json` — extends `expo/tsconfig.base`, strict mode, path alias `@/*` → root

## Key Dependencies

**Critical:**
- `expo-sqlite ~16.0.10` — offline-first local data store
- `@supabase/supabase-js ^2.78.0` — backend client
- `@tanstack/react-query ^5.90.8` — all remote data fetching
- `zustand ^5.0.8` — all global state
- `axios ^1.13.2` — TBA and Statbotics API clients
- `expo-router ~6.0.21` — navigation

**Infrastructure:**
- `@react-native-async-storage/async-storage 2.2.0` — persisted auth tokens, user prefs
- `@react-native-community/netinfo 11.4.1` — network connectivity detection
- `expo-updates ~29.0.16` — OTA update delivery
- `expo-camera ~17.0.10` — QR code scanning
- `react-native-qrcode-svg ^6.3.21` — QR code generation
- `react-native-url-polyfill ^3.0.0` — URL API polyfill for React Native

**UI / Visualization:**
- `echarts ^6.0.0` — analytics charts
- `react-native-chart-kit ^6.12.0` — additional charting
- `react-native-svg 15.12.1` — SVG rendering (required by chart libs)
- `react-native-draggable-flatlist ^4.0.3` — picklist drag-and-drop
- `react-native-gesture-handler ~2.28.0` — gesture system
- `react-native-reanimated ~4.1.1` — animations
- `react-native-safe-area-context ~5.6.0` — safe area insets
- `react-native-screens ~4.16.0` — native screen components
- `react-native-worklets 0.5.1` — worklet runtime for Reanimated
- `@expo/vector-icons ^15.0.3` — icon library (FontAwesome etc.)
- `date-fns ^4.1.0` — date formatting

**Miscellaneous:**
- `react-native-version-check ^3.5.0` — app store update check
- `expo-haptics ^15.0.8` — haptic feedback
- `expo-sharing ~14.0.8` — share sheet
- `expo-file-system ~19.0.21` — file I/O
- `expo-web-browser ~15.0.10` — in-app browser

## Configuration

**Environment Variables (`.env`):**
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon JWT
- `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` — Service role key (Edge Functions only)
- `EXPO_PUBLIC_TBA_API_KEY` — The Blue Alliance API key
- `SENTRY_AUTH_TOKEN` — Sentry source map upload token

**App Config:**
- `app.config.js` — Expo config (version 1.1.3, owner: `aadi-ds-organization`)
- Supports iOS (tablet), Android (edge-to-edge), Web (limited — no SQLite)
- Dark/light splash screen + adaptive icons

**Game Config:**
- `config/gameConfig.ts` — all match metrics, scoring, phase definitions per FRC year
- 2026 ("Rebuilt") config is active; 2025 ("Reefscape") is commented out

## Platform Requirements

**Development:**
- Node.js + npm
- Expo CLI (`npx expo start`)
- Supabase CLI for local backend (`npx supabase start`)
- EAS CLI for production builds

**Production:**
- iOS 14+ (tested on iPhone and iPad)
- Android with edge-to-edge support
- Supabase hosted PostgreSQL + Edge Functions
- EAS Build for native binaries; Expo Updates for OTA patches

---

*Stack analysis: 2026-04-07*
