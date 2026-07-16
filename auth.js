(() => {
  const authScreen = document.getElementById('auth-screen');
  const menu = document.getElementById('menu');
  const matchScreen = document.getElementById('match-screen');
  const guestBtn = document.getElementById('guest-login-btn');
  const nameInput = document.getElementById('guest-name-input');
  const logoutBtn = document.getElementById('logout-btn');
  const quickMatchBtn = document.getElementById('quick-match-btn');
  const cancelMatchBtn = document.getElementById('cancel-match-btn');
  const authMessage = document.getElementById('auth-message');
  const playerName = document.getElementById('player-name');
  const playerAvatar = document.getElementById('player-avatar');
  const queueTime = document.getElementById('queue-time');
  const matchStatus = document.getElementById('match-status');

  let queueTimer = null;
  let queueSeconds = 0;

  function normalizeName(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  function createGuest(name) {
    return {
      id: `guest-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name,
      avatar: '🐙',
      provider: 'guest'
    };
  }

  function showMenu(user) {
    localStorage.setItem('bubble_island_user', JSON.stringify(user));
    playerName.textContent = user.name || '玩家';
    playerAvatar.textContent = user.avatar || '🐙';
    authScreen.classList.remove('active');
    matchScreen.classList.remove('active');
    menu.classList.add('active');
  }

  function submitName() {
    const name = normalizeName(nameInput.value);
    if (name.length < 2) {
      authMessage.textContent = '名字至少需要 2 個字元喔！';
      nameInput.focus();
      return;
    }
    if (name.length > 12) {
      authMessage.textContent = '名字最多只能有 12 個字元。';
      nameInput.focus();
      return;
    }
    showMenu(createGuest(name));
  }

  function changeName() {
    clearInterval(queueTimer);
    localStorage.removeItem('bubble_island_user');
    menu.classList.remove('active');
    matchScreen.classList.remove('active');
    authScreen.classList.add('active');
    nameInput.value = '';
    authMessage.textContent = '輸入新名字後再進入泡泡島';
    setTimeout(() => nameInput.focus(), 50);
  }

  guestBtn.addEventListener('click', submitName);
  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') submitName();
  });
  logoutBtn.addEventListener('click', changeName);

  quickMatchBtn.addEventListener('click', () => {
    menu.classList.remove('active');
    matchScreen.classList.add('active');
    queueSeconds = 0;
    queueTime.textContent = '00:00';
    matchStatus.textContent = '快速配對介面已就緒，等待連接真人配對後端…';
    clearInterval(queueTimer);
    queueTimer = setInterval(() => {
      queueSeconds += 1;
      const mm = String(Math.floor(queueSeconds / 60)).padStart(2, '0');
      const ss = String(queueSeconds % 60).padStart(2, '0');
      queueTime.textContent = `${mm}:${ss}`;
    }, 1000);
  });

  cancelMatchBtn.addEventListener('click', () => {
    clearInterval(queueTimer);
    matchScreen.classList.remove('active');
    menu.classList.add('active');
  });

  function boot() {
    const saved = localStorage.getItem('bubble_island_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user?.name) {
          showMenu(user);
          return;
        }
      } catch (_) {}
    }
    localStorage.removeItem('pixel_hockey_user');
    authScreen.classList.add('active');
    setTimeout(() => nameInput.focus(), 150);
  }

  boot();
})();