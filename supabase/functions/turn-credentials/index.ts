const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store, max-age=0',
    },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'authentication_required' }, 401);
  }

  const appName = (Deno.env.get('METERED_APP_NAME') || '').trim();
  const apiKey = (Deno.env.get('METERED_API_KEY') || '').trim();

  if (!appName || !apiKey) {
    return json({
      error: 'metered_secrets_missing',
      message: 'METERED_APP_NAME or METERED_API_KEY is not configured.',
    }, 503);
  }

  if (!/^[a-z0-9-]+$/i.test(appName)) {
    return json({ error: 'invalid_metered_app_name' }, 500);
  }

  const endpoint = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('Metered TURN credential error', response.status, data);
      return json({
        error: 'turn_provider_error',
        providerStatus: response.status,
        details: data,
      }, 502);
    }

    const iceServers = Array.isArray(data)
      ? data
      : Array.isArray(data?.iceServers)
        ? data.iceServers
        : [];

    const hasTurn = iceServers.some((server: { urls?: string | string[] }) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
    });

    if (!hasTurn) {
      console.error('Metered response did not contain TURN servers', data);
      return json({ error: 'turn_servers_missing' }, 502);
    }

    return json({
      iceServers,
      expiresAt: Date.now() + 15 * 60 * 1000,
      provider: 'metered-open-relay',
    });
  } catch (error) {
    console.error('Metered TURN credential request failed', error);
    return json({
      error: 'turn_request_failed',
      message: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});
