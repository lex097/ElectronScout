# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** Offline-first mobile app with layered state management

**Key Characteristics:**
- Writes to local SQLite immediately; syncs to Supabase in background when online
- Custom JWT auth (not Supabase Auth) — tokens are team-scoped, not user-scoped
- Three-tier state model: Zustand (global UI state) + React Query (server cache) + SQLite (durable local data)
- File-based navigation via Expo Router with two protected route groups: `(tabs)/` and `(admin)/`
- Row-level security on Supabase bypassed for cross-team reads using SECURITY DEFINER RPC functions

---

## Layers

**Screens (Presentation):**
- Purpose: UI rendering and user interaction
- Location: `app/`
- Contains: Expo Router screen files, layouts, modal flows
- Depends on: Zustand stores, React Query hooks, services (directly in some screens)
- Used by: End users

**React Query Hooks (Server State Cache):**
- Purpose: Fetch and cache remote data; handle loading/error states for UI
- Location: `hooks/`
- Contains: `useQuery`/`useMutation` wrappers over services and API clients
- Depends on: `services/`, `api/`, `config/queryKeys.ts`
- Used by: Screens

**Zustand Stores (Global UI State):**
- Purpose: Synchronous in-memory state that outlives individual screen renders
- Location: `stores/`
- Contains: Auth session, admin unlock, e-bucks balance, demo mode, QR chunks, bet notifications, data visibility, scouter schedule flags
- Depends on: AsyncStorage (for persistence), `lib/edgeFunctions.ts` (auth store only)
- Used by: Screens, hooks, services

**Services (Business Logic):**
- Purpose: All non-trivial operations — database access, sync, analytics calculations, betting math, QR encoding
- Location: `services/`
- Contains: Singleton class instances exported as constants
- Depends on: `lib/supabase.ts`, `lib/edgeFunctions.ts`, `api/`, Zustand stores
- Used by: Hooks, screens (directly for mutations), syncManager

**API Clients (External HTTP):**
- Purpose: HTTP access to The Blue Alliance and Statbotics
- Location: `api/client.ts` (TBA, Axios), `api/statboticsClient.ts` (Statbotics), `api/services/`
- Contains: Typed fetch functions returning structured data
- Depends on: `EXPO_PUBLIC_TBA_API_KEY` env var
- Used by: Hooks, services

**Edge Functions (Supabase Backend):**
- Purpose: Server-side operations that require service role access or JWT signing
- Location: `supabase/functions/`
- Runs: Deno runtime on Supabase
- Used by: `lib/edgeFunctions.ts` which wraps all calls as typed fetch

**SQLite (Local Database):**
- Purpose: Durable offline storage of scouted match data
- Location: `frc_scout.db` (managed by `services/database.ts`)
- Contains: `matches` table with `synced` flag
- Used by: `services/database.ts` (exported as `db`), sync pipeline

---

## Data Flow

**Offline-First Scouting Write:**
1. Scout fills out form on `app/(tabs)/index.tsx` (MatchScoutScreen)
2. On save: `db.saveMatch()` writes to SQLite `matches` table with `synced = 0`
3. `syncManager.uploadMatch()` is called immediately — transforms match via `SyncTransformer.transformMatch()`, calls `supabaseSyncService.insertMatch()` → `edgeFunctions.batchInsertMatches()` → `match-operations` Edge Function
4. If online and succeeds: `db.markAsSynced(matchId)` sets `synced = 1`
5. On next app open or reconnect: `syncManager.fullSync()` uploads all remaining `synced = 0` rows; synced rows are then deleted from local SQLite

**Background Auto-Sync Trigger:**
1. `services/syncManager.ts` calls `initAutoSync()` (triggered from `app/_layout.tsx`)
2. `NetInfo.addEventListener` detects connectivity change
3. On `isConnected = true`: `syncManager.fullSync()` runs in background

**Analytics Pipeline:**
1. `hooks/useAnalytics.ts` determines data source based on `dataVisibilityStore.visibility`:
   - `my_team`: reads from local SQLite via `db.getAllMatches()` + filters deleted via `supabaseSyncService.getDeletedMatchIds()`
   - `teams_at_event`: calls `supabaseSyncService.getEventMatches(eventKey)` → `get_event_matches_cross_team` RPC
   - `all_teams`: same RPC query, different semantic label
2. Raw `MatchData[]` passed to `analyticsService.calculateTeamAnalytics()` → returns `Map<number, TeamAnalytics>`
3. `TeamAnalytics` contains per-metric averages, stdDev, min/max, reliability score, and `matchHistory`
4. `app/(tabs)/analytics.tsx` renders leaderboard tables and per-team breakdowns from this map

