# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
ElectronScout/
├── app/                        # Screens and navigation (Expo Router)
│   ├── (tabs)/                 # Tab navigator group (scouters)
│   ├── (admin)/                # Admin-only stack group
│   ├── _layout.tsx             # Root layout, auth guard, store init
│   ├── login.tsx               # Team code + scout name login
│   ├── register-team.tsx       # New team registration
│   ├── enter-name.tsx          # Scout name entry
│   ├── verify-team-code.tsx    # Team code verification
│   ├── create-admin-code.tsx   # Admin PIN setup
│   ├── team-created.tsx        # Registration success screen
│   ├── select-event.tsx        # TBA event picker
│   ├── select-match.tsx        # TBA match picker for scouting
│   ├── select-team.tsx         # Team number picker for scouting
│   ├── my-schedule.tsx         # Personal scouter schedule
│   ├── scouter-schedules.tsx   # Admin: view all scouter assignments
│   ├── scouter-schedule-edit.tsx # Admin: edit scouter assignments
│   ├── qr-codes.tsx            # Display QR code chunks for transfer
│   ├── scan-qr.tsx             # Camera QR scanner to import data
│   ├── settings.tsx            # App settings screen
│   ├── +html.tsx               # Web-only HTML shell
│   └── +not-found.tsx          # 404 screen
├── components/                 # Shared UI components
│   ├── admin/                  # Admin-specific components
│   ├── betting/                # Betting-specific components
│   └── __tests__/              # Component tests
├── services/                   # Business logic layer
├── stores/                     # Zustand global state
├── hooks/                      # React Query hooks
├── api/                        # External API clients
│   └── services/               # Per-resource API functions
├── lib/                        # Supabase client, auth, Edge Function callers
├── config/                     # Game config, query client, query keys
├── types/                      # TypeScript type definitions
├── constants/                  # Static constants (Colors)
├── migrations/                 # Supabase SQL migrations
├── supabase/
│   └── functions/              # Supabase Edge Functions (Deno)
│       └── _shared/            # Shared utilities (Sentry)
├── assets/                     # Fonts, images, icons
├── .planning/codebase/         # GSD architecture documents
└── dist/                       # EAS build output (generated, not committed)
```

---

## Screen Inventory (`app/`)

### Root-level Screens

| File | Route | Purpose |
|---|---|---|
| `app/_layout.tsx` | (root) | Root Stack layout. Initializes Sentry, stores, auth check. Handles routing decisions (auth/admin/scouter). |
| `app/login.tsx` | `/login` | Primary entry. Team code + scout name form. Calls `useAuthStore.login()`. |
| `app/register-team.tsx` | `/register-team` | TBA team number search + team creation via `edgeFunctions.createTeam()`. |
| `app/enter-name.tsx` | `/enter-name` | Scout name entry during registration. |
| `app/verify-team-code.tsx` | `/verify-team-code` | Displays generated team code after registration. |
| `app/create-admin-code.tsx` | `/create-admin-code` | Admin PIN setup during registration. |
| `app/team-created.tsx` | `/team-created` | Registration success confirmation. |
| `app/select-event.tsx` | `/select-event` | Searches/lists TBA events. Saves `selected_event_key` to AsyncStorage. |
| `app/select-match.tsx` | `/select-match` | Lists TBA schedule for selected event. Navigates to scouting with `matchNumber` + `allianceColor` params. |
| `app/select-team.tsx` | `/select-team` | Team number entry/selection for a match. |
| `app/my-schedule.tsx` | `/my-schedule` | Personal scouter assignment list for current event. |
| `app/scouter-schedules.tsx` | `/scouter-schedules` | Admin: overview of all scouter assignments. |
| `app/scouter-schedule-edit.tsx` | `/scouter-schedule-edit` | Admin: edit/generate assignments for an event. |
| `app/qr-codes.tsx` | `/qr-codes` | Renders QR code chunks from `qrCodeStore.chunks`. |
| `app/scan-qr.tsx` | `/scan-qr` | Camera scanner that imports matches via `parseQRPayload()`. |
| `app/settings.tsx` | `/settings` | Data visibility toggle, demo mode toggle, logout. |
| `app/+html.tsx` | (web) | Web HTML shell. |
| `app/+not-found.tsx` | (*) | 404 fallback. |

### Tab Screens (`app/(tabs)/`)

| File | Tab | Purpose |
|---|---|---|
| `app/(tabs)/_layout.tsx` | (layout) | Tab navigator with hamburger header, e-bucks balance display, `BetNotificationCard`, `HamburgerSidebar`. Guards route to scouter role. |
| `app/(tabs)/index.tsx` | Scouting | Main match scouting form. Renders dynamic phases from `ACTIVE_GAME_CONFIG`. Saves to SQLite, triggers sync, awards e-bucks. |
| `app/(tabs)/analytics.tsx` | Analytics | Team analytics dashboard. Three data sources: local/team/lookup. Renders leaderboard, match history, SVG charts. QR export entry point. |
| `app/(tabs)/picklists.tsx` | Picklists | Drag-and-drop picklist management. First pick, second pick, do not pick categories. |
| `app/(tabs)/betting-history.tsx` | Bets | User bet history and active bets. Entry point to `BettingModal`. |
| `app/(tabs)/admin.tsx` | Admin | Admin panel tab (guarded by `AdminUnlockGate`). Match deletion, schedule management, export. |

### Admin Screens (`app/(admin)/`)

| File | Route | Purpose |
|---|---|---|
| `app/(admin)/_layout.tsx` | (layout) | Stack layout. Guards route to `role === 'administrator'`. |
| `app/(admin)/dashboard.tsx` | `/dashboard` | Administrator dashboard. Team management, match overview. |

---

## Store Inventory (`stores/`)

| File | Export | Persistence | Purpose |
|---|---|---|---|
| `stores/authStore.ts` | `useAuthStore` | AsyncStorage | Auth session. `login()`, `logout()`, `checkAuth()`, `getTeamNumber()`, `getTeamId()`. Token refresh logic lives here. |
| `stores/adminStore.ts` | `useAdminStore` | AsyncStorage (`admin_unlocked_at_ms`) | Admin unlock state. Exponential backoff lockout. `isUnlocked()`, `unlock()`, `lock()`, `recordFailure()`. |
| `stores/ebucksStore.ts` | `useEbucksStore`, `useEffectiveBalance` | Supabase + AsyncStorage | E-bucks balance (real + demo). `initialize()`, `earnEbucks()`, `spendEbucks()`. |
| `stores/demoStore.ts` | `useDemoStore`, `getEffectiveYear()` | AsyncStorage (`demo_mode_enabled`) | Demo mode toggle. `getEffectiveYear()` returns prior year when demo is active. |
| `stores/dataVisibilityStore.ts` | `useDataVisibilityStore` | AsyncStorage (`data_visibility`) | Analytics data scope: `'my_team' \| 'teams_at_event' \| 'all_teams'`. |
| `stores/qrCodeStore.ts` | `useQrCodeStore` | None (in-memory) | Holds QR payload chunks for the `qr-codes` screen. `setChunks()`, `clearChunks()`. |
| `stores/betNotificationStore.ts` | `useBetNotificationStore` | None (in-memory) | Pending bet resolution for overlay display. `showNotification()`, `dismissNotification()`. |
| `stores/scouterScheduleStore.ts` | `useScouterScheduleStore` | None (in-memory) | Navigation flags for scouter schedule screens. `returningFromEdit`, `scheduleGenerating`. |

---

## Service Inventory (`services/`)

| File | Export | Purpose |
|---|---|---|
| `services/database.ts` | `db` (DatabaseService instance) | All SQLite operations. `init()`, `saveMatch()`, `getAllMatches()`, `getUnsyncedMatches()`, `markAsSynced()`, `deleteMatch()`, `ensureReady()`. Includes Android reconnect retry logic. |
| `services/supabase.sync.ts` | `supabaseSyncService` (SupabaseSyncService), `CrossTeamMatch` type | Supabase read/write operations. `insertMatch()`, `batchInsertMatches()`, `updateMatch()`, `getMatches()`, `getEventMatches()`, `getMatchesForTeamNumber()`, `getAllTeamMatches()`, `getDeletedMatchIds()`, `validateTeamCode()`, `getTeamId()`. |
| `services/syncTransformer.ts` | `syncManager` (SyncManager), `SyncTransformer` | Sync orchestration. `SyncTransformer.transformMatch()`, `SyncTransformer.validateMatch()`, `SyncTransformer.detectDuplicates()`. `SyncManager.uploadMatch()`, `batchUpload()`, `fullSync()`, `verifySyncIntegrity()`. |
| `services/syncManager.ts` | `initAutoSync()` | NetInfo listener that triggers `syncManager.fullSync()` on reconnection. |
| `services/analyticsService.ts` | `analyticsService` (AnalyticsService), `TeamAnalytics`, `LeaderboardEntry` | Pure calculation. `calculateTeamAnalytics(matches[])` → `Map<number, TeamAnalytics>`. No I/O. |
| `services/teamStatisticsService.ts` | `teamStatisticsService` (TeamStatisticsService), `TeamStatistics`, `LeagueAverage`, `TeamAverageWithPhases` | Blended EPA stats. `getTeamAverageWithPhases()`, `getTeamStatisticsBatch()`, `getLeagueAverages()`, `refreshTeamStatistics()`. |
| `services/bettingService.ts` | `bettingService` (BettingService), `BetData`, `Bet`, `AllianceData` | Odds computation, bet placement, bet resolution. `computeAllianceData()`, `computeMatchOdds()`, `placeBet()`, `getUserBets()`. |
| `services/picklistService.ts` | `picklistService` (PicklistService), `Picklists` | Picklist CRUD via Edge Functions. `fetchPicklistsFromSupabase()`, `savePicklistsToSupabase()`. |
| `services/adminService.ts` | `adminService` (AdminService), `TeamContext`, `MatchRow` | Admin operations. `getTeamContext()`, `getMatches()`, `deleteMatch()`. |
| `services/exportService.ts` | `exportService` (ExportService) | CSV export of team match data. `exportTeamMatches()` uses `expo-file-system` + `expo-sharing`. |
| `services/qrCodeService.ts` | `chunkMatchesForQR()`, `parseQRPayload()` | QR data encoding. Chunks up to 15 matches per QR payload using compact field names. |
| `services/matchesCacheService.ts` | `matchesCacheService` | AsyncStorage cache for TBA event matches. `fetchAndCache()`, `save()`, `get()`, `clear()`. |
| `services/authService.ts` | (auth helpers) | Supporting auth utilities. |
| `services/scouterScheduleService.ts` | `scouterScheduleService` (ScouterScheduleService), `ScouterAssignment` | Scouter assignment CRUD via Supabase. `getAssignments()`, `saveAssignments()`, `generateSchedule()`. |

---

## Hook Inventory (`hooks/`)

| File | Export | React Query Key | Purpose |
|---|---|---|---|
| `hooks/useAnalytics.ts` | `useAnalyticsLocal`, `useAnalyticsTeam`, `useAnalyticsCrossTeam`, `useTeamLookup` | `queryKeys.analytics.*` | Analytics data fetching. Routes to local SQLite or cross-team RPC based on visibility. |
| `hooks/useEventMatches.ts` | `useEventMatches(eventKey)` | `queryKeys.matches.byEvent(eventKey)` | TBA match schedule for an event. Persisted via `matchesCacheService`. |
| `hooks/useEvents.ts` | `useEvents(year)` | `queryKeys.events.byYear(year)` | TBA events list for a year. |
| `hooks/useTeam.ts` | `useTeam(teamKey)` | `queryKeys.teams.detail(teamKey)` | TBA team info. |
| `hooks/useTeamContext.ts` | `useTeamContext(teamNumber)` | `queryKeys.teamContext(teamNumber)` | Resolves `teamId` from `teamNumber` via `adminService.getTeamContext()`. |
| `hooks/useTeamsForRegister.ts` | `useTeamsForRegister` | — | Teams search during registration. |
| `hooks/useLeaderboard.ts` | `useLeaderboard(teamNumber)` | `queryKeys.bets.leaderboard(teamNumber)` | E-bucks leaderboard. |
| `hooks/useUserBets.ts` | `useUserBets(teamNumber)` | `queryKeys.bets.user(teamNumber)` | User's bet history. |
| `hooks/usePicklistData.ts` | `usePicklistData` | `queryKeys.picklists.byTeamAndEvent(...)` | Picklist fetch + TBA rankings for leaderboard column. |
| `hooks/useMySchedule.ts` | `useMySchedule` | `queryKeys.scouterAssignments.forScouter(...)` | Personal scouter assignments for the session. |
| `hooks/useScouterAssignments.ts` | `useScouterAssignments` | `queryKeys.scouterAssignments.byTeamAndEvent(...)` | All scouter assignments for admin view. |
| `hooks/useVersionCheck.ts` | `useVersionCheck` | — | Compares `expo-constants` app version to latest on App Store/Play Store. Returns `showModal`, `storeUrl`, `latestVersion`. |

---

## Component Inventory (`components/`)

### Root Components

| File | Purpose |
|---|---|
| `components/MatchesCacheHydrator.tsx` | Null-rendering. On mount: loads cached TBA matches from AsyncStorage into React Query. |
| `components/UpdateAppModal.tsx` | Modal shown when version check detects newer app version. |
| `components/HamburgerSidebar.tsx` | Slide-in sidebar with logout, team code display, navigation to settings. |
| `components/SurveyModal.tsx` | Post-match survey modal. Presented after match save in scouting screen. |
| `components/RapidCounterInput.tsx` | Expandable overlay input for rapid-fire counter metrics. |
| `components/Themed.tsx` | `View` and `Text` with auto dark/light theme colors. |
| `components/StyledText.tsx` | Pre-styled text variants (MonoText). |
| `components/ExternalLink.tsx` | Link that opens in system browser. |
| `components/EditScreenInfo.tsx` | Dev-mode info panel. |
| `components/useClientOnlyValue.ts` | Returns different values for SSR vs client (used for `headerShown` on web). |
| `components/useClientOnlyValue.web.ts` | Web-specific override. |
| `components/useColorScheme.ts` | Wraps `useColorScheme` from React Native. |
| `components/useColorScheme.web.ts` | Web-specific color scheme override. |

### Admin Components (`components/admin/`)

| File | Purpose |
|---|---|
| `components/admin/AdminCodeInput.tsx` | 4-digit PIN entry with backoff lockout display. Calls `adminStore.recordFailure()`. |
| `components/admin/AdminPanel.tsx` | Admin action buttons: delete matches, regenerate codes, manage schedules, export. |
| `components/admin/AdminUnlockGate.tsx` | Wraps children; shows `AdminCodeInput` if `adminStore.isUnlocked()` is false. |

### Betting Components (`components/betting/`)

| File | Purpose |
|---|---|
| `components/betting/BettingModal.tsx` | Full-screen bet placement UI. Fetches alliance data, shows dynamic odds, `betType` selector (winner/margin/over_under/parlay), `betAmount` input. |
| `components/betting/BetNotificationCard.tsx` | Floating overlay card displaying resolved bet result (win/loss, payout). Reads `betNotificationStore`. |

---

## API Layer (`api/`)

| File | Purpose |
|---|---|
| `api/client.ts` | Axios instance for The Blue Alliance API. Base URL `https://www.thebluealliance.com/api/v3`. Sets `X-TBA-Auth-Key` header. 10s timeout. |
| `api/statboticsClient.ts` | Axios instance for Statbotics API. |
| `api/types.ts` | TypeScript types: `TBAMatch`, `TBATeam`, `TBAEvent`, `TBAAlliance`, etc. |
| `api/services/matches.ts` | `getEventMatches(eventKey)` — fetches TBA match schedule. |
| `api/services/teams.ts` | `getTeam(teamKey)`, `searchTeams(query)`, `getTeamsAtEvent(eventKey)`. |
| `api/services/events.ts` | `getEventsByYear(year)` — fetches TBA event list. |
| `api/services/statbotics.ts` | `getTeamYearEPABatch(teamNumbers, year)` — fetches EPA data from Statbotics for betting odds. |

