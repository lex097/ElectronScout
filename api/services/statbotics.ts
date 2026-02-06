// api/services/statbotics.ts - Statbotics API service functions
import statboticsClient from '../statboticsClient';

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
      mean: number; // This is the EPA we want
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
    console.log(`📡 [STATBOTICS API] Calling API for team ${teamNumber}, year ${year}`);
    console.log(`📡 [STATBOTICS API] Endpoint: /team_year/${teamNumber}/${year}`);
    
    const response = await statboticsClient.get<StatboticsTeamYear>(
      `/team_year/${teamNumber}/${year}`
    );
    
    console.log(`✅ [STATBOTICS API] Success for team ${teamNumber}:`, {
      status: response.status,
      hasData: !!response.data,
      epaValue: response.data?.epa?.total_points?.mean || 'N/A',
    });
    
    return response.data;
  } catch (error: any) {
    // Statbotics returns 404 if team/year doesn't exist
    if (error.response?.status === 404) {
      console.log(`⚠️ [STATBOTICS API] 404 - No data found for team ${teamNumber} in year ${year}`);
      return null;
    }
    console.error(`❌ [STATBOTICS API] Error fetching EPA for team ${teamNumber} year ${year}:`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      data: error.response?.data,
    });
    return null;
  }
}

/**
 * Fetch team EPA for multiple teams in a specific year
 * @param teamNumbers - Array of team numbers
 * @param year - The year
 * @returns Promise resolving to Map of team number to StatboticsTeamYear
 */
export async function getTeamYearEPABatch(
  teamNumbers: number[],
  year: number
): Promise<Map<number, StatboticsTeamYear>> {
  console.log(`📡 [STATBOTICS API] Batch fetch starting for ${teamNumbers.length} teams (year ${year}):`, teamNumbers);
  
  const epaMap = new Map<number, StatboticsTeamYear>();
  
  // Statbotics doesn't have a batch endpoint, so we fetch individually
  // Use Promise.allSettled to handle failures gracefully
  const promises = teamNumbers.map(async (teamNumber) => {
    console.log(`📡 [STATBOTICS API] Fetching EPA for team ${teamNumber}...`);
    const epa = await getTeamYearEPA(teamNumber, year);
    if (epa) {
      epaMap.set(teamNumber, epa);
      console.log(`✅ [STATBOTICS API] Team ${teamNumber} EPA added to map`);
    } else {
      console.log(`⚠️ [STATBOTICS API] Team ${teamNumber} EPA not found or failed`);
    }
  });

  console.log(`📡 [STATBOTICS API] Waiting for all ${teamNumbers.length} requests to complete...`);
  const results = await Promise.allSettled(promises);
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  console.log(`📊 [STATBOTICS API] Batch fetch complete: ${successful} successful, ${failed} failed, ${epaMap.size} teams with EPA data`);
  
  return epaMap;
}
