// supabase/functions/_shared/sentry.ts
// Shared Sentry initialization for Edge Functions

import * as Sentry from 'https://deno.land/x/sentry@7.91.0/index.mjs';

const SENTRY_DSN = 'https://231c578472c2942afdfc4b074dee9a04@o4510829492895744.ingest.us.sentry.io/4510829498073088';

let initialized = false;

export function initSentry(functionName: string) {
  if (initialized) return;
  
  Sentry.init({
    dsn: SENTRY_DSN,
    defaultIntegrations: false,
    // Performance Monitoring
    tracesSampleRate: 1.0,
    // Set sampling rate for profiling
    profilesSampleRate: 1.0,
    environment: Deno.env.get('ENVIRONMENT') || 'production',
  });

  // Set custom tags
  Sentry.setTag('region', Deno.env.get('SB_REGION') || 'unknown');
  Sentry.setTag('execution_id', Deno.env.get('SB_EXECUTION_ID') || 'unknown');
  Sentry.setTag('function_name', functionName);

  initialized = true;
}

export async function captureError(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.setContext('error_context', context);
  }
  
  Sentry.captureException(error);
  
  // Flush Sentry before the running process closes
  await Sentry.flush(2000);
}

export { Sentry };