---

## Library Layer (`lib/`)

| File | Purpose |
|---|---|
| `lib/supabase.ts` | Supabase client singleton. `auth: { persistSession: false, autoRefreshToken: false }`. Uses `customFetch` to inject JWT via `getAuthToken()` before every request. |
| `lib/authTokenProvider.ts` | Token provider bridge. `setAuthTokenProvider(fn)` — called by `authStore` on init. `getAuthToken()` — called by Supabase client's custom fetch. |
| `lib/edgeFunctions.ts` | Typed wrappers for all Edge Function calls. Uses `EXPO_PUBLIC_SUPABASE_ANON_KEY` as auth (not the custom JWT — Edge Functions validate with service role key server-side). Operations: `signInWithTeamCode`, `refreshToken`, `searchTeamByNumber`, `validateTeamCode`, `createTeam`, `getTeamCode`, `setAdminCode`, `insertMatch`, `batchInsertMatches`, `updateMatch`, `getMatches`, `checkMatchExists`, `getAllTeamMatches`, `fetchPicklists`, `savePicklists`, etc. |

---

## Configuration (`config/`)

| File | Purpose |
|---|---|
| `config/gameConfig.ts` | **Annual update required.** Defines all game phases, metrics, scoring. `ACTIVE_GAME_CONFIG` is the active config. `calculateMatchPoints(metrics)` computes score. `getInitialMatchData()`, `getDefaultsForPhases()`. 2026 "Rebuilt" config is active; 2025 "Reefscape" is commented out. |
| `config/queryClient.ts` | Exports `queryClient` — TanStack Query client singleton. |
| `config/queryKeys.ts` | Centralized query key factory. All `useQuery`/`invalidateQueries` use this. Keys: `teams`, `bets`, `teamStatistics`, `picklists`, `events`, `matches`, `analytics`, `rankings`, `scouterAssignments`, `teamContext`. |

