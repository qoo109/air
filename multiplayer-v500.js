/* Bubble Island Air Hockey v5.0.0 Stable runtime bootstrap */
(() => {
  'use strict';
  async function boot() {
    if (typeof DecompressionStream !== 'function') throw new Error('此瀏覽器版本不支援 v5.0 低延遲引擎，請更新 Safari 或 Chrome。');
    const payload = window.__BUBBLE_V500_GZIP || '';
    delete window.__BUBBLE_V500_GZIP;
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    (0, eval)(source);
  }
  boot().catch(error => {
    console.error('[Bubble v5.0] runtime boot failed', error);
    const status = document.getElementById('match-status');
    const quick = document.getElementById('quick-match-btn');
    if (quick) { quick.disabled = true; quick.textContent = '多人引擎載入失敗'; }
    if (status) status.textContent = error?.message || '多人引擎載入失敗';
  });
})();
