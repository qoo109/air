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

  const turnKeyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const turnApiToken = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN');

  if (!turnKeyId || !turnApiToken) {
    return json({
      error: 'turn_secrets_missing',
      message: 'CLOUDFLARE_TURN_KEY_ID or CLOUDFLARE_TURN_API_TOKEN is not configured.',
    }, 503);
  }

  let requestedTtl = 3600;
  try {
    const body = await request.json();
    if (Number.isFinite(Number(body?.ttl))) requestedTtl = Number(body.ttl);
  } catch (_) {
    // Empty body is allowed.
  }

  const ttl = Math.max(900, Math.min(86400, Math.round(requestedTtl)));
  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${turnApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('Cloudflare TURN credential error', response.status, data);
      return json({
        error: 'turn_provider_error',
        providerStatus: response.status,
        details: data,
      }, 502);
    }

    const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
    const hasTurn = iceServers.some((server: { urls?: string | string[] }) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
    });

    if (!hasTurn) {
      console.error('Cloudflare response did not contain TURN servers', data);
      return json({ error: 'turn_servers_missing' }, 502);
    }

    return json({
      iceServers,
      ttl,
      expiresAt: Date.now() + ttl * 1000,
      provider: 'cloudflare-realtime-turn',
    });
  } catch (error) {
    console.error('TURN credential request failed', error);
    return json({
      error: 'turn_request_failed',
      message: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});