---

## Types (`types/`)

| File | Purpose |
|---|---|
| `types/match.ts` | `MatchData` interface — primary data type for scouted matches. Fields: `id`, `matchNumber`, `teamNumber`, `scouterId`, `gameYear`, `metrics`, `timestamp`, `synced`, `notes`, `survey`, `allianceColor`. |
| `types/auth.ts` | `User` interface — `id`, `name`, `teamNumber`, `role` (`'scouter' \| 'administrator'`). |

---

## Migration Inventory (`migrations/`)

| File | Purpose |
|---|---|
| `003_add_admin_code_to_teams.sql` | Adds `admin_code` column to `teams` table. |
| `004_update_admin_code_format_to_6_digits.sql` | Changes admin code to 6-digit format. |
| `005_create_match_deletions.sql` | Creates `match_deletions` tombstone table with `(team_id, match_id)`. |
| `006_consolidate_picklists_to_single_row.sql` | Picklist schema: single JSON row per team+event instead of per-team. |
| `008_truncate_6_digit_admin_codes_to_4_digits.sql` | Normalizes admin codes to 4 digits. |
| `009_remove_unused_teams_columns.sql` | Schema cleanup. |
| `010_replace_event_id_with_event_key.sql` | Changes `matches.event_id` (integer FK) to `event_key` (string like "2025mndu"). |
| `011_create_team_statistics_view.sql` | Creates `team_statistics` materialized view aggregating match data per team. |
| `012_create_league_averages_table.sql` | Creates `league_averages` table for event-level score baselines. |
| `013_add_trigger_refresh_statistics.sql` | Trigger: refresh `team_statistics` view on match insert/update. |
| `014_create_betting_tables.sql` | Creates `bets` and `user_ebucks_balance` tables. |
| `015_leaderboard_broadcast_trigger.sql` | Supabase Realtime broadcast trigger for leaderboard updates. |
| `016_resolve_bets_batch_rpc.sql` | `resolve_bets_batch(p_match_key, p_red_score, p_blue_score)` RPC. |
| `017_ebucks_atomic_increment_rpc.sql` | `atomic_increment_ebucks(p_user_id, p_amount)` RPC for race-free balance updates. |
| `018_add_team_id_to_team_statistics.sql` | Adds `team_id` FK to `team_statistics` view. |
| `019_auth_custom_jwt_and_cleanup.sql` | Custom JWT config: sets `SUPABASE_JWT_SECRET` for the `auth-operations` Edge Function. |
| `020_enable_rls_all_tables.sql` | Enables Row Level Security on all tables. |
| `021_cross_team_read_policy.sql` | Creates SECURITY DEFINER RPCs: `get_event_matches_cross_team`, `get_team_number_matches_cross_team`. |
| `021_update_ebucks_rpcs_for_team_id.sql` | Updates e-bucks RPCs to use `team_id` instead of user identifier string. |
| `022_fix_current_team_id_search_path.sql` | Fixes `search_path` for RPC functions that use `current_team_id`. |
| `023_add_audit_logs_insert_policy.sql` | RLS policy: allows insert into `audit_logs` table. |
| `024_fix_log_audit_user_id_for_custom_jwt.sql` | Fixes `user_id` extraction from custom JWT claims in audit log trigger. |
| `025_reset_leaderboard_rpc.sql` | `reset_leaderboard()` admin RPC. |
| `026_add_survey_to_matches.sql` | Adds `survey` JSONB column to `matches` table. |
| `027_split_ebucks_demo_vs_real.sql` | Adds `balance_demo` column to `user_ebucks_balance`; separates demo/real balance. |
| `028_create_scouter_assignments.sql` | Creates `scouter_assignments` table for per-match scouter scheduling. |

