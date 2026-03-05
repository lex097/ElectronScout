export interface MatchData {
    id: string;
    matchNumber: number;
    teamNumber: number;
    scouterId: string;
    gameYear: number;
    metrics: Record<string, any>;
    timestamp: number;
    synced: boolean;
    notes?: string;
    survey?: Record<string, any>;
    allianceColor?: 'red' | 'blue';
  }