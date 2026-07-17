(() => {
  'use strict';

  const config = {
    enabled: true,
    supabaseUrl: 'https://upncojrpmeopdqlwzge.supabase.co',
    supabasePublishableKey: 'sb_publishable_jMwyUCEu2v5tpUeu1YnwYw__CPt7SqH'
  };

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
        storageKey: 'bubble-island-auth-v403'
      },
      realtime: {
        params: { eventsPerSecond: 40 }
      }
    }
  );

  window.BubbleSupabaseClient = client;

  // Ranking and multiplayer previously created two separate clients. Return the
  // same client so they share one anonymous session and cannot race each other.
  window.supabase.createClient = (url, key, options) => {
    if (url === config.supabaseUrl && key === config.supabasePublishableKey) {
      return client;
    }
    return createClientOriginal(url, key, options);
  };

  const getSessionOriginal = client.auth.getSession.bind(client.auth);
  const signInAnonymousOriginal = client.auth.signInAnonymously.bind(client.auth);
  let anonymousSignInPromise = null;

  client.auth.getSession = async (...args) => {
    try {
      const result = await getSessionOriginal(...args);
      if (result?.error) window.BubbleLastAuthError = result.error;
      return result;
    } catch (error) {
      window.BubbleLastAuthError = error;
      return { data: { session: null }, error };
    }
  };

  client.auth.signInAnonymously = async credentials => {
    if (anonymousSignInPromise) return anonymousSignInPromise;

    anonymousSignInPromise = (async () => {
      const existing = await getSessionOriginal();
      if (existing?.data?.session?.user) {
        window.BubbleLastAuthError = null;
        return {
          data: {
            user: existing.data.session.user,
            session: existing.data.session
          },
          error: null
        };
      }

      const result = await signInAnonymousOriginal(credentials);
      window.BubbleLastAuthError = result?.error || null;
      return result;
    })().catch(error => {
      window.BubbleLastAuthError = error;
      return { data: { user: null, session: null }, error };
    }).finally(() => {
      anonymousSignInPromise = null;
    });

    return anonymousSignInPromise;
  };

  function describeAuthError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '未知錯誤');
    const status = Number(error?.status || 0);

    if (code === 'anonymous_provider_disabled') {
      return '匿名登入尚未開啟：請到 Authentication → Sign In / Providers 開啟 Allow anonymous sign-ins。';
    }
    if (status === 429 || code.includes('rate_limit') || message.toLowerCase().includes('rate limit')) {
      return '匿名登入嘗試次數過多（429）。請等待一段時間再試，或到 Authentication → Rate Limits 查看 Anonymous sign-ins。';
    }
    if (status === 401 || status === 403 || code.includes('api_key')) {
      return `Supabase 公開金鑰或權限被拒絕（${code || status}）。`;
    }
    if (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('network')) {
      return '瀏覽器無法連到 Supabase。請關閉內容阻擋器、VPN，並確認網路後再試。';
    }

    const tag = code || (status ? String(status) : 'unknown');
    return `匿名連線失敗（${tag}）：${message}`;
  }

  const statusElement = document.getElementById('match-status');
  if (statusElement) {
    const observer = new MutationObserver(() => {
      if (
        statusElement.textContent.includes('匿名連線失敗') &&
        window.BubbleLastAuthError
      ) {
        statusElement.textContent = describeAuthError(window.BubbleLastAuthError);
      }
    });
    observer.observe(statusElement, { childList: true, subtree: true });
  }
})();