---

## Edge Function Inventory (`supabase/functions/`)

| Directory | Entry Point | Operations |
|---|---|---|
| `auth-operations/` | `index.ts` | `signInWithTeamCode` — validates team code, returns custom JWT (access + refresh). `refreshToken` — validates refresh token hash, issues new access token. |
| `match-operations/` | `index.ts` | `insertMatch` — inserts single match row with team context. `batchInsertMatches` — batch insert up to 100 matches; checks `match_deletions` tombstone. `updateMatch` — updates existing match metrics/notes/survey. `getMatches` — returns matches for a team (filtered by team_id + event_key). `checkMatchExists` — duplicate check by match_number + team_number. `getAllTeamMatches` — all matches for a team, optionally filtered by event. |
| `team-operations/` | `index.ts` | `searchTeamByNumber`, `validateTeamCode`, `createTeam`, `getTeamCode`, `getTeamNumberByTeamId`, `getTeamIdByNumber`, `setAdminCode`. |
| `bets/` | `index.ts` | Bet placement and resolution. Reads TBA match results to resolve pending bets. |
| `ebucks-balance/` | `index.ts` | E-bucks balance fetch and update via atomic RPC. |
| `leaderboard/` | `index.ts` | E-bucks leaderboard fetch. |
| `picklist-operations/` | `index.ts` | `fetchPicklists`, `savePicklists` — CRUD for team picklists per event. |
| `_shared/sentry.ts` | (shared utility) | `initSentry(functionName)`, `captureError(error)` — shared Sentry setup for Edge Functions. |

