// api/services/events.ts - Event API service functions
import tbaClient from '../client';
import { TBAEvent } from '../types';

/**
 * TBA Ranking data structure
 */
export interface TBARanking {
  rank: number;
  team_key: string;
  wins: number;
  losses: number;
  ties: number;
  qual_average?: number;
  dq?: number;
  matches_played?: number;
  sort_orders?: number[];
  record?: {
    wins: number;
    losses: number;
    ties: number;
  };
  extra_stats?: number[];
}

/**
 * Fetch all events for a given year
 * @param year - The year to fetch events for (e.g., 2025)
 * @returns Promise resolving to array of TBA events
 */
export async function getEventsByYear(year: number): Promise<TBAEvent[]> {
  try {
    const response = await tbaClient.get<TBAEvent[]>(`/events/${year}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching events for year ${year}:`, error);
    throw error;
  }
}

/**
 * Fetch event rankings for a given event
 * @param eventKey - The event key (e.g., "2025mndu")
 * @returns Promise resolving to array of TBA rankings
 */
export async function getEventRankings(eventKey: string): Promise<TBARanking[]> {
  try {
    const response = await tbaClient.get(`/event/${eventKey}/rankings`);
    
    // TBA API v3 returns rankings as an array directly in response.data
    if (!response || !response.data) {
      console.warn('No data in rankings response');
      return [];
    }
    
    // Check if it's already an array (standard TBA API response)
    if (Array.isArray(response.data)) {
      return response.data as TBARanking[];
    }
    
    // Handle case where response might be an object with rankings key
    if (response.data && typeof response.data === 'object' && 'rankings' in response.data) {
      return response.data.rankings as TBARanking[];
    }
    
    // If neither structure matches, return empty array
    console.warn('Unexpected rankings response structure:', response.data);
    return [];
  } catch (error) {
    console.error(`Error fetching rankings for event ${eventKey}:`, error);
    // Return empty array instead of throwing to prevent app crash
    return [];
  }
}

