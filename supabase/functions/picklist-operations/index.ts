import { createClient } from "npm:@supabase/supabase-js@2";
import { captureError, initSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Sentry
initSentry('picklist-operations');

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

    // Get team_id from team_number
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
      case 'fetchPicklists': {
        if (!teamId) {
          result = { picklists: null };
          break;
        }

        const { eventKey } = params;
        let query = supabase
          .from('picklists')
          .select('team_rankings')
          .eq('team_id', teamId);

        if (eventKey) {
          query = query.eq('event_key', eventKey);
        } else {
          query = query.is('event_key', null);
        }

        const { data, error } = await query.maybeSingle();

        if (error || !data || !data.team_rankings) {
          result = {
            picklists: {
              firstPick: [],
              secondPick: [],
              doNotPick: [],
            },
          };
          break;
        }

        const rankings = data.team_rankings as any;
        result = {
          picklists: {
            firstPick: Array.isArray(rankings.firstPick) ? rankings.firstPick : [],
            secondPick: Array.isArray(rankings.secondPick) ? rankings.secondPick : [],
            doNotPick: Array.isArray(rankings.doNotPick) ? rankings.doNotPick : [],
          },
        };
        break;
      }

      case 'savePicklists': {
        if (!teamId) {
          return new Response(
            JSON.stringify({ error: 'Team ID required. Provide teamNumber parameter.' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const { eventKey, picklists } = params;
        if (!picklists || typeof picklists !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Missing or invalid picklists parameter' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        const teamRankingsJson = {
          firstPick: picklists.firstPick,
          secondPick: picklists.secondPick,
          doNotPick: picklists.doNotPick,
        };

        // Get profile ID for created_by
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id')
          .eq('team_id', teamId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        const createdById = profileData?.id || null;

        // Check if exists
        let existingQuery = supabase
          .from('picklists')
          .select('id')
          .eq('team_id', teamId);

        if (eventKey) {
          existingQuery = existingQuery.eq('event_key', eventKey);
        } else {
          existingQuery = existingQuery.is('event_key', null);
        }

        const { data: existing, error: selectError } = await existingQuery.maybeSingle();

        const updateData: any = {
          team_rankings: teamRankingsJson,
          updated_at: new Date().toISOString(),
        };

        if (existing && selectError?.code !== 'PGRST116') {
          // Update existing
          let updateQuery = supabase
            .from('picklists')
            .update(updateData)
            .eq('team_id', teamId);

          if (eventKey) {
            updateQuery = updateQuery.eq('event_key', eventKey);
          } else {
            updateQuery = updateQuery.is('event_key', null);
          }

          const { error: updateError } = await updateQuery;
          result = { success: !updateError };
        } else {
          // Insert new
          const insertData: any = {
            team_id: teamId,
            event_key: eventKey,
            team_rankings: teamRankingsJson,
            created_by: createdById,
          };

          const { error: insertError } = await supabase
            .from('picklists')
            .insert(insertData);

          result = { success: !insertError };
        }
        break;
      }

      case 'getTeamIdByNumber': {
        result = { teamId };
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
