(() => {
  'use strict';

  const sdk = window.supabase;
  if (!sdk?.createClient || sdk.__bubblePublicRealtimePatch) return;

  const originalCreateClient = sdk.createClient.bind(sdk);
  sdk.createClient = (...args) => {
    const client = originalCreateClient(...args);
    const originalChannel = client.channel.bind(client);

    client.channel = (topic, options = {}) => {
      if (!String(topic).startsWith('game:')) {
        return originalChannel(topic, options);
      }

      const nextOptions = {
        ...options,
        config: {
          ...(options.config || {}),
          private: false,
          broadcast: {
            ack: false,
            self: false,
            ...(options.config?.broadcast || {})
          }
        }
      };

      return originalChannel(topic, nextOptions);
    };

    return client;
  };

  sdk.__bubblePublicRealtimePatch = true;
})();
