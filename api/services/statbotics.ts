// api/services/statbotics.ts - Statbotics API service functions
import statboticsClient from '../statboticsClient';

const EPA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes max

// In-memory cache keyed by year + sorted team numbers.
// Same match (same 6 teams) = cache hit = instant when reopening modal.
// New match (different teams) = cache miss = fresh fetch.
const epaCache = new Map<string, { data: Map<number, StatboticsTeamYear>; fetchedAt: number }>();

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
  try {
    const response = await statboticsClient.get<StatboticsTeamYear>(
      `/team_year/${teamNumber}/${year}`
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    // Only log non-404 errors; avoid noisy timeout messages (client interceptor already logs)
    if (error.code !== 'ECONNABORTED' && error.response?.status !== 404) {
      console.warn(`[Statbotics] Error for team ${teamNumber}:`, error.message);
    }
    return null;
  }
}

/**
 * Fetch team EPA for multiple teams in a specific year.
 * In-memory cache keyed by match teams: fresh fetch for new match, instant for repeated modal opens.
 */
export async function getTeamYearEPABatch(
  teamNumbers: number[],
  year: number
): Promise<Map<number, StatboticsTeamYear>> {
  const cacheKey = `${year}:${[...teamNumbers].sort((a, b) => a - b).join(',')}`;
  const now = Date.now();
  const cached = epaCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < EPA_CACHE_TTL_MS) {
    const result = new Map<number, StatboticsTeamYear>();
    teamNumbers.forEach((tn) => {
      const epa = cached.data.get(tn);
      if (epa) result.set(tn, epa);
    });
    return result;
  }

  const epaMap = new Map<number, StatboticsTeamYear>();
  // Throttle to 2 concurrent requests to avoid Statbotics timeouts/rate limits
  const CONCURRENCY = 3;
  for (let i = 0; i < teamNumbers.length; i += CONCURRENCY) {
    const chunk = teamNumbers.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (teamNumber) => {
        const epa = await getTeamYearEPA(teamNumber, year);
        if (epa) epaMap.set(teamNumber, epa);
      })
    );
  }

  epaCache.set(cacheKey, { data: new Map(epaMap), fetchedAt: now });
  return epaMap;
}
