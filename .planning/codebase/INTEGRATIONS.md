# External Integrations

**Analysis Date:** 2026-04-07

## Supabase

### Connection Setup
- Client: `lib/supabase.ts` — `createClient` with `auth.persistSession: false`, `auth.autoRefreshToken: false`
- Custom fetch wrapper injects `Authorization: Bearer <token>` from `lib/authTokenProvider.ts`
- Token is resolved via `getAccessTokenForSupabase()` in `stores/authStore.ts`, which handles silent refresh
- Edge Function calls go through `lib/edgeFunctions.ts` — direct `fetch` with the anon key as bearer

### Database Tables

| Table | Purpose |
|-------|---------|
| `teams` | One row per FRC team. Columns: `id` (UUID), `team_number`, `team_name`, `team_code`, `admin_code` |
| `matches` | Scouted match data. Columns: `id`, `team_id`, `event_key`, `match_number`, `team_number`, `scout_name`, `game_year`, `metrics` (JSONB), `calculated_points`, `notes`, `survey` (JSONB), `alliance`, `timestamp` |
| `match_deletions` | Tombstone table for admin-deleted matches. Columns: `match_id`, `team_id` |
| `picklists` | Team pick rankings per event. Columns: `team_id`, `event_key`, and picklist payload |
| `user_ebucks_balance` | Virtual currency per scout per team. Columns: `id`, `team_id`, `user_identifier` (scout_name:team_number), `scout_name`, `team_number`, `balance`, `balance_demo`, `total_earned`, `total_spent` |
| `bets` | Match betting records. Columns: `id`, `team_id`, `user_identifier`, `match_key`, `match_number`, `event_key`, `bet_type` (winner/margin/over_under/parlay), `bet_details` (JSONB), `bet_amount`, `odds`, `potential_payout`, `status` (pending/won/lost/cancelled), `payout`, `resolved_at` |
| `refresh_tokens` | Long-lived refresh tokens (1 year). Columns: `id`, `team_id`, `token_hash` (SHA-256), `user_identifier`, `expires_at` |
| `league_averages` | Pre-computed league averages for statistics. `team_id` scoped |
| `scouter_assignments` | Admin-assigned scouter schedules. Columns: `id`, `team_id`, `event_key`, `match_key`, `match_number`, `team_number`, `alliance`, `scouter_name` |
| `audit_logs` | Audit trail for admin operations |

### Materialized Views / Secure Views
- `team_statistics` — materialized view aggregating per-team match stats; refreshed after sync via `teamStatisticsService.refreshTeamStatistics()`
- `team_statistics_secure` — secure view wrapping `team_statistics` with `WHERE team_id = public.current_team_id()` (security_invoker)

### Row Level Security (RLS)
All tables have RLS enabled (migration `020_enable_rls_all_tables.sql`). Policy pattern:

```sql
-- Helper function extracts team_id from custom JWT app_metadata
CREATE OR REPLACE FUNCTION public.current_team_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'team_id')::uuid;
$$;

-- All tables use: USING (team_id = public.current_team_id())
```

- `teams` — SELECT own team only
- `matches` — ALL operations own team only
- `match_deletions` — ALL own team only
- `picklists` — ALL own team only
- `user_ebucks_balance` — ALL own team only
- `bets` — ALL own team only
- `refresh_tokens` — No direct client access (`USING (false)`)
- `league_averages` — SELECT own team only
- `scouter_assignments` — ALL own team only

### Cross-Team RPC Functions
Two SECURITY DEFINER functions bypass teams-table RLS for cross-team analytics (migration `021_cross_team_read_policy.sql`):
- `get_event_matches_cross_team(p_event_key text)` — returns all matches for an event regardless of scouting team
- `get_team_number_matches_cross_team(p_team_number int, p_event_key text)` — returns all matches for a specific scouted robot number
- Both granted to `authenticated` role only
- Called via `supabase.rpc(...)` in `services/supabase.sync.ts`

