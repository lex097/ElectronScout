// config/queryKeys.ts - Centralized query keys for TanStack Query
// Use these for useQuery, useMutation, queryClient.invalidateQueries, etc.

export const queryKeys = {
  /** Team data from TBA API */
  teams: {
    all: ['teams'] as const,
    detail: (teamKey: string) => ['teams', teamKey] as const,
    list: (page: number) => ['teams', 'list', page] as const,
  },

  /** User bets and leaderboard */
  bets: {
    all: ['bets'] as const,
    user: (teamNumber: string) => ['bets', 'user', teamNumber] as const,
    match: (matchKey: string) => ['bets', 'match', matchKey] as const,
    leaderboard: (teamNumber: string) => ['bets', 'leaderboard', teamNumber] as const,
  },

  /** Team statistics (EPA, blended stats, etc.) */
  teamStatistics: {
    all: ['teamStatistics'] as const,
    team: (teamNumber: number, eventKey?: string) =>
      ['teamStatistics', teamNumber, eventKey ?? null] as const,
    batch: (teamNumbers: number[], eventKey?: string) =>
      ['teamStatistics', 'batch', teamNumbers, eventKey ?? null] as const,
    event: (eventKey: string) => ['teamStatistics', 'event', eventKey] as const,
  },

  /** Picklists (first pick, second pick, do not pick) */
  picklists: {
    all: ['picklists'] as const,
    byTeamAndEvent: (teamNumber: string, eventKey: string) =>
      ['picklists', teamNumber, eventKey] as const,
  },

  /** Events from TBA API */
  events: {
    all: ['events'] as const,
    byYear: (year: number) => ['events', year] as const,
  },

  /** Event matches from TBA API */
  matches: {
    all: ['matches'] as const,
    byEvent: (eventKey: string) => ['matches', eventKey] as const,
  },

  /** Analytics (local DB + Supabase team data) */
  analytics: {
    all: ['analytics'] as const,
    local: () => ['analytics', 'local'] as const,
    team: (eventKey: string) => ['analytics', 'team', eventKey] as const,
  },

  /** Event rankings from TBA API (for picklists) */
  rankings: (eventKey: string) => ['rankings', eventKey] as const,
} as const;
