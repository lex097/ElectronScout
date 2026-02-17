import { createClient } from "npm:@supabase/supabase-js@2";
import { captureError, initSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Sentry
initSentry('team-operations');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let operation: string | undefined;
  try {
    // Get service role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    operation = requestBody.operation;
    const { operation: _, ...params } = requestBody;

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

    let result;

    switch (operation) {
      case 'searchTeamByNumber': {
        const { teamNumber } = params;
        const { data: teamId, error: rpcError } = await supabase
          .rpc('get_team_id_by_number', { team_num: teamNumber });

        if (rpcError || !teamId) {
          const { data: teamData, error: queryError } = await supabase
            .from('teams')
            .select('id, team_code')
            .eq('team_number', teamNumber)
            .single();

          if (queryError || !teamData) {
            result = { exists: false };
            break;
          }

          result = {
            exists: true,
            teamId: teamData.id,
            teamCode: teamData.team_code || undefined,
          };
          break;
        }

        const teamIdStr = typeof teamId === 'string' ? teamId : null;
        if (!teamIdStr) {
          result = { exists: false };
          break;
        }

        const { data: teamData, error: codeError } = await supabase
          .from('teams')
          .select('team_code')
          .eq('id', teamIdStr)
          .single();

        result = codeError || !teamData
          ? { exists: true, teamId: teamIdStr }
          : {
              exists: true,
              teamId: teamIdStr,
              teamCode: teamData.team_code || undefined,
            };
        break;
      }

      case 'validateTeamCode': {
        const { teamCode } = params;
        const { data, error } = await supabase
          .rpc('validate_team_code_and_get_id', { code: teamCode });

        if (error || !data) {
          const { data: teamData, error: queryError } = await supabase
            .from('teams')
            .select('id')
            .eq('team_code', teamCode)
            .single();

          if (queryError) {
            result = { teamId: null };
            break;
          }

          result = { teamId: teamData?.id || null };
          break;
        }

        result = { teamId: typeof data === 'string' ? data : null };
        break;
      }

      case 'createTeam': {
        const { teamNumber, teamName } = params;
        if (!teamNumber || typeof teamNumber !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Missing or invalid teamNumber parameter' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        
        const adminCode = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
        
        const { data: newTeam, error: insertError } = await supabase
          .from('teams')
          .insert({
            team_number: teamNumber,
            team_name: teamName || `Team ${teamNumber}`,
            admin_code: adminCode,
          })
          .select('id, team_code, admin_code')
          .single();

        if (insertError || !newTeam) {
          throw new Error(insertError?.message || 'Failed to create team');
        }

        // Wait for trigger to generate code if needed
        if (!newTeam.team_code) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: teamData, error: fetchError } = await supabase
            .from('teams')
            .select('team_code, admin_code')
            .eq('id', newTeam.id)
            .single();

          if (fetchError || !teamData?.team_code) {
            throw new Error('Team created but team code not generated');
          }

          result = {
            teamId: newTeam.id,
            teamCode: teamData.team_code,
            adminCode: teamData.admin_code || adminCode,
          };
        } else {
          result = {
            teamId: newTeam.id,
            teamCode: newTeam.team_code,
            adminCode: newTeam.admin_code || adminCode,
          };
        }
        break;
      }

      case 'getTeamCode': {
        const { teamId } = params;
        const { data, error } = await supabase
          .from('teams')
          .select('team_code')
          .eq('id', teamId)
          .single();

        result = { teamCode: error || !data ? null : data.team_code || null };
        break;
      }

      case 'getTeamNumberByTeamId': {
        const { teamId } = params;
        const { data, error } = await supabase
          .from('teams')
          .select('team_number')
          .eq('id', teamId)
          .single();

        result = { teamNumber: error || !data ? null : data.team_number || null };
        break;
      }

      case 'setAdminCode': {
        const { teamId, adminCode } = params;
        if (!teamId) {
          return new Response(
            JSON.stringify({ error: 'Missing teamId parameter' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        if (!adminCode || !/^[0-9]{4}$/.test(adminCode)) {
          return new Response(
            JSON.stringify({ error: 'Admin code must be exactly 4 digits' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const { error } = await supabase
          .from('teams')
          .update({ admin_code: adminCode })
          .eq('id', teamId);

        result = { success: !error };
        break;
      }

      case 'validateAdminCode': {
        const { adminCode, teamId } = params;
        if (!/^[0-9]{4}$/.test(adminCode)) {
          result = { valid: false };
          break;
        }

        const { data, error } = await supabase
          .from('teams')
          .select('admin_code')
          .eq('id', teamId)
          .single();

        result = { valid: !error && data && data.admin_code === adminCode };
        break;
      }

      case 'checkAdminCodeExists': {
        const { teamId } = params;
        const { data, error } = await supabase
          .from('teams')
          .select('admin_code')
          .eq('id', teamId)
          .single();

        result = {
          exists: !error && data && data.admin_code !== null && data.admin_code !== '',
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
    const statusCode = error instanceof Error && error.message.includes('must be')
      ? 400 // Validation errors
      : 500; // Server errors

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