### Additional RPC Functions
- `validate_team_code_and_get_id(code text)` — used in `auth-operations` edge function
- `get_team_id_by_number(team_num int)` — used in `services/adminService.ts`
- `resolve_bets_batch` — batch bet resolution (migration `016_resolve_bets_batch_rpc.sql`)
- `increment_ebucks` — atomic e-bucks increment (migration `017_ebucks_atomic_increment_rpc.sql`)
- `reset_leaderboard` — leaderboard reset (migration `025_reset_leaderboard_rpc.sql`)

### Edge Functions (all at `/functions/v1/<name>`)

**`auth-operations`** (`supabase/functions/auth-operations/index.ts`)
- Operations: `signInWithTeamCode`, `refreshToken`
- Validates team code against `teams` table
- Issues custom HS256 JWT (24h expiry) with `app_metadata.team_id`
- Issues refresh token (1 year, stored as SHA-256 hash in `refresh_tokens` table)
- Uses `npm:jose@5` for JWT signing; secret from `SUPABASE_JWT_SECRET`

**`team-operations`** (`supabase/functions/team-operations/index.ts`)
- Operations: `searchTeamByNumber`, `validateTeamCode`, `createTeam`, `getTeamCode`, `getTeamNumberByTeamId`, `setAdminCode`, `validateAdminCode`, `checkAdminCodeExists`

**`match-operations`** (`supabase/functions/match-operations/index.ts`)
- Operations: `getTeamIdByNumber`, `insertMatch`, `batchInsertMatches`, `updateMatch`, `getMatches`, `checkMatchExists`, `getAllTeamMatches`
- `batchInsertMatches` is the primary sync path — called by `SyncManager.batchUpload()` in `services/syncTransformer.ts`

**`picklist-operations`** (`supabase/functions/picklist-operations/index.ts`)
- Operations: `fetchPicklists`, `savePicklists`

**`bets`** (`supabase/functions/bets/index.ts`)
- Bet placement and resolution

**`ebucks-balance`** (`supabase/functions/ebucks-balance/index.ts`)
- E-bucks balance queries

**`leaderboard`** (`supabase/functions/leaderboard/index.ts`)
- Leaderboard data fetching

### Supabase Triggers
- `015_leaderboard_broadcast_trigger.sql` — Realtime broadcast trigger on leaderboard changes

### Migrations Applied
Migrations in `migrations/` directory, numbered `003` through `028`:
- Start at `003` (earlier migrations applied before repo was set up)
- Latest: `028_create_scouter_assignments.sql`
- Apply with: `npx supabase db push`

---

## The Blue Alliance (TBA) API

**Base URL:** `https://www.thebluealliance.com/api/v3`
**Auth:** `X-TBA-Auth-Key` header with `EXPO_PUBLIC_TBA_API_KEY`
**Client:** `api/client.ts` (Axios, 10s timeout)
**Types:** `api/types.ts` — `TBAEvent`, `TBAMatch`, `TBATeam`, `MatchAlliances`, `Alliance`

### Endpoints Used

| Endpoint | Function | File |
|----------|----------|------|
| `GET /events/{year}` | Fetch all FRC events for a year | `api/services/events.ts:getEventsByYear` |
| `GET /event/{eventKey}/rankings` | Fetch event team rankings | `api/services/events.ts:getEventRankings` |
| `GET /event/{eventKey}/matches` | Fetch all matches for an event | `api/services/matches.ts:getEventMatches` |
| `GET /team/{teamKey}` | Fetch single team info | `api/services/teams.ts:getTeam` |
| `GET /teams/{pageNum}` | Fetch paginated team list (500/page) | `api/services/teams.ts:getAllTeams` |
| `GET /event/{matchKey}` | TBA match data for betting | `services/bettingService.ts` (via `tbaClient`) |

### Data Consumed
- `TBAEvent`: key, name, start_date, end_date, year, city/state — used to populate event selector
- `TBAMatch`: key, comp_level (qm/qf/sf/f), match_number, alliances (red/blue team_keys, scores), winning_alliance — used for betting and schedule
- `TBATeam`: key, team_number, nickname, name — used in team lookup and picklist
- `TBARanking`: rank, team_key, wins/losses/ties — used in picklist rankings view

