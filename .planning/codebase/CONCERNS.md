# Codebase Concerns

**Analysis Date:** 2026-04-07

---

## Security Concerns

**Edge Functions Use Service Role Key With No Caller Authentication:**
- Issue: All four Edge Functions (`auth-operations`, `match-operations`, `team-operations`, `picklist-operations`) instantiate a Supabase service-role client via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. The functions are authenticated only by the Supabase anon key sent from the client (`lib/edgeFunctions.ts:11`). Any caller with the anon key (which is bundled in the app binary and visible) can invoke any operation, including `batchInsertMatches`, `updateMatch`, `setAdminCode`, and `createTeam`. There is no JWT verification of the caller's identity inside the Edge Functions themselves.
- Files: `lib/edgeFunctions.ts:6-12`, `supabase/functions/match-operations/index.ts:39-41`, `supabase/functions/team-operations/index.ts:21-23`
- Impact: A malicious user who knows the anon key can insert arbitrary match data for any team by supplying a valid `teamNumber`. The `batchInsertMatches` path trusts the `teamNumber` parameter from the request body.
- Fix approach: Validate the Authorization header JWT inside each Edge Function and compare `app_metadata.team_id` against the requested `teamNumber` before performing writes.

**`updateMatch` Has No Ownership Check:**
- Issue: The `updateMatch` case in `match-operations/index.ts:234` updates any row by `matchId` without checking that the row belongs to the calling team's `team_id`. Supabase RLS would normally enforce this, but the Edge Function uses the service role client, which bypasses RLS entirely.
- Files: `supabase/functions/match-operations/index.ts:213-241`
- Impact: A caller knowing a match UUID from another team could overwrite that team's scouted data.
- Fix approach: Add `.eq('team_id', teamId)` to the update query so the update is scoped to the verified team.

**Admin Code Stored and Compared in Plaintext:**
- Issue: The 4-digit admin code is stored in the `teams.admin_code` column and compared with a direct equality check in `team-operations/index.ts:255`. There is no hashing or timing-safe comparison.
- Files: `supabase/functions/team-operations/index.ts:242-255`, `services/adminService.ts:79-87`
- Impact: If the `teams` table is ever exposed (e.g., a future RLS misconfiguration), admin codes are readable. The code space is only 10,000 values.
- Fix approach: Hash admin codes with bcrypt/SHA-256 before storage (matching pattern already used for refresh tokens in `auth-operations/index.ts:15-21`).

**Sentry `sendDefaultPii: true` With Session Replay Enabled:**
- Issue: `app/_layout.tsx:29` sets `sendDefaultPii: true`. Combined with `Sentry.mobileReplayIntegration()` at line 37 and `replaysOnErrorSampleRate: 1`, on-screen content (including scout names and team codes being typed) may be captured.
- Files: `app/_layout.tsx:24-41`
- Impact: Scout names, team codes, and possibly partial scouting data could be sent to Sentry. The scout name is a user-entered free text field with no PII redaction configured.
- Fix approach: Set `sendDefaultPii: false` or configure Sentry masking rules for the scout name input field and team code input field.

**CORS Allows All Origins on Edge Functions:**
- Issue: All four Edge Functions set `'Access-Control-Allow-Origin': '*'`. Since calls are authenticated only by the anon key (which is public), this means browser-based attackers can make cross-origin requests to these functions.
- Files: `supabase/functions/auth-operations/index.ts:8`, `supabase/functions/match-operations/index.ts:5`, `supabase/functions/team-operations/index.ts:5`, `supabase/functions/picklist-operations/index.ts:5`
- Current mitigation: The app only runs on mobile, so CSRF is less of a concern, but combined with the missing JWT verification above, this broadens the attack surface.

**Admin Lock-Out State is In-Memory Only:**
- Issue: The admin unlock brute-force protection (`stores/adminStore.ts`) stores `failedAttempts` and `lockUntilMs` only in Zustand memory. Killing and restarting the app resets the counter.
- Files: `stores/adminStore.ts:67-128`
- Impact: A user can bypass the exponential back-off by restarting the app after each failed attempt.
- Fix approach: Persist `failedAttempts` and `lockUntilMs` to AsyncStorage so they survive app restarts.

---

## Offline / Sync Edge Cases

