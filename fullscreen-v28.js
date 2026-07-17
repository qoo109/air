(() => {
  'use strict';

  const entryButton = document.getElementById('enter-fullscreen-btn');
  const pauseButton = document.getElementById('pause-fullscreen-btn');
  const buttons = [entryButton, pauseButton].filter(Boolean);
  const root = document.documentElement;

  const getElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const supported = Boolean(root.requestFullscreen || root.webkitRequestFullscreen);

  if (!supported) {
    buttons.forEach(button => {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
    });
    return;
  }

  async function enter() {
    try {
      if (root.requestFullscreen) await root.requestFullscreen({navigationUI:'hide'});
      else root.webkitRequestFullscreen();
    } catch (_) {}
  }

  async function exit() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) {}
  }

  function toggle() {
    if (getElement()) exit();
    else enter();
  }

  function refresh() {
    const active=Boolean(getElement());
    buttons.forEach(button => {
      button.hidden=false;
      button.textContent=active?'↙ 離開全螢幕':'⛶ 進入全螢幕';
      button.setAttribute('aria-label',active?'離開全螢幕':'進入全螢幕');
    });
  }

  buttons.forEach(button => button.addEventListener('click',toggle));
  document.addEventListener('fullscreenchange',refresh);
  document.addEventListener('webkitfullscreenchange',refresh);
  refresh();
})();