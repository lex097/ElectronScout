// api/services/matches.ts - Match API service functions
import tbaClient from '../client';
import { TBAMatch } from '../types';

/**
 * Fetch all matches for a given event
 * @param eventKey - The event key (e.g., "2025mndu")
 * @returns Promise resolving to array of TBA matches, sorted with qualification matches first
 */
export async function getEventMatches(eventKey: string): Promise<TBAMatch[]> {
  try {
    const response = await tbaClient.get<TBAMatch[]>(`/event/${eventKey}/matches`);
    const matches = response.data;

    // Sort matches: qualification matches (qm) first, then by match number
    return matches.sort((a, b) => {
      // Define comp_level priority: qm < qf < sf < f
      const compLevelPriority: Record<string, number> = {
        qm: 1,
        qf: 2,
        sf: 3,
        f: 4,
      };

      const aPriority = compLevelPriority[a.comp_level] || 99;
      const bPriority = compLevelPriority[b.comp_level] || 99;

      // First sort by comp_level priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Then sort by match_number
      return a.match_number - b.match_number;
    });
  } catch (error) {
    console.error(`Error fetching matches for event ${eventKey}:`, error);
    throw error;
  }
}

