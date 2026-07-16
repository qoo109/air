(() => {
  const entryButton = document.getElementById('enter-fullscreen-btn');
  const toggleButton = document.getElementById('fullscreen-toggle');
  const message = document.getElementById('fullscreen-message');

  const getFullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

  const requestFullscreen = async () => {
    const root = document.documentElement;

    try {
      if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else {
        throw new Error('unsupported');
      }

      if (screen.orientation?.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }

      if (message) message.textContent = '已進入全螢幕模式';
    } catch (_) {
      if (message) {
        message.textContent = '此瀏覽器不支援網頁全螢幕；可使用「加入主畫面」取得更完整畫面';
      }
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) {}
  };

  const toggleFullscreen = () => {
    if (getFullscreenElement()) exitFullscreen();
    else requestFullscreen();
  };

  const refreshButtons = () => {
    const active = Boolean(getFullscreenElement());
    if (entryButton) entryButton.textContent = active ? '✓ 已進入全螢幕' : '⛶ 全螢幕遊玩';
    if (toggleButton) {
      toggleButton.textContent = active ? '↙' : '⛶';
      toggleButton.setAttribute('aria-label', active ? '離開全螢幕' : '進入全螢幕');
      toggleButton.title = active ? '離開全螢幕' : '進入全螢幕';
    }
  };

  entryButton?.addEventListener('click', requestFullscreen);
  toggleButton?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', refreshButtons);
  document.addEventListener('webkitfullscreenchange', refreshButtons);
  refreshButtons();
})();