---

## Where to Add New Code

**New scouting screen or flow:**
- Add screen file to `app/` or `app/(tabs)/` following file-based routing
- For protected screens, add `Stack.Screen` entry in `app/_layout.tsx`

**New business logic:**
- Add a new service file to `services/`, export a singleton instance
- Prefer class pattern with a single exported instance (e.g., `export const myService = new MyService()`)

**New remote data fetch:**
- Add a hook file to `hooks/` using `useQuery`
- Register query key in `config/queryKeys.ts`
- Add fetch function to `api/services/` for TBA/Statbotics, or use `supabase` client directly

**New global state:**
- Add a Zustand store file to `stores/`
- Initialize in `app/_layout.tsx` `useEffect` if needed on startup

**New Supabase table:**
- Write a numbered migration file in `migrations/` (next sequential number)
- Add RLS policies in the same or a follow-up migration

**New Edge Function:**
- Create directory `supabase/functions/<function-name>/index.ts`
- Import shared Sentry from `../_shared/sentry.ts`
- Add a typed wrapper in `lib/edgeFunctions.ts`

**New shared UI component:**
- Place in `components/` (root-level for general use)
- Place in `components/admin/` or `components/betting/` for domain-specific components

**Annual game config update:**
- Edit only `config/gameConfig.ts`
- Comment out previous year's config, add new year's phases and metrics
- `calculateMatchPoints()` must be updated for new scoring rules