**Duplicate `selected_event_key` Reads Spread Across 10+ Files:**
- Issue: The string `'selected_event_key'` is a raw AsyncStorage key read directly in `services/syncTransformer.ts:8`, `app/(tabs)/index.tsx:24`, `app/(tabs)/analytics.tsx:222`, `app/(tabs)/picklists.tsx:40`, `components/MatchesCacheHydrator.tsx:9`, `app/scouter-schedules.tsx:163`, and more. There is no single source of truth constant.
- Files: 10+ call sites spread across `app/`, `services/`, and `components/`
- Impact: A typo in any one read site silently fetches `null` and syncs matches without an `event_key`, polluting the `matches` table with null `event_key` rows.
- Fix approach: Export a single `SELECTED_EVENT_KEY` constant from a shared constants file.

**Matches Synced Without `event_key` Are Permanently Orphaned:**
- Issue: If a user scouts matches before selecting an event (or if the AsyncStorage read for `selected_event_key` returns `null` due to a race), the match is uploaded with `event_key: null` (`syncTransformer.ts:53`). No migration or cleanup path exists for null-event-key rows.
- Files: `services/syncTransformer.ts:53`, `services/syncTransformer.ts:130`, `services/syncTransformer.ts:186`
- Impact: Null-event-key matches are excluded from event-scoped analytics queries but remain in the database. They accumulate silently.
- Fix approach: Warn the user before submitting if no event is selected. Alternatively, provide an admin utility to reassign orphaned rows.

**Auto-Sync Fires on Every Network State Change, No Debounce:**
- Issue: `services/syncManager.ts:6-16` registers a `NetInfo.addEventListener` that calls `syncManager.fullSync()` every time `isConnected` becomes true. Network state can flip multiple times in rapid succession (e.g., switching between WiFi and cellular), triggering concurrent sync attempts.
- Files: `services/syncManager.ts:6-16`
- Impact: Concurrent `fullSync()` calls can result in duplicate upload attempts. The duplicate detection in `syncTransformer.ts:70-104` does a remote fetch each time, which is expensive and may produce race conditions.
- Fix approach: Add a debounce (e.g., 2-3 seconds) or a mutex flag to prevent overlapping sync runs.

**`fullSync` Deletes Local Synced Rows After Upload, No Rollback:**
- Issue: `syncManager.fullSync()` at `syncTransformer.ts:285-291` deletes all locally synced rows after upload. If the app crashes between `markAsSynced` and `deleteMatch`, the row survives in a `synced=1` state and is cleaned up on the next sync. However, if `batchInsertMatches` partially fails (some IDs in `failedIds`), those rows are NOT marked synced—correct—but if `markAsSynced` itself fails (e.g., SQLite connection error on Android), the row may be deleted on the next pass without being confirmed uploaded.
- Files: `services/syncTransformer.ts:210-216`, `services/syncTransformer.ts:285-291`
- Impact: Low probability, but a match submission could be silently lost.

**Duplicate Detection Fetches Full Remote Match List:**
- Issue: `SyncTransformer.detectDuplicates()` (`syncTransformer.ts:70-104`) calls `supabaseSyncService.getMatches()` which retrieves all matches for the team from Supabase, then compares IDs in memory. With many scouted matches across multiple events, this becomes a large payload.
- Files: `services/syncTransformer.ts:79`, `services/supabase.sync.ts:270-283`
- Impact: At scale (100+ matches), this fetch is slow and increases data usage. No pagination exists.
- Fix approach: Pass local match IDs to the server and let the server return which ones already exist (a set-membership RPC).

**Refresh Token Not Rotated on Use:**
- Issue: The `refreshToken` operation in `auth-operations/index.ts:145-212` issues a new access token but does NOT rotate (replace) the refresh token. The same refresh token UUID remains valid for its full 365-day lifetime.
- Files: `supabase/functions/auth-operations/index.ts:145-212`
- Impact: If a refresh token is intercepted (e.g., via AsyncStorage backup on a rooted device), it can be replayed indefinitely for up to a year without the user being able to invalidate it short of a team code change.
- Fix approach: Issue a new refresh token hash on each use and delete the old one, following standard token rotation.

---

## Performance Concerns

**`app/(tabs)/analytics.tsx` Is 2,171 Lines — a Megacomponent:**
- Issue: The analytics screen is a single file with 2,171 lines containing all data fetching, charting, team lookup, and filter logic. There are no sub-components extracted.
- Files: `app/(tabs)/analytics.tsx`
- Impact: Any change to this file risks regressions across unrelated functionality. Renders are expensive because the entire component re-renders on any state change. React DevTools profiling is difficult.
- Fix approach: Extract at minimum the team lookup panel, the team analytics card, and the cross-team analytics view into separate components.