**Event Match Cache (TBA):**
1. `MatchesCacheHydrator` component (rendered in root layout) loads cached TBA matches from AsyncStorage into React Query on app init
2. `useEventMatches(eventKey)` fetches from TBA via `matchesCacheService.fetchAndCache()` which calls `api/services/matches.ts` and persists result to AsyncStorage key `cached_event_matches`
3. Subsequent loads serve from React Query cache (1 minute stale time) or AsyncStorage

---

## Authentication Flow

**Login:**
1. User enters team code + scout name on `app/login.tsx`
2. `useAuthStore.login()` calls `edgeFunctions.signInWithTeamCode()` → `auth-operations` Edge Function
3. Edge Function validates team code against `teams` table, signs custom JWT (access 24h, refresh 365d) using `SUPABASE_JWT_SECRET`
4. Tokens stored in AsyncStorage under keys: `auth_access_token`, `auth_refresh_token`, `auth_token_expires_at`
5. `team_number`, `team_id`, `scout_name`, `team_code` also stored in AsyncStorage
6. Zustand `user` object set with `{ id, name, teamNumber, role: 'scouter' }`

**Token Injection into Supabase Client:**
1. `lib/authTokenProvider.ts` holds a function reference `getTokenFn`
2. `useAuthStore` calls `setAuthTokenProvider(getAccessTokenForSupabase)` on store creation
3. `lib/supabase.ts` uses a `customFetch` that calls `getAuthToken()` before every request to inject `Authorization: Bearer <token>`

**Token Refresh:**
1. `getAccessTokenForSupabase()` in `stores/authStore.ts` checks expiry before each Supabase call
2. If within 60s of expiry: calls `edgeFunctions.refreshToken()` → `auth-operations` Edge Function
3. Network errors during refresh keep the user logged in with the existing token (offline tolerance)
4. Auth errors (invalid/expired refresh token) trigger `logout()`

**App Startup Auth Check:**
1. `app/_layout.tsx` calls `checkAuth()` on mount
2. `checkAuth()` reads all stored values; if valid, attempts proactive refresh if near expiry
3. Routing: unauthenticated → `/login`; `role === 'administrator'` → `/(admin)/dashboard`; else → `/(tabs)`

---

## Navigation Architecture

**Root Stack** (`app/_layout.tsx`):
- Wraps everything in `QueryClientProvider`, `GestureHandlerRootView`, `ThemeProvider`
- Mounts `MatchesCacheHydrator` (null-rendering hydration component) and `UpdateAppModal`
- Initial route: `login`
- Gesture disabled globally except for explicitly opted-in screens
- `gestureEnabled: false` is the default to prevent accidental back navigation during scouting

**Route Groups:**
- `app/(tabs)/` — Tab navigator for authenticated scouters (`role = 'scouter'`). Five tabs: Scouting, Analytics, Picklists, Bets, Admin panel tab.
- `app/(admin)/` — Stack navigator gated to `role === 'administrator'`. Single screen: `dashboard`.

**Pre-auth Flow (linear stack):**
`login` → `register-team` → `enter-name` → `verify-team-code` → `create-admin-code` → `team-created`

**Scouting Selection Flow (modal-style stack):**
`select-event` → `select-match` → `select-team` → back to `(tabs)/index`

**Scouter Schedule Flow:**
`scouter-schedules` → `scouter-schedule-edit`; `my-schedule` is a personal view

**QR Transfer Flow:**
`qr-codes` (display QR chunks from `qrCodeStore`) ↔ `scan-qr` (scan and import)

**Settings:**
`settings` — standalone screen accessible from hamburger sidebar, with back button header

---

## State Management Layers

| Layer | Tool | Persistence | Purpose |
|---|---|---|---|
| Global UI state | Zustand stores | AsyncStorage (some) | Auth session, admin unlock, balances, demo mode |
| Server data cache | React Query | In-memory (+ AsyncStorage for matches) | TBA matches, bets, picklists, team stats |
| Local scouting data | SQLite (`frc_scout.db`) | On-device file | Unsynced and in-progress match records |
| User preferences | AsyncStorage | On-device key-value | Selected event, TBA mode, data visibility |

**React Query cache keys** (defined in `config/queryKeys.ts`):
- `teams.detail(teamKey)` — TBA team info
- `bets.user(teamNumber)` — user bet history
- `bets.leaderboard(teamNumber)` — e-bucks leaderboard
- `teamStatistics.*` — EPA blend stats
- `picklists.byTeamAndEvent(teamNumber, eventKey)` — picklist data
- `events.byYear(year)` — TBA events list
- `matches.byEvent(eventKey)` — TBA schedule (also persisted to AsyncStorage)
- `analytics.*` — local/cross-team analytics results
- `scouterAssignments.*` — scouter schedule data
- `rankings(eventKey)` — TBA event rankings

