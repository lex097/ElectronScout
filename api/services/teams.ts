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

/**
 * Fetch all teams from TBA API with pagination
 * @param pageNum - Page number (starts at 0, each page returns up to 500 teams)
 * @returns Promise resolving to array of TBA team data
 */
export async function getAllTeams(pageNum: number = 0): Promise<TBATeam[]> {
  try {
    const response = await tbaClient.get<TBATeam[]>(`/teams/${pageNum}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching teams page ${pageNum}:`, error);
    throw error;
  }
}

