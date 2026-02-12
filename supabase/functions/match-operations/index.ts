import { createClient } from "npm:@supabase/supabase-js@2";
import { initSentry, captureError } from "../_shared/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Sentry
initSentry('match-operations');

async function getDeletedMatchIds(
  supabase: any,
  teamId: string,
  matchIds: string[]
): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from('match_deletions')
      .select('match_id')
      .eq('team_id', teamId)
      .in('match_id', matchIds);

    if (error) return new Set();
    return new Set((data || []).map((r: any) => String(r.match_id)));
  } catch {
    return new Set();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let operation: string | undefined;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    operation = requestBody.operation;
    const { operation: _, teamNumber, ...params } = requestBody;

    // Validate operation parameter
    if (!operation || typeof operation !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid operation parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get team_id from team_number (required for most operations)
    let teamId: string | null = null;
    if (teamNumber) {
      const { data: teamIdData, error: teamIdError } = await supabase
        .rpc('get_team_id_by_number', { team_num: teamNumber });

      if (!teamIdError && teamIdData) {
        teamId = typeof teamIdData === 'string' ? teamIdData : null;
      } else {
        const { data: teamData } = await supabase
          .from('teams')
          .select('id')
          .eq('team_number', teamNumber)
          .single();
        teamId = teamData?.id || null;
      }
    }

    let result;

    switch (operation) {
      case 'getTeamIdByNumber': {
        result = { teamId };
        break;
      }

      case 'validateTeamCode': {
        const { teamCode } = params;
        const { data, error } = await supabase
          .rpc('validate_team_code_and_get_id', { code: teamCode });

        if (error || !data) {
          const { data: teamData } = await supabase
            .from('teams')
            .select('id')
            .eq('team_code', teamCode)
            .single();
          result = { teamId: teamData?.id || null };
        } else {
          result = { teamId: typeof data === 'string' ? data : null };
        }
        break;
      }

      case 'insertMatch': {
        if (!teamId) {
          return new Response(
            JSON.stringify({ error: 'Team ID required. Provide teamNumber parameter.' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const { match, scoutName } = params;
        const deleted = await getDeletedMatchIds(supabase, teamId, [match.id]);
        if (deleted.has(match.id)) {
          result = { success: true, skipped: true };
          break;
        }

        const insertData = {
          id: match.id,
          team_id: teamId,
          event_key: match.event_key || null,
          match_number: match.match_number,
          team_number: match.team_number,
          scout_name: scoutName || match.scout_name,
          game_year: match.game_year,
          metrics: match.metrics,
          calculated_points: match.calculated_points,
          notes: match.notes,
          timestamp: match.timestamp,
        };

        const { error } = await supabase
          .from('matches')
          .insert(insertData);

        result = { success: !error };
        break;
      }

      case 'batchInsertMatches': {
        if (!teamId) {
          return new Response(
            JSON.stringify({ error: 'Team ID required. Provide teamNumber parameter.' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const { matches, scoutName } = params;
        const batchSize = 100;
        const insertedIds: string[] = [];
        const failedIds: string[] = [];
        const skippedDeletedIds: string[] = [];

        for (let i = 0; i < matches.length; i += batchSize) {
          const batch = matches.slice(i, i + batchSize);
          const deletedSet = await getDeletedMatchIds(supabase, teamId, batch.map(b => b.id));
          const filteredBatch = batch.filter(b => !deletedSet.has(b.id));
          skippedDeletedIds.push(...batch.filter(b => deletedSet.has(b.id)).map(b => b.id));

          const insertData = filteredBatch.map(m => ({
            id: m.id,
            team_id: teamId,
            event_key: m.event_key || null,
            match_number: m.match_number,
            team_number: m.team_number,
            scout_name: m.scout_name || scoutName,
            game_year: m.game_year,
            metrics: m.metrics,
            calculated_points: m.calculated_points,
            notes: m.notes,
            timestamp: m.timestamp,
          }));

          if (insertData.length === 0) continue;

          const { data, error } = await supabase
            .from('matches')
            .insert(insertData)
            .select('id');

          if (error) {
            failedIds.push(...insertData.map(d => d.id));
          } else {
            insertedIds.push(...(data || []).map(d => String(d.id)));
          }
        }

        result = { insertedIds, skippedDeletedIds, failedIds };
        break;
      }

      case 'updateMatch': {
        const { matchId, updates } = params;
        if (!matchId) {
          return new Response(
            JSON.stringify({ error: 'Missing matchId parameter' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        if (!updates || typeof updates !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Missing or invalid updates parameter' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        
        const { error } = await supabase
          .from('matches')
          .update(updates)
          .eq('id', matchId);

        result = { success: !error };
        break;
      }

      case 'getMatches': {
        if (!teamId) {
          result = { matches: [] };
          break;
        }

        const { eventKey } = params;
        let query = supabase
          .from('matches')
          .select('*')
          .eq('team_id', teamId)
          .order('match_number', { ascending: true });

        if (eventKey) {
          query = query.eq('event_key', eventKey);
        }

        const [{ data, error }, { data: deletionsData }] = await Promise.all([
          query,
          supabase
            .from('match_deletions')
            .select('match_id')
            .eq('team_id', teamId),
        ]);

        if (error) {
          result = { matches: [] };
          break;
        }

        const deletedMatchIds = new Set((deletionsData || []).map(d => String(d.match_id)));
        const filteredMatches = (data || []).filter(m => !deletedMatchIds.has(String(m.id)));

        result = { matches: filteredMatches };
        break;
      }

      case 'checkMatchExists': {
        if (!teamId) {
          result = { exists: false };
          break;
        }

        const { matchNumber, teamNumber: teamNumberScouted } = params;
        const { data, error } = await supabase
          .from('matches')
          .select('id')
          .eq('team_id', teamId)
          .eq('match_number', matchNumber)
          .eq('team_number', teamNumberScouted)
          .limit(1);

        result = { exists: !error && (data?.length || 0) > 0 };
        break;
      }

      case 'getAllTeamMatches': {
        if (!teamId) {
          result = { matches: [] };
          break;
        }

        const { eventKey } = params;
        let query = supabase
          .from('matches')
          .select('*')
          .eq('team_id', teamId)
          .order('timestamp', { ascending: false });

        if (eventKey) {
          query = query.eq('event_key', eventKey);
        }

        const [{ data: matchesData, error }, { data: deletionsData }] = await Promise.all([
          query,
          supabase
            .from('match_deletions')
            .select('match_id')
            .eq('team_id', teamId),
        ]);

        if (error) {
          result = { matches: [] };
          break;
        }

        const deletedMatchIds = new Set((deletionsData || []).map(d => String(d.match_id)));
        const filteredMatches = (matchesData || []).filter(m => !deletedMatchIds.has(String(m.id)));

        result = {
          matches: filteredMatches.map(m => ({
            id: m.id,
            matchNumber: m.match_number,
            teamNumber: m.team_number,
            scouterId: m.scout_name || 'Unknown',
            gameYear: m.game_year,
            metrics: m.metrics,
            notes: m.notes || '',
            timestamp: m.timestamp,
            synced: true,
          })),
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown operation: ${operation}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Function error:', error);
    
    // Capture error to Sentry with context
    await captureError(error instanceof Error ? error : new Error(String(error)), {
      operation: operation || 'unknown',
      method: req.method,
      url: req.url,
    });

    // Determine appropriate status code
    const statusCode = error instanceof Error && (
      error.message.includes('required') || 
      error.message.includes('Missing') ||
      error.message.includes('invalid')
    ) ? 400 : 500;

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
