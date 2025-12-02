// api/types.ts - TypeScript interfaces for TBA API responses

/**
 * Alliance data structure from TBA API
 */
export interface Alliance {
  team_keys: string[];
  score?: number;
  surrogate_team_keys?: string[];
  dq_team_keys?: string[];
}

/**
 * Match alliances structure
 */
export interface MatchAlliances {
  red: Alliance;
  blue: Alliance;
}

/**
 * TBA Event data structure
 */
export interface TBAEvent {
  key: string;
  name: string;
  event_code: string;
  event_type: number;
  district?: {
    abbreviation: string;
    display_name: string;
    key: string;
    year: number;
  };
  city?: string;
  state_prov?: string;
  country?: string;
  start_date: string;
  end_date: string;
  year: number;
  short_name?: string;
  event_type_string?: string;
  week?: number;
  address?: string;
  postal_code?: string;
  gmaps_place_id?: string;
  gmaps_url?: string;
  lat?: number;
  lng?: number;
  location_name?: string;
  timezone?: string;
  website?: string;
  first_event_id?: string;
  first_event_code?: string;
  webcasts?: Array<{
    type: string;
    channel: string;
    date?: string;
    file?: string;
  }>;
  division_keys?: string[];
  parent_event_key?: string;
  playoff_type?: number;
  playoff_type_string?: string;
}

/**
 * TBA Match data structure
 */
export interface TBAMatch {
  key: string;
  comp_level: 'qm' | 'qf' | 'sf' | 'f';
  set_number: number;
  match_number: number;
  alliances: MatchAlliances;
  winning_alliance?: 'red' | 'blue';
  event_key: string;
  time?: number;
  actual_time?: number;
  predicted_time?: number;
  post_result_time?: number;
  score_breakdown?: Record<string, any>;
  videos?: Array<{
    type: string;
    key: string;
  }>;
}

/**
 * TBA Team data structure
 */
export interface TBATeam {
  key: string;
  team_number: number;
  nickname?: string;
  name: string;
  school_name?: string;
  city?: string;
  state_prov?: string;
  country?: string;
  address?: string;
  postal_code?: string;
  gmaps_place_id?: string;
  gmaps_url?: string;
  lat?: number;
  lng?: number;
  location_name?: string;
  website?: string;
  rookie_year?: number;
  motto?: string;
  home_championship?: Record<string, any>;
}

