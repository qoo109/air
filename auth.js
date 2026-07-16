(() => {
  const authScreen = document.getElementById('auth-screen');
  const menu = document.getElementById('menu');
  const matchScreen = document.getElementById('match-screen');
  const guestBtn = document.getElementById('guest-login-btn');
  const googleBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const quickMatchBtn = document.getElementById('quick-match-btn');
  const cancelMatchBtn = document.getElementById('cancel-match-btn');
  const authMessage = document.getElementById('auth-message');
  const playerName = document.getElementById('player-name');
  const playerAvatar = document.getElementById('player-avatar');
  const queueTime = document.getElementById('queue-time');
  const matchStatus = document.getElementById('match-status');

  const config = window.PIXEL_HOCKEY_CONFIG || {};
  const supabaseReady = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const client = supabaseReady ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  let queueTimer = null;
  let queueSeconds = 0;

  function randomGuest() {
    const id = Math.floor(1000 + Math.random() * 9000);
    return { id: `guest-${Date.now()}`, name: `訪客 ${id}`, avatar: '🙂', provider: 'guest' };
  }

  function showMenu(user) {
    localStorage.setItem('pixel_hockey_user', JSON.stringify(user));
    playerName.textContent = user.name || '玩家';
    playerAvatar.textContent = user.avatar || '🙂';
    authScreen.classList.remove('active');
    matchScreen.classList.remove('active');
    menu.classList.add('active');
  }

  function logout() {
    if (client) client.auth.signOut().catch(() => {});
    localStorage.removeItem('pixel_hockey_user');
    menu.classList.remove('active');
    matchScreen.classList.remove('active');
    authScreen.classList.add('active');
    authMessage.textContent = '已登出，請選擇登入方式';
  }

  guestBtn.addEventListener('click', () => showMenu(randomGuest()));

  googleBtn.addEventListener('click', async () => {
    if (!client) {
      authMessage.textContent = 'Google 登入尚未連接 Supabase，訪客登入目前可直接使用。';
      return;
    }
    authMessage.textContent = '正在開啟 Google 登入…';
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
    if (error) authMessage.textContent = `登入失敗：${error.message}`;
  });

  logoutBtn.addEventListener('click', logout);

  quickMatchBtn.addEventListener('click', () => {
    menu.classList.remove('active');
    matchScreen.classList.add('active');
    queueSeconds = 0;
    queueTime.textContent = '00:00';
    matchStatus.textContent = supabaseReady ? '正在加入線上快速配對佇列…' : '快速配對介面已就緒，等待連接配對後端…';
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

  async function boot() {
    if (client) {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (user) {
        showMenu({
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Google 玩家',
          avatar: user.user_metadata?.avatar_url || '😊',
          provider: 'google'
        });
        return;
      }
      client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        if (user) showMenu({ id: user.id, name: user.user_metadata?.full_name || 'Google 玩家', avatar: '😊', provider: 'google' });
      });
    }
    const saved = localStorage.getItem('pixel_hockey_user');
    if (saved) {
      try { showMenu(JSON.parse(saved)); return; } catch (_) {}
    }
    authScreen.classList.add('active');
  }

  boot();
})();
