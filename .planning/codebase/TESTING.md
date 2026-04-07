# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:** None configured for the application codebase.

**Test Config:** No `jest.config.*` or `vitest.config.*` exists at the project root. `jest.config.js` files present under `node_modules/` belong to dependencies only.

**Run Commands:**
```bash
# No test scripts configured in package.json
# "scripts" only contains: start, android, ios, web
```

**devDependencies related to testing:**
- `react-test-renderer@19.1.0` — installed but not used (no test files exist)
- No `jest`, `@testing-library/react-native`, or any test runner is listed in devDependencies

## Test Coverage

**Application test files:** Zero. There are no `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files anywhere outside of `node_modules/`.

**What is tested:** Nothing via automated tests.

**What is not tested (by area):**

- `services/database.ts` — SQLite CRUD operations, retry logic, connection reset
- `services/bettingService.ts` — odds calculation (`normalCDF`), bet resolution, parlay logic
- `services/analyticsService.ts` — EPA blending, team statistics aggregation
- `services/syncTransformer.ts` — match data transformation before Supabase upload
- `services/supabase.sync.ts` — sync orchestration, cross-team match queries
- `stores/authStore.ts` — token refresh logic, offline/network-error branching
- `stores/adminStore.ts` — lockout escalation, failure counting
- `config/queryKeys.ts` — query key structure (no type tests)
- `hooks/useAnalytics.ts`, `hooks/useUserBets.ts`, etc. — React Query behavior
- All screens in `app/` — rendering, user interactions

## Manual Testing Approach

The project relies entirely on manual testing via the Expo dev client:

```bash
npx expo start          # Run in dev mode
npx expo start --ios    # Run on iOS simulator
npx expo start --android # Run on Android emulator/device
```

**Supabase local testing:**
```bash
npx supabase start                 # Start local Supabase stack
npx supabase functions serve       # Serve Edge Functions locally
```

**Mock mode:** `services/supabase.sync.ts` contains a `private MOCK_MODE = false` toggle that can be set to `true` to bypass auth and use hardcoded values (`MOCK_TEAM_NUMBER = 1234`, `MOCK_SCOUT_NAME = 'Test Scout'`) for manual testing without a live backend.

## Recommendations for Adding Tests

### Highest Value Targets

**1. Betting odds calculation (`services/bettingService.ts`)**
The `normalCDF` and `normalCDFRange` math functions are pure and side-effect-free — ideal unit test candidates. Bugs here affect real currency (e-bucks).

```typescript
// Example: test normalCDF approximation
describe('normalCDF', () => {
  it('returns 0.5 for z=0', () => {
    expect(normalCDF(0, 0, 1)).toBeCloseTo(0.5, 2);
  });
});
```

**2. Analytics calculations (`services/analyticsService.ts`)**
`calculateTeamAnalytics` is a pure transformation from `MatchData[]` to `Map<number, TeamAnalytics>`. Easy to unit test with fixture data.

**3. Sync transformer (`services/syncTransformer.ts`)**
Data transformation before Supabase upload — pure mapping logic, no I/O.

**4. AsyncStorage key consistency**
Integration tests verifying that auth store writes and reads the same key constants.

### Setup Required to Add Tests

Install a test runner and React Native testing library:

```bash
npx expo install jest-expo @testing-library/react-native
```

Add `jest.config.js`:
```javascript
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|zustand)'
  ],
};
```

Add to `package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

Mock `expo-sqlite` for test environments (it is already mocked for web in `metro.config.js` — the same stub can be reused for jest).

### Test Placement Convention

When tests are added, co-locate them with the source file or use a `__tests__` subdirectory matching the source directory structure:

```
services/
  bettingService.ts
  __tests__/
    bettingService.test.ts
stores/
  __tests__/
    authStore.test.ts
```

---

*Testing analysis: 2026-04-07*
