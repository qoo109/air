(() => {
  'use strict';
  const client = window.BubbleSupabaseClient;
  if (!client || client.__bubbleHelloThrottle) return;

  const originalChannel = client.channel.bind(client);
  client.channel = (topic, options) => {
    const channel = originalChannel(topic, options);
    if (!String(topic).startsWith('game:')) return channel;

    const originalSend = channel.send.bind(channel);
    const originalOn = channel.on.bind(channel);
    let lastHelloAt = 0;
    let lastOfferSdp = '';
    let lastOfferAt = 0;

    channel.send = message => {
      const event = String(message?.event || '');
      const isHello = message?.type === 'broadcast' && /^hello(?:-v\d+)?$/.test(event);
      if (isHello) {
        const now = Date.now();
        if (now - lastHelloAt < 600) {
          return Promise.resolve('hello-throttled');
        }
        lastHelloAt = now;
      }
      return originalSend(message);
    };

    channel.on = (type, filter, callback) => {
      const event = String(filter?.event || '');
      const isOffer = type === 'broadcast' && /^sdp-offer-v\d+$/.test(event);
      if (!isOffer || typeof callback !== 'function') {
        return originalOn(type, filter, callback);
      }

      return originalOn(type, filter, message => {
        const sdp = String(message?.payload?.description?.sdp || '');
        const now = Date.now();
        if (sdp && sdp === lastOfferSdp && now - lastOfferAt < 3000) return;
        lastOfferSdp = sdp;
        lastOfferAt = now;
        return callback(message);
      });
    };

    return channel;
  };

  client.__bubbleHelloThrottle = true;
})();