---

## Sync Architecture

**Entry points to sync:**
- Immediate: `syncManager.uploadMatch(match)` called after each `db.saveMatch()` in scouting screen
- Background: `initAutoSync()` listens for network reconnection via NetInfo
- Manual: Sync button in analytics screen triggers `syncManager.fullSync()`

**Sync pipeline classes:**
- `SyncTransformer` (`services/syncTransformer.ts`): Stateless transformer. `transformMatch()` converts `MatchData` (camelCase, JSON string metrics) to Supabase row format (snake_case, parsed metrics, `calculated_points` computed via `calculateMatchPoints()`). `validateMatch()` rejects malformed rows. `detectDuplicates()` fetches remote IDs and sorts local matches into insert/update/skip buckets.
- `SyncManager` (`services/syncTransformer.ts`): Orchestrates upload. `fullSync()` → `db.getUnsyncedMatches()` → `batchUpload()` → batch insert via `supabaseSyncService.batchInsertMatches()` → `db.markAsSynced()` → delete synced rows from local SQLite.
- `SupabaseSyncService` (`services/supabase.sync.ts`): Wraps all Supabase/Edge Function calls. Reads `team_number`, `scout_name`, `team_id` from AsyncStorage. Exposes `insertMatch`, `batchInsertMatches`, `updateMatch`, `getMatches`, `getEventMatches`, `getMatchesForTeamNumber`, `getDeletedMatchIds`, `getAllTeamMatches`.

**Post-sync side effect:**
After successful sync, `teamStatisticsService.refreshTeamStatistics()` is called to refresh the `team_statistics` materialized view in Supabase.

**Tombstone table:**
`match_deletions` table in Supabase acts as a tombstone. Admin-deleted match IDs are excluded from analytics reads via `supabaseSyncService.getDeletedMatchIds()`. During batch insert, matches already in `match_deletions` are skipped and still marked synced locally so they clear from the device.

---

## Cross-Team Data & Data Visibility System

**Visibility modes** (stored in AsyncStorage, managed by `useDataVisibilityStore`):
- `my_team`: Analytics only from own team's scouted data (local SQLite + own Supabase rows)
- `teams_at_event`: All matches scouted by any team at the same event key
- `all_teams`: All matches for any team number across all events

**Why SECURITY DEFINER RPCs are needed:**
Supabase RLS on the `matches` table restricts reads to rows where `team_id = current_team_id`. The `teams` table join (used to resolve `team_id`) is also RLS-restricted. SECURITY DEFINER RPCs run as the function owner (bypassing RLS) and safely expose cross-team data.

**RPC functions** (defined in `migrations/021_cross_team_read_policy.sql`):
- `get_event_matches_cross_team(p_event_key)` — returns all matches for an event across all scouting teams; result includes `scouting_team_number`, `match_timestamp`
- `get_team_number_matches_cross_team(p_team_number, p_event_key)` — returns all matches scouted for a specific robot team number, optionally filtered by event

**Client calls** in `services/supabase.sync.ts`:
- `getEventMatches(eventKey)` → `supabase.rpc('get_event_matches_cross_team', ...)`
- `getMatchesForTeamNumber(teamNumber, eventKey?)` → `supabase.rpc('get_team_number_matches_cross_team', ...)`
- Results mapped via `mapCrossTeamRow()` to `CrossTeamMatch` (extends `MatchData` with `scoutingTeamNumber` and `eventKey`)

---

## Betting System

**Overview:** Virtual currency (e-bucks) betting on FRC match outcomes. Bets can be placed on match winner, point margin range, or over/under total score. Parlays combine multiple bets.

**Odds computation** (`services/bettingService.ts`):
- `AllianceData` is built from three robot teams. For each team, `teamStatisticsService.getTeamAverageWithPhases()` fetches blended stats.
- Alliance average = sum of three team averages; alliance `stdDev = sqrt(var1 + var2 + var3)`
- Win probability computed via `normalCDF` (Abramowitz & Stegun approximation): P(red > blue) using normal distribution over point difference
- Margin range odds use `normalCDFRange(lower, upper, meanDiff, combinedStd)`
- Over/under odds use `normalCDF` against threshold
- Raw probability converted to decimal odds with a 15% house edge margin

**EPA Blend** (`services/teamStatisticsService.ts`):
- `computeBlendedStdDev()` logic by match count:
  - 0–3 matches: EPA std dev only (from Statbotics), optionally blended with prior event std
  - 3–8 matches: Weighted blend of scouted std and EPA std by `confidence = (matchCount - 3) / 5`
  - 8+ matches: Scouted std dev only