### Query Keys
- `queryKeys.events.byYear(year)` — `['events', year]`
- `queryKeys.matches.byEvent(eventKey)` — `['matches', eventKey]`
- `queryKeys.rankings(eventKey)` — `['rankings', eventKey]`
- `queryKeys.teams.detail(teamKey)` — `['teams', teamKey]`
- Hooks: `hooks/useEvents.ts`, `hooks/useEventMatches.ts`, `hooks/useTeam.ts`

---

## Statbotics API

**Base URL:** `https://api.statbotics.io/v3`
**Auth:** None required (public API)
**Client:** `api/statboticsClient.ts` (Axios, 20s timeout — API can be slow under load)

### Endpoints Used

| Endpoint | Function | File |
|----------|----------|------|
| `GET /team_year/{team}/{year}` | Fetch EPA stats for a team in a year | `api/services/statbotics.ts:getTeamYearEPA` |
| `GET /team_year/{team}/{year}` (batched) | Fetch EPA for multiple teams | `api/services/statbotics.ts:getTeamYearEPABatch` |

### Data Consumed
- `StatboticsTeamYear.epa.total_points.mean` — EPA mean; used as baseline for betting odds
- `StatboticsTeamYear.epa.total_points.sd` — EPA standard deviation; used in normal distribution odds calculation

### Caching
- In-memory cache in `api/services/statbotics.ts`: `epaCache` Map keyed by `{year}:{sorted team numbers}`
- TTL: 10 minutes
- Concurrency: 3 parallel requests per batch to avoid rate limiting
- 404s return `null` silently; timeouts log at warn level

### Usage in Betting
- `services/teamStatisticsService.ts` blends EPA with locally scouted data
- `services/bettingService.ts` uses normal distribution (`normalCDF`) over blended EPA mean/stdev to compute dynamic odds
- Called when betting modal opens; fresh for new match combos, cached for re-opens

---

## Sentry

**Package:** `@sentry/react-native ^7.11.0` (client), `https://deno.land/x/sentry@7.91.0` (Edge Functions)
**DSN:** `https://231c578472c2942afdfc4b074dee9a04@o4510829492895744.ingest.us.sentry.io/4510829498073088`

### Client App Initialization (`app/_layout.tsx`)
```typescript
Sentry.init({
  dsn: '...',
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});
export default Sentry.wrap(function RootLayout() { ... });
```

### What Is Captured
- Unhandled JS exceptions (via `Sentry.wrap` on root layout component)
- Mobile Session Replay (10% of sessions, 100% on error)
- Feedback widget (in-app bug reporting)
- PII data (sendDefaultPii: true)
- Source maps uploaded via `SENTRY_AUTH_TOKEN` during EAS builds

### Edge Function Sentry (`supabase/functions/_shared/sentry.ts`)
- Shared module imported by each Edge Function
- `initSentry(functionName)` called at startup
- `captureError(error, context)` for explicit error reporting
- Tags: `region` (from `SB_REGION`), `execution_id`, `function_name`
- `tracesSampleRate: 1.0`, `profilesSampleRate: 1.0`

### Metro Config Integration
- `metro.config.js` uses `getSentryExpoConfig(__dirname)` for source map support

---

## Expo Services

### Expo Updates (OTA)
- Package: `expo-updates ~29.0.16`
- Update URL: `https://u.expo.dev/753b98be-adbc-44ff-ad33-8da220a6b540`
- Runtime version policy: `appVersion` — OTA only compatible within same app version
- Production `console.log/info/debug` stripped by Babel; `error`/`warn` kept

### EAS Build
- Project ID: `753b98be-adbc-44ff-ad33-8da220a6b540`
- Owner: `aadi-ds-organization`
- iOS build: `com.valencerobotics.electronscout`
- Android build: `com.valencerobotics.electronscout`
- Commands: `eas build --platform ios`, `eas build --platform android`

### App Store Version Check
- Package: `react-native-version-check ^3.5.0`
- Hook: `hooks/useVersionCheck.ts`
- Checks on app foreground; shows `UpdateAppModal` if newer version available
- Disabled in `__DEV__` mode

