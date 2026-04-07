# Coding Conventions

**Analysis Date:** 2026-04-07

## TypeScript Usage

**Strictness:**
- `strict: true` is set in `tsconfig.json` (extends `expo/tsconfig.base`)
- `any` appears in service layers when mapping Supabase rows (e.g., `row: any` in `services/supabase.sync.ts`, `betDetails: any` in `services/bettingService.ts`) — treat as pragmatic escape hatches around external API shapes, not a general pattern.

**Interfaces vs Types:**
- `interface` is used for data shapes (domain objects, state shapes): `interface MatchData`, `interface AuthState`, `interface EbucksState`
- `type` is used for unions and aliases: `type UserRole = 'scouter' | 'administrator'`, `type DataVisibility = 'my_team' | 'teams_at_event' | 'all_teams'`, `type SortField = 'avgScore' | ...`
- Store state shapes use `interface`, exported data transfer objects use `interface`, string union enumerations use `type`

**Generics:**
- React Query hooks are explicitly typed: `useQuery<ReturnType, Error>({...})`
- Store creators typed via `create<StateInterface>()`
- Generic return types spelled out rather than inferred on hooks

**`as const`:**
- Query key arrays all end with `as const` (see `config/queryKeys.ts`)

## Import Alias

`@/*` maps to the project root (configured in `tsconfig.json` and `babel-preset-expo`).

**Use:**
```typescript
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/services/database';
```

**Mixing:** Some files use `@/` (preferred), others use relative paths (`../services/...`). Prefer `@/` for all new code.

## Naming Conventions

**Files:**
- Screens (Expo Router): `kebab-case.tsx` — `login.tsx`, `select-event.tsx`, `verify-team-code.tsx`
- Services: `camelCase.ts` with descriptive noun — `bettingService.ts`, `analyticsService.ts`, `supabase.sync.ts`
- Stores: `camelCaseStore.ts` — `authStore.ts`, `ebucksStore.ts`, `dataVisibilityStore.ts`
- Hooks: `useCamelCase.ts` — `useAnalytics.ts`, `useUserBets.ts`, `useTeamContext.ts`
- Types: `camelCase.ts` in `types/` — `match.ts`, `auth.ts`

**Exported identifiers:**
- React components: `PascalCase` — `export default function AnalyticsScreen()`, `function TeamLookupTab(...)`
- Zustand stores: `camelCase` starting with `use` — `export const useAuthStore = create<...>()`
- Service singletons: `camelCase` — `export const bettingService = new BettingService()`
- Service classes: `PascalCase` — `class DatabaseService`, `class AdminService`
- Types/interfaces: `PascalCase` — `interface MatchData`, `type DataVisibility`
- Constants and AsyncStorage keys: `SCREAMING_SNAKE_CASE` — `const SCOUT_NAME_KEY = 'scout_name'`

**Query key namespaces** (in `config/queryKeys.ts`): camelCase nested objects — `queryKeys.analytics.local()`, `queryKeys.bets.user(teamNumber)`

## Zustand Store Patterns

**No middleware:** Stores do NOT use `persist` or `devtools` middleware. Persistence is handled manually via AsyncStorage with explicit key constants.

**Structure pattern:**
```typescript
// 1. Define AsyncStorage key constants at top of file
const SOME_KEY = 'some_key';

// 2. Define state interface
interface MyState {
  someValue: string;
  // Actions mixed into state interface
  doSomething: () => Promise<void>;
  initialize: () => Promise<void>;
}

// 3. Helper functions outside the store (pure async helpers)
async function loadFromStorage(): Promise<string | null> { ... }

// 4. Export the store hook directly
export const useMyStore = create<MyState>((set, get) => ({
  someValue: '',
  doSomething: async () => { ... },
  initialize: async () => { ... },
}));
```

**Initialization pattern:** Stores that need hydration expose an `initialize()` async action. It is called in `app/_layout.tsx` inside the root layout component via `useEffect`.

**Selector pattern when consuming:**
```typescript
const isUnlocked = useAdminStore((s) => s.isUnlocked());
const { visibility } = useDataVisibilityStore();
```

## React Query Patterns

**Query client defaults** (`config/queryClient.ts`):
- `staleTime`: 5 minutes
- `gcTime`: 10 minutes
- `retry`: 2
- `refetchOnWindowFocus`: true
- `refetchOnReconnect`: true

**Per-hook overrides:** Most hooks override `staleTime` to `10 * 1000` (10 seconds) for live scouting data. The admin `useTeamContext` uses 500ms. Define as a named constant at the top of the file:
```typescript
const STALE_TIME_MS = 10 * 1000; // 10 seconds
```

**Query function pattern:** Extract the async fetch function outside the hook body as a private named async function:
```typescript
async function fetchUserBets(): Promise<Bet[]> {
  return bettingService.getUserBets();
}

export function useUserBets() {
  return useQuery<Bet[], Error>({
    queryKey: queryKeys.bets.user(teamNumber ?? ''),
    queryFn: fetchUserBets,
    enabled: !!teamNumber,
    staleTime: STALE_TIME_MS,
  });
}
```

**Query key usage:** Always use `queryKeys.*` from `config/queryKeys.ts`. Never inline raw arrays. Invalidate using the `all` sentinel:
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.bets.all });
```

**Conditional enabling:** Use `enabled: !!someValue` to gate queries on required parameters.

## Service Patterns

Services follow the **class + singleton export** pattern:
```typescript
export class MyService {
  async doThing(): Promise<Result> { ... }
}

