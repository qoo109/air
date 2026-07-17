(() => {
  'use strict';

  const config = {
    enabled: true,
    supabaseUrl: 'https://upncojrpmeopdqlwzge.supabase.co',
    supabasePublishableKey: 'sb_publishable_jMwyUCEu2v5tpUeu1YnwYw__CPt7SqH'
  };

  const MANUAL_SESSION_KEY = 'bubble-island-manual-session-v405';
  const SDK_SESSION_KEY = 'bubble-island-auth-v405';

  window.BUBBLE_CLOUD_CONFIG = config;
  window.BubbleLastAuthError = null;

  if (!config.enabled || !window.supabase?.createClient) return;

  const createClientOriginal = window.supabase.createClient.bind(window.supabase);
  const client = createClientOriginal(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SDK_SESSION_KEY
      },
      realtime: {
        params: { eventsPerSecond: 40 }
      }
    }
  );

  window.BubbleSupabaseClient = client;

  // Ranking and multiplayer must share one client and one guest session.
  window.supabase.createClient = (url, key, options) => {
    if (url === config.supabaseUrl && key === config.supabasePublishableKey) {
      return client;
    }
    return createClientOriginal(url, key, options);
  };

  function makeError(message, code = 'unknown', status = 0, details = null) {
    const error = new Error(message || '未知錯誤');
    error.code = code;
    error.status = status;
    error.details = details;
    return error;
  }

  function isNetworkError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code.includes('network') ||
      code.includes('fetch') ||
      code.includes('xhr') ||
      message.includes('load failed') ||
      message.includes('failed to fetch') ||
      message.includes('network request failed') ||
      message.includes('networkerror')
    );
  }

  function xhrJson(method, url, body, headers = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = timeout;
      xhr.responseType = 'text';

      Object.entries(headers).forEach(([name, value]) => {
        if (value !== undefined && value !== null) {
          xhr.setRequestHeader(name, String(value));
        }
      });

      xhr.onload = () => {
        let payload = null;
        if (xhr.responseText) {
          try {
            payload = JSON.parse(xhr.responseText);
          } catch (_) {
            payload = xhr.responseText;
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data: payload, status: xhr.status });
          return;
        }

        const message =
          payload?.msg ||
          payload?.message ||
          payload?.error_description ||
          payload?.error ||
          `HTTP ${xhr.status}`;
        const code = payload?.code || payload?.error_code || `http_${xhr.status}`;
        reject(makeError(String(message), String(code), xhr.status, payload));
      };

      xhr.onerror = () => {
        reject(makeError(
          '這個 App 內建瀏覽器無法連到 Supabase。請改用 Safari 開啟遊戲網址後再配對。',
          'xhr_network_error',
          0
        ));
      };

      xhr.ontimeout = () => {
        reject(makeError(
          '連到 Supabase 時逾時，請確認網路後重新嘗試。',
          'xhr_timeout',
          0
        ));
      };

      try {
        xhr.send(body === undefined || body === null ? null : JSON.stringify(body));
      } catch (error) {
        reject(makeError(
          error?.message || '瀏覽器無法送出網路請求。',
          'xhr_send_failed',
          0,
          error
        ));
      }
    });
  }

  function normalizeSession(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const source = payload.session || (payload.access_token ? payload : null);
    if (!source?.access_token || !source?.refresh_token) return null;

    const expiresIn = Number(source.expires_in || 3600);
    const expiresAt = Number(
      source.expires_at || Math.floor(Date.now() / 1000) + expiresIn
    );
    const user = payload.user || source.user || null;

    if (!user) return null;

    return {
      ...source,
      access_token: source.access_token,
      refresh_token: source.refresh_token,
      token_type: source.token_type || 'bearer',
      expires_in: expiresIn,
      expires_at: expiresAt,
      user
    };
  }

  function loadManualSession() {
    try {
      const raw = localStorage.getItem(MANUAL_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.access_token || !session?.refresh_token || !session?.user) {
        localStorage.removeItem(MANUAL_SESSION_KEY);
        return null;
      }
      return session;
    } catch (_) {
      localStorage.removeItem(MANUAL_SESSION_KEY);
      return null;
    }
  }

  function saveManualSession(session) {
    if (!session) return;
    try {
      localStorage.setItem(MANUAL_SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
    window.BubbleManualSession = session;
    try {
      client.realtime.setAuth(session.access_token);
    } catch (_) {}
  }

  async function refreshManualSession(session) {
    if (!session?.refresh_token) return null;

    const response = await xhrJson(
      'POST',
      `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      { refresh_token: session.refresh_token },
      {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    );

    const refreshed = normalizeSession(response.data);
    if (!refreshed) {
      throw makeError('Supabase 沒有回傳有效的更新工作階段。', 'refresh_session_missing');
    }
    saveManualSession(refreshed);
    return refreshed;
  }

  async function getUsableManualSession() {
    let session = window.BubbleManualSession || loadManualSession();
    if (!session) return null;

    const expiresAt = Number(session.expires_at || 0);
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt > now + 75) {
      window.BubbleManualSession = session;
      return session;
    }

    try {
      session = await refreshManualSession(session);
      return session;
    } catch (_) {
      localStorage.removeItem(MANUAL_SESSION_KEY);
      window.BubbleManualSession = null;
      return null;
    }
  }

  async function xhrAnonymousSignIn(credentials) {
    const response = await xhrJson(
      'POST',
      `${config.supabaseUrl}/auth/v1/signup`,
      {
        data: credentials?.options?.data || {},
        gotrue_meta_security: {
          captcha_token: credentials?.options?.captchaToken
        }
      },
      {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Info': 'bubble-island-web/4.0.5'
      }
    );

    const session = normalizeSession(response.data);
    if (!session) {
      throw makeError(
        'Supabase 已回應，但沒有建立訪客工作階段。',
        'anonymous_session_missing',
        response.status,
        response.data
      );
    }

    saveManualSession(session);
    return {
      data: { user: session.user, session },
      error: null
    };
  }

  const getSessionOriginal = client.auth.getSession.bind(client.auth);
  const signInAnonymousOriginal = client.auth.signInAnonymously.bind(client.auth);
  const rpcOriginal = client.rpc.bind(client);
  let anonymousSignInPromise = null;

  client.auth.getSession = async (...args) => {
    try {
      const result = await getSessionOriginal(...args);
      if (result?.data?.session?.user) {
        window.BubbleLastAuthError = null;
        return result;
      }
      if (result?.error && !isNetworkError(result.error)) {
        window.BubbleLastAuthError = result.error;
      }
    } catch (error) {
      window.BubbleLastAuthError = error;
    }

    const manual = await getUsableManualSession();
    if (manual) {
      window.BubbleLastAuthError = null;
      return { data: { session: manual }, error: null };
    }

    return {
      data: { session: null },
      error: window.BubbleLastAuthError
    };
  };

  client.auth.signInAnonymously = async credentials => {
    if (anonymousSignInPromise) return anonymousSignInPromise;

    anonymousSignInPromise = (async () => {
      const existing = await client.auth.getSession();
      if (existing?.data?.session?.user) {
        return {
          data: {
            user: existing.data.session.user,
            session: existing.data.session
          },
          error: null
        };
      }

      let originalResult = null;
      try {
        originalResult = await signInAnonymousOriginal(credentials);
        if (!originalResult?.error && originalResult?.data?.session?.user) {
          window.BubbleLastAuthError = null;
          return originalResult;
        }
        if (originalResult?.error && !isNetworkError(originalResult.error)) {
          window.BubbleLastAuthError = originalResult.error;
          return originalResult;
        }
      } catch (error) {
        if (!isNetworkError(error)) {
          window.BubbleLastAuthError = error;
          return { data: { user: null, session: null }, error };
        }
        window.BubbleLastAuthError = error;
      }

      try {
        const fallbackResult = await xhrAnonymousSignIn(credentials);
        window.BubbleLastAuthError = null;
        return fallbackResult;
      } catch (error) {
        window.BubbleLastAuthError = error;
        return {
          data: { user: null, session: null },
          error
        };
      }
    })().finally(() => {
      anonymousSignInPromise = null;
    });

    return anonymousSignInPromise;
  };

  async function xhrRpc(functionName, params = {}) {
    const sessionResult = await client.auth.getSession();
    const session = sessionResult?.data?.session || null;
    const bearer = session?.access_token || config.supabasePublishableKey;

    const response = await xhrJson(
      'POST',
      `${config.supabaseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
      params || {},
      {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Info': 'bubble-island-web/4.0.5'
      }
    );

    return { data: response.data, error: null };
  }

  client.rpc = async (functionName, params = {}, options = {}) => {
    const manual = await getUsableManualSession();
    if (manual) {
      try {
        return await xhrRpc(functionName, params);
      } catch (error) {
        return { data: null, error };
      }
    }

    try {
      const result = await rpcOriginal(functionName, params, options);
      if (!result?.error || !isNetworkError(result.error)) return result;
    } catch (error) {
      if (!isNetworkError(error)) {
        return { data: null, error };
      }
    }

    try {
      return await xhrRpc(functionName, params);
    } catch (error) {
      return { data: null, error };
    }
  };

  window.BubbleCloudTransport = {
    client,
    xhrJson,
    getSession: () => client.auth.getSession(),
    isNetworkError
  };
})();