**`services/bettingService.ts` Is 1,408 Lines — Monolithic Service:**
- Issue: All odds calculation, bet placement, bet resolution, match result fetching, and eligibility checking live in one class.
- Files: `services/bettingService.ts`
- Impact: Difficult to test individual concerns; any import of the service loads all 1,408 lines. Circular dependency risk.

**`teamStatisticsService.refreshTeamStatistics()` Called Redundantly on Every Odds Calculation:**
- Issue: `refreshTeamStatistics()` is called before every `calculateMatchOdds`, `getBettingDataOrFallback`, `checkBettingEligibility`, and `calculateAllianceAverages` call (`bettingService.ts:160,254,397,744`). Although there is a 30-second TTL guard (`teamStatisticsService.ts:961-972`), opening a betting modal triggers multiple parallel paths that each call it.
- Files: `services/bettingService.ts:160,254,397,744`, `services/teamStatisticsService.ts:968-985`
- Impact: Under the TTL, the RPC is called once per 30-second window per service instance, but the TTL is in-memory and resets if the service instance is garbage-collected or the module is reloaded.

**SQLite `getAllMatches()` Is Unbounded:**
- Issue: `db.getAllMatches()` (`services/database.ts:129-137`) fetches every row with `SELECT *`. It is called from `syncTransformer.ts:286` (after every sync), `syncTransformer.ts:311,325` (integrity verify), and `app/(tabs)/analytics.tsx:211`.
- Files: `services/database.ts:129-137`, `services/syncTransformer.ts:286`
- Impact: After a full event (60-80 matches), this is fast. Across multiple events over a season, rows accumulate until synced rows are deleted. Still bounded for typical usage, but no `LIMIT` or event-scoped query is used in the post-sync cleanup path.

**Statbotics API Has No Result Cache Across Sessions:**
- Issue: `api/services/statbotics.ts` throttles concurrent requests but does not cache results in AsyncStorage. Every app launch re-fetches EPA data from Statbotics for the same teams.
- Files: `api/services/statbotics.ts`
- Impact: At a competition with spotty internet, Statbotics fetches fail silently, degrading betting odds to 50/50 fallback without warning.

---

## Missing Error Handling

**`db.getAllMatches()` Called Without `ensureReady()` Guard in Several Paths:**
- Issue: `services/database.ts:129` checks `if (!this.db) throw new Error(...)` directly, bypassing the `runWithRetry` wrapper used in `saveMatch`. The Android NullPointerException (invalid native handle) handling only covers write paths.
- Files: `services/database.ts:129-137,140-149,152-159`
- Impact: On Android, if the native SQLite handle becomes invalid mid-session, read operations throw unhandled errors rather than retrying.
- Fix approach: Wrap read operations in `runWithRetry` as well, or route all operations through `ensureReady`.

**`initAutoSync()` Error is Silently Dropped:**
- Issue: `services/syncManager.ts:13` calls `syncManager.fullSync()` and logs the count, but any thrown error from `fullSync()` propagates to the unhandled promise rejection handler. There is no `.catch()` on the auto-sync invocation.
- Files: `services/syncManager.ts:13-15`

**`resolveBet` Uses Non-Atomic Balance Update:**
- Issue: `bettingService.ts:900-949` resolves a single bet by first updating the `bets` row status, then doing a separate `SELECT` + `UPDATE` on `user_ebucks_balance`. If the app closes between these two operations, the bet is marked won but the balance is never credited.
- Files: `services/bettingService.ts:900-948`
- Impact: This code path is only reached for single-bet resolution (not the batch RPC path). The batch resolution path at line 1381 correctly uses `resolve_bets_batch` RPC. The single-bet path should be removed or also use the RPC.

**`earnEbucks` Updates Local State Before DB Confirmation:**
- Issue: `stores/ebucksStore.ts:165-172` updates `AsyncStorage` and Zustand state with the new balance optimistically, even if the `increment_earned_ebucks` RPC fails. The error at line 162 is logged but not acted upon — the in-memory balance is already incremented.
- Files: `stores/ebucksStore.ts:155-177`
- Impact: If the DB call fails, the displayed balance is higher than the persisted balance. On next `refreshBalance()`, the balance resets downward, which looks like a bug to the user.

**`fetchTeamLookup` in `useAnalytics.ts` Has Dead Filter Code:**
- Issue: `hooks/useAnalytics.ts:85-91` contains commented-out logic and a filter that always returns `true` (`return true; // Will be filtered by myTeamNumber below`). The actual filtering happens 6 lines later. The intermediate filter is a no-op and creates misleading code.
- Files: `hooks/useAnalytics.ts:85-91`

