// api/services/teams.ts - Team API service functions
import tbaClient from '../client';
import { TBATeam } from '../types';

/**
 * Fetch team information by team key
 * @param teamKey - The team key (e.g., "frc254")
 * @returns Promise resolving to TBA team data
 */
export async function getTeam(teamKey: string): Promise<TBATeam> {
  try {
    const response = await tbaClient.get<TBATeam>(`/team/${teamKey}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching team ${teamKey}:`, error);
    throw error;
  }
}

