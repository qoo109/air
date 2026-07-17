(() => {
  'use strict';

  if (window.__bubbleResizeGuardInstalled) return;
  window.__bubbleResizeGuardInstalled = true;

  const originalAddEventListener = window.addEventListener.bind(window);

  window.addEventListener = function(type, listener, options) {
    if ((type === 'resize' || type === 'orientationchange') && typeof listener === 'function') {
      const guarded = function(...args) {
        if (document.body.classList.contains('multiplayer-running')) return;
        return listener.apply(this, args);
      };
      return originalAddEventListener(type, guarded, options);
    }
    return originalAddEventListener(type, listener, options);
  };

  window.__restoreBubbleResizeGuard = () => {
    window.addEventListener = originalAddEventListener;
    delete window.__restoreBubbleResizeGuard;
  };
})();