- `getTeamYearEPABatch()` fetches EPA from Statbotics API (`api/services/statbotics.ts`)
- `teamStatisticsService.refreshTeamStatistics()` triggers a Supabase refresh of the `team_statistics` materialized view

**E-bucks flow:**
- Earned: `useEbucksStore.earnEbucks(20)` called after each saved match (20 ebucks per match)
- Spent: `bettingService.placeBet()` deducts from balance via `ebucks-balance` Edge Function
- Balance stored in `user_ebucks_balance` Supabase table, with separate `balance` (real) and `balance_demo` columns
- Demo mode (`useDemoStore.isDemoMode`) uses `balance_demo` and accesses prior-year event data

**Bet resolution:**
- `bets` Edge Function resolves bets when TBA match results arrive
- `resolve_bets_batch` RPC (migration 016) batch-resolves pending bets
- `leaderboard` Edge Function serves the e-bucks leaderboard with Supabase Realtime broadcast trigger (migration 015)
- `useBetNotificationStore` holds a pending `BetResolution` that `BetNotificationCard` component displays as an overlay

---

## Admin System

**Admin unlock** (`stores/adminStore.ts`):
- Separate from authentication — any logged-in scouter can attempt to unlock admin features by entering a 4-digit code
- Unlock state persisted to AsyncStorage under `admin_unlocked_at_ms`; survives app restarts
- Exponential backoff lockout: 5 failures triggers 1-minute lock, doubling each failure up to 15-minute cap
- `isUnlocked()` returns true if `unlockedAtMs` is set (no time expiry)
- `lock()` called on logout

**Admin tab** (`app/(tabs)/admin.tsx`):
- Accessible from the Bets tab group even for scouters (guarded by `AdminUnlockGate` component)
- Provides match deletion, admin code management, scouter schedule generation, data export

**Admin dashboard** (`app/(admin)/dashboard.tsx`):
- Only accessible when `user.role === 'administrator'` (set by auth Edge Function if team has admin role)
- Separate route group `(admin)/` with its own Stack layout
- Route protection: `app/(admin)/_layout.tsx` redirects to `/login` if not administrator

**Admin service** (`services/adminService.ts`):
- `AdminService.getTeamContext(teamNumber)` resolves team by number via `get_team_id_by_number` RPC or direct lookup
- Provides match deletion via `match_deletions` table insert (tombstone pattern)
- Admin code management via `edgeFunctions.setAdminCode()`

---

## Component Architecture

**Root-level components** (`components/`):
- `MatchesCacheHydrator` — null-rendering component; seeds React Query cache from AsyncStorage on mount
- `UpdateAppModal` — shown when `useVersionCheck` detects a newer app version
- `SurveyModal` — post-match optional survey modal rendered in scouting screen
- `RapidCounterInput` — custom input for rapid-fire counter metrics (expandable overlay)
- `HamburgerSidebar` — slide-in navigation drawer in the tabs layout header
- `BetNotificationCard` — floating overlay for bet resolution notifications (reads `betNotificationStore`)
- `Themed`, `StyledText`, `ExternalLink`, `EditScreenInfo` — generic UI primitives

**Admin components** (`components/admin/`):
- `AdminCodeInput` — PIN entry form with backoff handling
- `AdminPanel` — admin actions UI (match deletion, schedule management)
- `AdminUnlockGate` — wrapper that shows `AdminCodeInput` or children based on `adminStore.isUnlocked()`

**Betting components** (`components/betting/`):
- `BettingModal` — bet placement modal with dynamic odds display
- `BetNotificationCard` — also in this subdirectory (imported into tabs layout)

---

## Error Handling

**Strategy:** Errors surface via console, Sentry, and React Query error states; no global error boundary beyond Expo Router's built-in `ErrorBoundary` export in `app/_layout.tsx`.

**Patterns:**
- Network errors during token refresh are silently tolerated (user stays logged in offline)
- Auth errors (invalid refresh token) trigger `logout()` and redirect to login
- SQLite connection invalidation (Android `NullPointerException`) triggers `resetConnection()` and automatic retry via `runWithRetry()` in `services/database.ts`
- Supabase/Edge Function failures return `false`/empty arrays; callers log via `console.error`
- Sentry initialized in `app/_layout.tsx` with session replay (10% sample rate, 100% on error)

**Logging:**
- `babel.config.js` strips `console.log/info/debug` in production; `console.error/warn` retained
- Edge Functions use `captureError()` from `supabase/functions/_shared/sentry.ts`

---

*Architecture analysis: 2026-04-07*