---

## Key AsyncStorage Keys

| Key | Owner | Purpose |
|---|---|---|
| `auth_access_token` | `authStore` | JWT access token |
| `auth_refresh_token` | `authStore` | JWT refresh token |
| `auth_token_expires_at` | `authStore` | Token expiry epoch (seconds) |
| `scout_name` | `authStore` | Logged-in scout display name |
| `team_number` | `authStore` | Team number (string) |
| `team_id` | `authStore` | Supabase `teams.id` UUID |
| `team_code` | `authStore` | Team login code (e.g., "ABC123") |
| `admin_unlocked_at_ms` | `adminStore` | Admin unlock timestamp |
| `demo_mode_enabled` | `demoStore` | "true"/"false" |
| `data_visibility` | `dataVisibilityStore` | "my_team" / "teams_at_event" / "all_teams" |
| `selected_event_key` | Screens | Currently selected TBA event key |
| `selected_event_name` | Screens | Display name for selected event |
| `selected_match_key` | Screens | Selected match key for scouting |
| `selected_match_number` | Screens | Selected match number |
| `selected_team_number` | Screens | Selected team number for scouting |
| `selected_alliance_color` | Screens | "red" / "blue" |
| `cached_event_matches` | `matchesCacheService` | JSON: `{ eventKey, matches: TBAMatch[] }` |
| `ebucks_balance` | `ebucksStore` | Local balance fallback |
| `ebucks_balance_demo` | `ebucksStore` | Local demo balance fallback |
| `tba_mode_enabled` | Scouting screen | Whether TBA-assisted scouting mode is on |

---

*Structure analysis: 2026-04-07*
