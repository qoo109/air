(() => {
  'use strict';

  const entryButton = document.getElementById('enter-fullscreen-btn');
  const pauseButton = document.getElementById('pause-fullscreen-btn');
  const entryMessage = document.getElementById('fullscreen-message');
  const pauseMessage = document.getElementById('pause-fullscreen-message');

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const supportsFullscreen = Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

  function setMessage(text) {
    if (entryMessage) entryMessage.textContent = text;
    if (pauseMessage) pauseMessage.textContent = text;
  }

  async function enterFullscreen() {
    if (isStandalone()) {
      setMessage('目前已是加入主畫面的全螢幕模式。');
      return;
    }

    if (!supportsFullscreen) {
      if (isIOS) {
        setMessage('iPhone Safari：點下方「分享」按鈕 →「加入主畫面」→ 從桌面圖示開啟，即可使用全螢幕。');
      } else {
        setMessage('此瀏覽器不支援網頁全螢幕，請使用「加入主畫面」或安裝網頁 App。');
      }
      refreshButtons();
      return;
    }

    try {
      const root = document.documentElement;
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI:'hide' });
      else root.webkitRequestFullscreen();
      setMessage('已進入全螢幕模式。');
    } catch (_) {
      setMessage(isIOS
        ? 'iPhone Safari 請使用「分享 → 加入主畫面」，再從桌面圖示開啟。'
        : '無法進入全螢幕，請確認瀏覽器允許全螢幕。');
    }
  }

  async function exitFullscreen() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      setMessage('已離開全螢幕模式。');
    } catch (_) {}
  }

  function toggleFullscreen() {
    if (fullscreenElement()) exitFullscreen();
    else enterFullscreen();
  }

  function refreshButtons() {
    const active = Boolean(fullscreenElement());
    const standalone = isStandalone();
    const unsupportedIOS = isIOS && !supportsFullscreen && !standalone;
    const label = active
      ? '↙ 離開全螢幕'
      : standalone
        ? '✓ 已是全螢幕模式'
        : unsupportedIOS
          ? '📲 查看加入主畫面方式'
          : '⛶ 進入全螢幕';

    [entryButton,pauseButton].forEach(button => {
      if (!button) return;
      button.textContent = label;
      button.setAttribute('aria-label', label.replace(/^[^\s]+\s*/,''));
    });
  }

  entryButton?.addEventListener('click', toggleFullscreen);
  pauseButton?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', refreshButtons);
  document.addEventListener('webkitfullscreenchange', refreshButtons);
  refreshButtons();
})();