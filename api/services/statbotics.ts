// api/services/statbotics.ts - Statbotics API service functions
import statboticsClient from '../statboticsClient';

const EPA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Per-team cache: key = "year:teamNumber". Shared across all batch calls.
const epaCache = new Map<string, { data: StatboticsTeamYear | null; fetchedAt: number }>();
// In-flight dedup: prevent parallel fetches for the same team
const epaInFlight = new Map<string, Promise<StatboticsTeamYear | null>>();

/**
 * Statbotics Team Year data structure
 * Based on Statbotics API v3 documentation
 * Endpoint: /v3/team_year/{team}/{year}
 */
export interface StatboticsTeamYear {
  team: number;
  year: number;
  epa: {
    total_points: {
      mean: number; // EPA mean
      sd?: number; // Standard deviation for normal distribution odds
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Fetch team EPA for a specific year from Statbotics
 * @param teamNumber - The team number (e.g., 8429)
 * @param year - The year (e.g., 2026)
 * @returns Promise resolving to StatboticsTeamYear or null if not found
 */
export async function getTeamYearEPA(
  teamNumber: number,
  year: number
): Promise<StatboticsTeamYear | null> {
  const cacheKey = `${year}:${teamNumber}`;
  const now = Date.now();
  const cached = epaCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < EPA_CACHE_TTL_MS) return cached.data;

  const inFlight = epaInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = statboticsClient
    .get<StatboticsTeamYear>(`/team_year/${teamNumber}/${year}`)
    .then(r => r.data)
    .catch((error: any) => {
      const status = error.response?.status;
      if (error.code !== 'ECONNABORTED' && status !== 404 && status !== 500) {
        console.warn(`[Statbotics] Error for team ${teamNumber}:`, error.message);
      }
      return null;
    })
    .finally(() => epaInFlight.delete(cacheKey));

  epaInFlight.set(cacheKey, promise);
  const result = await promise;
  epaCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

/**
 * Fetch EPA for multiple teams. Per-team cache means repeated calls with overlapping
 * team sets never re-fetch a team that was already loaded within the TTL window.
 */
export async function getTeamYearEPABatch(
  teamNumbers: number[],
  year: number
): Promise<Map<number, StatboticsTeamYear>> {
  const results = await Promise.all(teamNumbers.map(tn => getTeamYearEPA(tn, year)));
  const epaMap = new Map<number, StatboticsTeamYear>();
  teamNumbers.forEach((tn, i) => {
    if (results[i]) epaMap.set(tn, results[i]!);
  });
  return epaMap;
}
