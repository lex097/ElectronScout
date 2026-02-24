import { SignJWT } from "npm:jose@5";
import { createClient } from "npm:@supabase/supabase-js@2";
import { captureError, initSentry } from "../_shared/sentry.ts";

initSentry('auth-operations');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACCESS_TOKEN_EXPIRY_HOURS = 24;
const REFRESH_TOKEN_EXPIRY_DAYS = 365;

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('JWT_SECRET');
    if (!jwtSecret) {
      console.error('Missing SUPABASE_JWT_SECRET or JWT_SECRET');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { operation } = body;

    if (!operation || typeof operation !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid operation parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (operation === 'signInWithTeamCode') {
      const { teamCode, scoutName } = body;
      if (!teamCode || typeof teamCode !== 'string' || !scoutName || typeof scoutName !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Missing teamCode or scoutName' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const code = String(teamCode).toUpperCase().trim();
      const { data: teamIdData, error: rpcError } = await supabase
        .rpc('validate_team_code_and_get_id', { code });

      let teamId: string | null = null;
      if (!rpcError && teamIdData) {
        teamId = typeof teamIdData === 'string' ? teamIdData : null;
      } else {
        const { data: teamData } = await supabase
          .from('teams')
          .select('id')
          .eq('team_code', code)
          .single();
        teamId = teamData?.id || null;
      }

      if (!teamId) {
        return new Response(
          JSON.stringify({ error: 'Invalid team code' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: teamRow } = await supabase
        .from('teams')
        .select('team_number')
        .eq('id', teamId)
        .single();

      const teamNumber = teamRow?.team_number ?? 0;
      const userIdentifier = `${String(scoutName).trim()}:${teamNumber}`;

      const now = Math.floor(Date.now() / 1000);
      const accessExp = now + ACCESS_TOKEN_EXPIRY_HOURS * 3600;
      const refreshExp = now + REFRESH_TOKEN_EXPIRY_DAYS * 86400;

      const secret = new TextEncoder().encode(jwtSecret);
      const iss = `${supabaseUrl.replace('https://', 'https://')}/auth/v1`;

      const accessToken = await new SignJWT({
        sub: teamId,
        role: 'authenticated',
        aud: 'authenticated',
        aal: 'aal1',
        session_id: crypto.randomUUID(),
        email: '',
        phone: '',
        is_anonymous: false,
        app_metadata: { team_id: teamId },
        user_metadata: { scout_name: scoutName, team_number: teamNumber, user_identifier: userIdentifier },
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt(now)
        .setExpirationTime(accessExp)
        .setIssuer(iss)
        .sign(secret);

      const refreshToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const tokenHash = await hashToken(refreshToken);

      // Replace any existing refresh tokens for this user - each login extends expiry by 1 year
      await supabase
        .from('refresh_tokens')
        .delete()
        .eq('team_id', teamId)
        .eq('user_identifier', userIdentifier);

      await supabase.from('refresh_tokens').insert({
        team_id: teamId,
        token_hash: tokenHash,
        user_identifier: userIdentifier,
        expires_at: new Date(refreshExp * 1000).toISOString(),
      });

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: ACCESS_TOKEN_EXPIRY_HOURS * 3600,
          user: { team_id: teamId, user_identifier: userIdentifier, team_number: teamNumber },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (operation === 'refreshToken') {
      const { refresh_token } = body;
      if (!refresh_token || typeof refresh_token !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Missing refresh_token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tokenHash = await hashToken(refresh_token);
      const { data: row, error: fetchError } = await supabase
        .from('refresh_tokens')
        .select('team_id, user_identifier, expires_at')
        .eq('token_hash', tokenHash)
        .single();

      if (fetchError || !row) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired refresh token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const expiresAt = new Date(row.expires_at);
      if (expiresAt.getTime() < Date.now()) {
        await supabase.from('refresh_tokens').delete().eq('token_hash', tokenHash);
        return new Response(
          JSON.stringify({ error: 'Refresh token expired' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const teamId = row.team_id;
      const userIdentifier = row.user_identifier;
      const parts = userIdentifier.split(':');
      const scoutName = parts[0] ?? '';
      const teamNumber = parseInt(parts[1] ?? '0', 10);

      const now = Math.floor(Date.now() / 1000);
      const accessExp = now + ACCESS_TOKEN_EXPIRY_HOURS * 3600;
      const secret = new TextEncoder().encode(jwtSecret);
      const iss = `${supabaseUrl.replace('https://', 'https://')}/auth/v1`;

      const accessToken = await new SignJWT({
        sub: teamId,
        role: 'authenticated',
        aud: 'authenticated',
        aal: 'aal1',
        session_id: crypto.randomUUID(),
        email: '',
        phone: '',
        is_anonymous: false,
        app_metadata: { team_id: teamId },
        user_metadata: { scout_name: scoutName, team_number: teamNumber, user_identifier: userIdentifier },
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt(now)
        .setExpirationTime(accessExp)
        .setIssuer(iss)
        .sign(secret);

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          expires_in: ACCESS_TOKEN_EXPIRY_HOURS * 3600,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown operation: ${operation}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Auth function error:', err);
    await captureError(err instanceof Error ? err : new Error(String(err)), {
      method: req.method,
      url: req.url,
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