**`score_breakdown` Field Access Uses Undocumented Fallback Chain:**
- Issue: Bet resolution at `bettingService.ts:1156-1157` accesses scores via `scoreBreakdown.red.totalPoints ?? scoreBreakdown.red.score ?? matchResult.alliances.red.score`. The `totalPoints` vs `score` field varies by TBA API version and game year. If none of the fallbacks are present (e.g., for playoff re-scoring), the score defaults to `0`, which would incorrectly resolve all bets as losses.
- Files: `services/bettingService.ts:1156-1157`

---

## Incomplete Features / Known Gaps

**`fetchCrossTeamAnalytics` `all_teams` Branch is Identical to `teams_at_event`:**
- Issue: `hooks/useAnalytics.ts:56-71` has an `if/else` for `teams_at_event` vs `all_teams` visibility, but both branches call `supabaseSyncService.getEventMatches(eventKey)` with no difference. The `all_teams` path should call `getMatchesForTeamNumber` or a different scope, but it does not.
- Files: `hooks/useAnalytics.ts:61-66`
- Impact: The `all_teams` data visibility setting has no different behavior from `teams_at_event` in cross-team analytics mode.

**`GAME_2025` Config is Commented Out — No Archive Strategy:**
- Issue: The 2025 Reefscape game config (`config/gameConfig.ts:74-183`) is entirely commented out. Historical match data from 2025 events has `game_year: 2025`, but the scoring logic for those metrics is no longer available at runtime. `calculateMatchPoints` from the active 2026 config will produce incorrect scores if applied to 2025 metrics.
- Files: `config/gameConfig.ts:74-183`, `config/gameConfig.ts:278`
- Impact: Analytics and betting odds for any teams with 2025 historical data will compute incorrect `calculated_points`. The `syncTransformer.ts:33` always runs `calculateMatchPoints` with the active config regardless of `game_year`.
- Fix approach: Maintain a config registry keyed by year and dispatch `calculateMatchPoints` by `game_year`.

**`GAME_2026` Config Uses Placeholder Game Name "Rebuilt":**
- Issue: The active game config (`config/gameConfig.ts:188-189`) has `gameName: "Rebuilt"`. FRC game names for 2026 are not yet officially announced (as of April 2026). This name is a placeholder.
- Files: `config/gameConfig.ts:188-189`
- Impact: The game name appears in the UI during match scouting. If/when the real game name is announced, every deployed build must be OTA-updated.

**No Schema Migration for `event_key` on Existing Local SQLite DBs:**
- Issue: Migration `010_replace_event_id_with_event_key.sql` runs on Supabase but the local SQLite schema in `services/database.ts:65-100` does not have a migration mechanism. The `event_key` column does not appear in the SQLite schema at all — matches are synced to Supabase with an `event_key` pulled from AsyncStorage at sync time, not stored locally.
- Files: `services/database.ts:65-100`
- Impact: Local matches have no event scoping; analytics that use local data (`fetchLocalAnalytics`) show all-time data regardless of selected event, which may confuse users at a new event.

**Migration Gap: No `007_` File:**
- Issue: Migrations jump from `006_consolidate_picklists_to_single_row.sql` to `008_truncate_6_digit_admin_codes_to_4_digits.sql`. There is no `007_` file.
- Files: `migrations/` directory
- Impact: If migrations are applied sequentially by number, any tooling that enforces sequential numbering will halt. The actual Supabase state may be correct if `007` was applied via the dashboard directly, but there is no local record.

**`021_` Prefix Collision:**
- Issue: There are two migration files prefixed `021_`: `021_cross_team_read_policy.sql` and `021_update_ebucks_rpcs_for_team_id.sql`.
- Files: `migrations/021_cross_team_read_policy.sql`, `migrations/021_update_ebucks_rpcs_for_team_id.sql`
- Impact: If these are applied by `supabase db push`, one will overwrite or conflict with the other depending on sort order. The `021_cross_team_read_policy.sql` file contains only comments (no DDL), suggesting the actual DDL was applied via MCP and the file was committed as a record, which creates confusion.

---

## Data Integrity Risks

**`synced` Flag is an Integer in SQLite (0/1) But Treated as Boolean:**
- Issue: The SQLite column is `synced INTEGER DEFAULT 0`, but the `rowToMatch` mapper at `services/database.ts:244` uses `synced: row.synced === 1`. If a future migration or direct DB write uses `2` or `-1` for the synced column (e.g., for a "sync failed" state), the comparison breaks silently.
- Files: `services/database.ts:77,244`

