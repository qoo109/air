(() => {
  'use strict';

  const WRONG_URL = 'https://upncojrpmeopdqlwzge.supabase.co';
  const CORRECT_URL = 'https://upnucojrpmeopdqlwzge.supabase.co';

  const replaceEndpoint = value => {
    if (typeof value !== 'string') return value;
    return value.replace(WRONG_URL, CORRECT_URL);
  };

  window.BUBBLE_CORRECT_SUPABASE_URL = CORRECT_URL;

  if (window.supabase?.createClient && !window.supabase.__bubbleEndpointFix) {
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = (url, key, options) =>
      originalCreateClient(replaceEndpoint(url), key, options);
    window.supabase.__bubbleEndpointFix = true;
  }

  if (window.fetch && !window.__bubbleFetchEndpointFix) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === 'string') {
        return originalFetch(replaceEndpoint(input), init);
      }
      if (input instanceof Request) {
        const nextUrl = replaceEndpoint(input.url);
        if (nextUrl !== input.url) {
          return originalFetch(new Request(nextUrl, input), init);
        }
      }
      return originalFetch(input, init);
    };
    window.__bubbleFetchEndpointFix = true;
  }

  if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.__bubbleEndpointFix) {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return originalOpen.call(this, method, replaceEndpoint(url), ...rest);
    };
    window.XMLHttpRequest.prototype.__bubbleEndpointFix = true;
  }
})();