### Expo Camera
- Package: `expo-camera ~17.0.10`
- Permission: "Allow $(PRODUCT_NAME) to access your camera to scan QR codes"
- Used in QR code scanning screen (`app/scan-qr.tsx`)

---

## AsyncStorage

**Package:** `@react-native-async-storage/async-storage 2.2.0`

### Keys Written and Read

| Key | Value | Set By | Read By |
|-----|-------|--------|---------|
| `scout_name` | string | `stores/authStore.ts` (login) | `services/supabase.sync.ts`, `stores/ebucksStore.ts` |
| `team_number` | string (numeric) | `stores/authStore.ts` (login) | `services/supabase.sync.ts`, `stores/ebucksStore.ts` |
| `team_id` | UUID string | `stores/authStore.ts` (login) | `services/supabase.sync.ts` |
| `team_code` | string | `stores/authStore.ts` (login) | — |
| `auth_access_token` | JWT string | `stores/authStore.ts` (login/refresh) | `stores/authStore.ts` (checkAuth, token provider) |
| `auth_refresh_token` | UUID string | `stores/authStore.ts` (login) | `stores/authStore.ts` (checkAuth, refresh) |
| `auth_token_expires_at` | Unix timestamp string | `stores/authStore.ts` | `stores/authStore.ts` |
| `admin_unlocked_at_ms` | timestamp string | `stores/adminStore.ts` | `stores/adminStore.ts` |
| `selected_event_key` | TBA event key (e.g. `2026mndu`) | Event selector screen | `services/syncTransformer.ts` |
| `ebucks_balance` | integer string | `stores/ebucksStore.ts` (fallback) | `stores/ebucksStore.ts` |
| `ebucks_balance_demo` | integer string | `stores/ebucksStore.ts` (fallback) | `stores/ebucksStore.ts` |
| `data_visibility` | `my_team` \| `teams_at_event` \| `all_teams` | `stores/dataVisibilityStore.ts` | `stores/dataVisibilityStore.ts` |
| `demo_mode_enabled` | `true` \| `false` | `stores/demoStore.ts` | `stores/demoStore.ts` |

### Logout Cleanup
`useAuthStore.logout()` removes all auth keys in a single `AsyncStorage.multiRemove` call:
```typescript
await AsyncStorage.multiRemove([
  'scout_name', 'team_number', 'team_id', 'team_code',
  'auth_access_token', 'auth_refresh_token', 'auth_token_expires_at',
]);
```

---

## QR Code Transfer (Device-to-Device)

Not a network integration — uses local QR codes for offline data transfer between devices.

- **Generation:** `services/qrCodeService.ts` — packs up to 15 matches into a compact JSON payload (~2500 bytes), rendered via `react-native-qrcode-svg ^6.3.21`
- **Scanning:** `expo-camera ~17.0.10` reads QR code; `parseQRPayload()` deserializes compact format back to `MatchData[]`
- **Compact format fields:** `i` (id), `m` (match_number), `t` (team_number), `s` (scouter_id), `y` (game_year), `d` (metrics), `ts` (timestamp), `n` (notes), `sv` (survey), `a` (alliance), `cp` (calculated_points)

---

## Network Connectivity

**Package:** `@react-native-community/netinfo 11.4.1`
- Used to detect online/offline status
- App is designed to work fully offline; sync triggers when connectivity is restored
- Auth token refresh falls back gracefully on network errors: user stays logged in with stale token until reconnected

---

## Environment Variables Reference

| Variable | Required | Used By |
|----------|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | `lib/supabase.ts`, `lib/edgeFunctions.ts` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | `lib/supabase.ts`, `lib/edgeFunctions.ts` |
| `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | Supabase Edge Functions (via Deno env) |
| `EXPO_PUBLIC_TBA_API_KEY` | Yes | `api/client.ts` |
| `SENTRY_AUTH_TOKEN` | Build only | EAS build source map upload |
| `SUPABASE_JWT_SECRET` | Edge Function only | `supabase/functions/auth-operations/index.ts` |

All `EXPO_PUBLIC_*` variables are embedded at build time and accessible in client code. The service role key is NOT used in client-side code.

---

*Integration audit: 2026-04-07*