**`leagueAverage` Table Writes Are Per-Team, Not Shared:**
- Issue: `teamStatisticsService.updateLeagueAverage()` writes a league average scoped to the current `team_id`. Each team maintains its own league average. The `getLeagueAverage()` also reads by team scope. Two teams at the same event see different league averages depending on which teams they have scouted.
- Files: `services/teamStatisticsService.ts:990-1013`
- Impact: Betting odds consistency breaks if team A and team B are at the same event but have different league averages, leading to inconsistent odds for the same match.

**`resolveBet` Does Not Prevent Double-Resolution:**
- Issue: `bettingService.ts:900-949` updates bet status without first checking if the bet is already resolved. The batch path (`resolve_bets_batch` RPC) presumably guards against this at the DB level, but the single-bet path used for manual resolution does not.
- Files: `services/bettingService.ts:900-910`

**`betDetails.margin` Legacy Field Kept Alongside New `lowerBound/upperBound`:**
- Issue: `BetData.betDetails` at `bettingService.ts:40-52` contains both a legacy `margin` field (a single threshold) and the newer `lowerBound/upperBound` stdev-based range system. The resolution code at `bettingService.ts:1290-1330` branches on which fields are present. Old bets from before the margin range system was introduced resolve via legacy logic.
- Files: `services/bettingService.ts:40-52`, `services/bettingService.ts:521-529`
- Impact: Long-lived pending bets (across multiple sessions) may be resolved by different logic than they were originally priced with.

---

## Hardcoded Values That Should Be Config

**Win Probability Score Normalization Hardcoded to `200`:**
- Issue: `bettingService.ts:484,488` uses `/ 200` to normalize a team's average score into a win probability adjustment when only one alliance has data. The value `200` is game-specific (a reasonable average score for one game year may be 50 or 300 points in another).
- Files: `services/bettingService.ts:484,488`
- Fix approach: Derive this from `leagueAverage.avgMatchScore` or expose it as a constant in `gameConfig.ts`.

**Betting Win Probability Clamped to `[0.2, 0.8]` Regardless of Data Quality:**
- Issue: `bettingService.ts:481` hard-clamps `redWinProbData` to `[0.2, 0.8]`, meaning the system will never quote odds better than 4:1 on any winner bet, even if one alliance is dramatically stronger.
- Files: `services/bettingService.ts:481`

**Mock Team Number and Code Hardcoded in Production Code:**
- Issue: `services/supabase.sync.ts:41-43` and `services/authService.ts:11-12` contain `MOCK_TEAM_NUMBER = 1234`, `MOCK_SCOUT_NAME = 'Test Scout'`, and `MOCK_TEAM_CODE = 'ABC123'`. Although `MOCK_MODE = false`, this dead code ships in production builds (Babel only strips `console.log`, not dead code branches).
- Files: `services/supabase.sync.ts:40-43`, `services/authService.ts:11-12`
- Fix approach: Remove all mock-mode branches and constants; use real testing infrastructure.

**`EARNED_PER_MATCH = 20` E-Bucks Hardcoded:**
- Issue: `stores/ebucksStore.ts:23` defines the per-match reward as a magic constant with no connection to game config or server-side configuration.
- Files: `stores/ebucksStore.ts:23`
- Impact: Changing the reward requires a new app build.

**`ACCESS_TOKEN_EXPIRY_HOURS = 24` and `REFRESH_TOKEN_EXPIRY_DAYS = 365` Hardcoded in Edge Function:**
- Issue: `supabase/functions/auth-operations/index.ts:12-13` hardcodes token lifetimes.
- Files: `supabase/functions/auth-operations/index.ts:12-13`

---

## Annual Update Requirements

**`config/gameConfig.ts` Must Be Updated Each FRC Season:**
- Issue: `config/gameConfig.ts:278` exports `ACTIVE_GAME_CONFIG = GAME_2026`. Every FRC season requires:
  1. A new `GAME_YYYY` config with updated phases, metric IDs, point values, and survey questions.
  2. Export of `ACTIVE_GAME_CONFIG` pointing to the new config.
  3. An EAS build and submission (OTA is not guaranteed for native-change-free updates when the game name changes in strings).
- Files: `config/gameConfig.ts:186-278`
- Risk: If not updated before the new season, the scouting form will show 2026 metrics for a different game. Prior-year data stored with old metric IDs will not calculate correctly.

