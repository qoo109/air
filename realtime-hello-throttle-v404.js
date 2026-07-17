(() => {
  'use strict';
  const client = window.BubbleSupabaseClient;
  if (!client || client.__bubbleHelloThrottle) return;

  const originalChannel = client.channel.bind(client);
  client.channel = (topic, options) => {
    const channel = originalChannel(topic, options);
    if (!String(topic).startsWith('game:')) return channel;

    const originalSend = channel.send.bind(channel);
    let lastHelloAt = 0;

    channel.send = message => {
      if (message?.type === 'broadcast' && message?.event === 'hello') {
        const now = Date.now();
        if (now - lastHelloAt < 500) {
          return Promise.resolve('hello-throttled');
        }
        lastHelloAt = now;
      }
      return originalSend(message);
    };

    return channel;
  };

  client.__bubbleHelloThrottle = true;
})();
