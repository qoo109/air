/* Bubble Island Air Hockey v5.0.0 Stable runtime bootstrap */
(() => {
  'use strict';

  const RELAY_READY_HANDLER_V1 = `      .on('broadcast', { event: 'relay-ready-v500' }, ({ payload }) => {
        if (!payload || payload.from === role) return;
        peerSeen = true;
        if (role === 'host' && transport === 'relay') sendStartOffer();
      })`;

  const RELAY_READY_HANDLER_V2 = `      .on('broadcast', { event: 'relay-ready-v500' }, ({ payload }) => {
        if (!payload || payload.from === role) return;
        peerSeen = true;
        opponentName = payload.name || opponentName;
        if (transport !== 'p2p' && ['connecting', 'countdown'].includes(mode)) {
          if (transport !== 'relay') activateRelayFallback('對手已切換 Realtime 備援');
          if (role === 'host' && transport === 'relay') sendStartOffer();
        }
      })`;

  const INITIAL_CONNECT_TIMEOUT_V1 = `          }, NET.p2pTimeout);
          return;`;
  const INITIAL_CONNECT_TIMEOUT_V2 = `          }, relayOnlyAttempt ? 7000 : NET.p2pTimeout);
          return;`;

  async function boot() {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('此瀏覽器版本不支援 v5.0 低延遲引擎，請更新 Safari 或 Chrome。');
    }
    const payload = window.__BUBBLE_V500_GZIP || '';
    delete window.__BUBBLE_V500_GZIP;
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    const relayPatched = source.replace(RELAY_READY_HANDLER_V1, RELAY_READY_HANDLER_V2);
    if (relayPatched === source) throw new Error('v5.0 Realtime 雙向備援標記遺失。');
    const patchedSource = relayPatched.replace(INITIAL_CONNECT_TIMEOUT_V1, INITIAL_CONNECT_TIMEOUT_V2);
    if (patchedSource === relayPatched) throw new Error('v5.0 TURN 握手期限標記遺失。');
    (0, eval)(patchedSource);
  }

  boot().catch(error => {
    console.error('[Bubble v5.0] runtime boot failed', error);
    const status = document.getElementById('match-status');
    const quick = document.getElementById('quick-match-btn');
    if (quick) { quick.disabled = true; quick.textContent = '多人引擎載入失敗'; }
    if (status) status.textContent = error?.message || '多人引擎載入失敗';
  });
})();
