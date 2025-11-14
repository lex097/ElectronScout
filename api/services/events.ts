// api/services/events.ts - Event API service functions
import tbaClient from '../client';
import { TBAEvent } from '../types';

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

