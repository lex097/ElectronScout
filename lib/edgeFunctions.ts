// lib/edgeFunctions.ts
// Client helper for calling Supabase Edge Functions

const EDGE_FUNCTION_BASE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(functionName: string, body: any) {
  const response = await fetch(`${EDGE_FUNCTION_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Edge function call failed' }));
    throw new Error(error.error || `Edge function call failed: ${response.status}`);
  }

  return await response.json();
}

export const edgeFunctions = {
  // Team operations
  async searchTeamByNumber(teamNumber: number) {
    return callEdgeFunction('team-operations', {
      operation: 'searchTeamByNumber',
      teamNumber,
    });
  },

  async validateTeamCode(teamCode: string) {
    return callEdgeFunction('team-operations', {
      operation: 'validateTeamCode',
      teamCode,
    });
  },

  async createTeam(teamNumber: number, teamName?: string) {
    return callEdgeFunction('team-operations', {
      operation: 'createTeam',
      teamNumber,
      teamName,
    });
  },

  async getTeamCode(teamId: string) {
    return callEdgeFunction('team-operations', {
      operation: 'getTeamCode',
      teamId,
    });
  },

  async getTeamNumberByTeamId(teamId: string) {
    return callEdgeFunction('team-operations', {
      operation: 'getTeamNumberByTeamId',
      teamId,
    });
  },

  async setAdminCode(teamId: string, adminCode: string) {
    return callEdgeFunction('team-operations', {
      operation: 'setAdminCode',
      teamId,
      adminCode,
    });
  },

  async validateAdminCode(adminCode: string, teamId: string) {
    return callEdgeFunction('team-operations', {
      operation: 'validateAdminCode',
      adminCode,
      teamId,
    });
  },

  async checkAdminCodeExists(teamId: string) {
    return callEdgeFunction('team-operations', {
      operation: 'checkAdminCodeExists',
      teamId,
    });
  },

  // Match operations
  async getTeamIdByNumber(teamNumber: number) {
    return callEdgeFunction('match-operations', {
      operation: 'getTeamIdByNumber',
      teamNumber,
    });
  },

  async insertMatch(teamNumber: number, match: any, scoutName?: string) {
    return callEdgeFunction('match-operations', {
      operation: 'insertMatch',
      teamNumber,
      match,
      scoutName,
    });
  },

  async batchInsertMatches(teamNumber: number, matches: any[], scoutName?: string) {
    return callEdgeFunction('match-operations', {
      operation: 'batchInsertMatches',
      teamNumber,
      matches,
      scoutName,
    });
  },

  async updateMatch(matchId: string, updates: any) {
    return callEdgeFunction('match-operations', {
      operation: 'updateMatch',
      matchId,
      updates,
    });
  },

  async getMatches(teamNumber: number, eventKey?: string) {
    return callEdgeFunction('match-operations', {
      operation: 'getMatches',
      teamNumber,
      eventKey,
    });
  },

  async checkMatchExists(teamNumber: number, matchNumber: number, teamNumberScouted: number) {
    return callEdgeFunction('match-operations', {
      operation: 'checkMatchExists',
      teamNumber,
      matchNumber,
      teamNumber: teamNumberScouted,
    });
  },

  async getAllTeamMatches(teamNumber: number, eventKey?: string) {
    return callEdgeFunction('match-operations', {
      operation: 'getAllTeamMatches',
      teamNumber,
      eventKey,
    });
  },

  // Picklist operations
  async fetchPicklists(teamNumber: number, eventKey: string | null) {
    return callEdgeFunction('picklist-operations', {
      operation: 'fetchPicklists',
      teamNumber,
      eventKey,
    });
  },

  async savePicklists(teamNumber: number, eventKey: string | null, picklists: any) {
    return callEdgeFunction('picklist-operations', {
      operation: 'savePicklists',
      teamNumber,
      eventKey,
      picklists,
    });
  },
};