export const myService = new MyService();
```

Consumers import the singleton: `import { analyticsService } from '@/services/analyticsService'`

Exception: pure utility functions in `services/qrCodeService.ts` are exported as standalone functions (no class needed).

**Private class members:** `private` keyword used for internal state and helpers (e.g., `private db`, `private MOCK_MODE`, `private async getTeamNumber()`).

**Mock mode flag:** `supabase.sync.ts` has a `private MOCK_MODE = false` toggle for development without auth — keep disabled in production.

## Component Patterns

**Styling:**
- All styles use `StyleSheet.create({...})` at the bottom of the file — never inline style objects for production code.
- Named style keys use `camelCase`: `styles.container`, `styles.buttonText`, `styles.emptyState`.

**Color palette (dark theme throughout):**
- Background: `#1a1a1a` (primary), `#2a2a2a` (cards/inputs)
- Border: `#404040`
- Primary accent: `#ff6600` (FRC orange)
- Text primary: `#fff` or `#e5e5e5`
- Text secondary: `#b0b0b0`, `#9ca3af`
- Error/destructive: `#ef4444`
- Activity indicators: `#ff6600`

**Theming:** The app is always dark. `DarkTheme` from `@react-navigation/native` is applied globally. No light/dark toggle.

**SafeAreaView:** Use `SafeAreaView` from `react-native-safe-area-context` (not the built-in) for all screen roots.

**Icon library:** `@expo/vector-icons` (Ionicons is most commonly used): `<Ionicons name="search-outline" size={64} color="#9ca3af" />`

**Sub-components:** Isolated sub-components defined above the default export in the same file when they encapsulate independent state (e.g., `TeamLookupTab` in `analytics.tsx`).

**Animations:** Use `Animated` from React Native with `useRef(new Animated.Value(0))`. Always set `useNativeDriver: true` where possible.

## Error Handling Patterns

**User-facing errors:** Use `Alert.alert('Title', 'Message')` from `react-native`. This is the primary user error surface — used in 12 files with 47 total occurrences.

**Logging:** `console.error(...)` for unexpected failures, `console.warn(...)` for recoverable issues. Both survive production build stripping. `console.log/info/debug` are stripped in production by `babel-plugin-transform-remove-console`.

**Sentry:** Initialized once in `app/_layout.tsx` via `Sentry.init({...})` and the root component is wrapped with `Sentry.wrap(...)`. `Sentry.captureException` is used in Edge Functions (`supabase/functions/_shared/sentry.ts`) but not yet called explicitly in the React Native app code — the `Sentry.wrap` boundary captures unhandled JS errors automatically.

**Network-aware errors** (pattern from `stores/authStore.ts`):
```typescript
function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('fetch') || msg.includes('Network') || msg.includes('ETIMEDOUT') || ...;
}
// Usage: stay logged in on network error, log out on auth error
if (!isNetworkError(error)) { await logout(); }
```

**Try/catch pattern:** Catch blocks use `error` (not `e` or `err`) as the variable name. Type narrowing via `error instanceof Error ? error.message : String(error)`.

**SQLite column migration:** Missing columns are added with ALTER TABLE in a try/catch that silently ignores "column already exists" errors.

## AsyncStorage Key Conventions

Keys are defined as `const` at the top of the file using `SCREAMING_SNAKE_CASE`:

```typescript
const SCOUT_NAME_KEY = 'scout_name';
const TEAM_NUMBER_KEY = 'team_number';
const TEAM_ID_KEY = 'team_id';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'auth_token_expires_at';
const EBUCKS_BALANCE_KEY = 'ebucks_balance';
const ADMIN_UNLOCK_KEY = 'admin_unlocked_at_ms';
const VISIBILITY_KEY = 'data_visibility';
```

Key strings use `snake_case`. Never hardcode a key string inline — always reference the constant.

## SQLite Schema Conventions

**Database name:** `frc_scout.db`
**Primary table:** `matches`

Column naming: `snake_case` — `match_number`, `team_number`, `scouter_id`, `game_year`, `synced`

JSON storage: Complex objects (metrics, survey) stored as `TEXT` and serialized with `JSON.stringify` on write, `JSON.parse` on read.

Boolean columns: Stored as `INTEGER` (0/1): `synced INTEGER DEFAULT 0`

Timestamps: Unix epoch as `INTEGER` (milliseconds): `timestamp INTEGER NOT NULL`

Indexes: Created on frequently queried columns: `idx_match_number`, `idx_team_number`, `idx_synced`

Column additions: Done with `ALTER TABLE ... ADD COLUMN` inside a try/catch (idempotent migration pattern).

## Supabase / RLS Patterns

Supabase calls are made directly through the `supabase` client from `@/lib/supabase`. Heavy operations go through Edge Functions accessed via `@/lib/edgeFunctions`.

Row mapping: Database rows returned as `any` are mapped to typed interfaces via dedicated mapping functions (e.g., `mapCrossTeamRow(row: any): CrossTeamMatch`).

RLS: SQL migration files in `migrations/` define row-level security policies. Policies are named descriptively in the migration SQL.

## Production Build Notes

**Console stripping:** `babel.config.js` applies `transform-remove-console` with `exclude: ['error', 'warn']`. In production builds, all `console.log`, `console.info`, and `console.debug` calls are removed. Only `console.error` and `console.warn` survive.

**expo-sqlite web mock:** `metro.config.js` mocks expo-sqlite to an empty module on web (the app is not designed for web use).

**OTA updates:** Expo Updates handles over-the-air updates. Native builds use EAS.

## Linting and Formatting

No project-level `.eslintrc`, `eslint.config.js`, or `.prettierrc` file exists. There are no configured lint or test scripts in `package.json`. Code style is enforced by convention and TypeScript strict mode only.

---

*Convention analysis: 2026-04-07*