**Score Normalization Constants in `bettingService.ts` Are Game-Specific:**
- The `/ 200` normalization and the `[0.2, 0.8]` win probability clamps may need review each season as average match scores change significantly between FRC games.
- Files: `services/bettingService.ts:481,484,488`

**`score_breakdown` Field Names Change Each Game Year:**
- `bettingService.ts:1156` accesses `scoreBreakdown.red.totalPoints` — this field name is specific to certain FRC game years. TBA's `score_breakdown` schema changes annually.
- Files: `services/bettingService.ts:1156-1157`

---

## Platform Compatibility

**`expo-sqlite` is Mocked to an Empty Module on Web:**
- Issue: `metro.config.js:15-17` resolves `expo-sqlite` to an empty module on the web platform. Any code that calls `db.init()` or `db.saveMatch()` on web silently does nothing (the module is empty, so all exports are undefined).
- Files: `metro.config.js:15-17`, `services/database.ts`
- Impact: The app is functionally broken on web — scouting data cannot be saved locally. This is an intentional "not supported" decision, but there is no user-facing error or warning when running on web.

**Android SQLite NullPointerException on Handle Invalidation:**
- Issue: A specific Android bug where the native SQLite handle becomes invalid is handled in `services/database.ts:8-14` with `isConnectionInvalidError`. Only write paths (`saveMatch`) are wrapped in `runWithRetry`; read paths (`getAllMatches`, `getMatchesByTeam`, `getUnsyncedMatches`) check `if (!this.db) throw` but do not retry.
- Files: `services/database.ts:52-63,129-159`
- Impact: On affected Android devices, a mid-session native handle invalidation causes read operations to throw, breaking analytics display without recovery.

---

## Code Quality Issues

**`selected_event_key` String Literal Duplicated in 10+ Files:**
- There is no shared constant for this AsyncStorage key. Any typo silently returns `null`.
- Files: Appears as raw string in `services/syncTransformer.ts`, `app/(tabs)/index.tsx`, `app/(tabs)/analytics.tsx`, `app/(tabs)/picklists.tsx`, `app/scouter-schedules.tsx`, `components/MatchesCacheHydrator.tsx`, `components/admin/AdminPanel.tsx`, `app/my-schedule.tsx`, `app/select-event.tsx`

**Pervasive Use of `any` Type in Critical Data Paths:**
- `supabase.sync.ts:13`, `supabase.sync.ts:270`, `supabase.sync.ts:302`, `supabase.sync.ts:327`, `supabase.sync.ts:365`: Supabase row responses are typed as `any`, removing type safety for all cross-team match mapping.
- `supabase/functions/match-operations/index.ts:13`: The `supabase` client passed to `getDeletedMatchIds` is typed as `any`.
- Files: `services/supabase.sync.ts`, `supabase/functions/match-operations/index.ts`

**No Tests of Any Kind:**
- The `CLAUDE.md` documents that "There are no lint or test commands configured." There are no `*.test.ts` or `*.spec.ts` files anywhere in the project.
- Impact: Critical paths (sync, bet resolution, odds calculation) have zero automated test coverage. Regressions in betting resolution math or sync logic will only be caught at runtime.

**`getMatches` Returns `any[]`:**
- `supabase.sync.ts:270` declares the return type as `Promise<any[]>`. All downstream callers cast rows manually, making future schema changes invisible to TypeScript.
- Files: `services/supabase.sync.ts:270`

---

## Dependency Risks

**`@sentry/react-native: ^7.11.0` — Major Version Mismatch:**
- The package is pinned to `^7.x` but the current Sentry React Native SDK major version is 6.x LTS / 5.x. Version `7.x` is a breaking-change pre-release series. Dependency resolution may pull in unstable builds.
- Files: `package.json`

**`@types/react-native: ^0.72.8` — Mismatched With `react-native: 0.81.5`:**
- The installed React Native is version `0.81.5` but the type definitions are `^0.72.x`. This is an 8-minor-version gap. Type mismatches for newer APIs (e.g., new props on built-in components) will be silently missed.
- Files: `package.json`

**`react-native-chart-kit: ^6.12.0` — Unmaintained:**
- `react-native-chart-kit` has had no meaningful updates since 2021 and is not compatible with React 19 without patches. It is used alongside `echarts` in the analytics screen.
- Files: `app/(tabs)/analytics.tsx`

---

*Concerns audit: 2026-04-07*
