(() => {
  'use strict';

  const LOCAL_KEY='bubble_local_rankings_v2';
  const LEGACY_KEY='bubble_local_rankings_v1';
  const $=id=>document.getElementById(id);
  const screen=$('leaderboard-screen');
  const list=$('leaderboard-list');
  const title=$('leaderboard-title');
  const status=$('leaderboard-status');
  const openButton=$('leaderboard-btn');
  const closeButton=$('leaderboard-close-btn');
  const metricTabs=[...document.querySelectorAll('[data-board]')];
  const scopeTabs=[...document.querySelectorAll('[data-scope]')];
  let activeBoard='streak';
  let activeScope='local';
  let recordsCache=null;
  let cloudClient=null;
  let cloudUser=null;
  let cloudSyncTimer=null;

  const cleanName=value=>String(value||'玩家').replace(/\s+/g,' ').trim().slice(0,12)||'玩家';

  function load(){
    if(recordsCache) return recordsCache;
    try{
      const raw=localStorage.getItem(LOCAL_KEY) || localStorage.getItem(LEGACY_KEY) || '[]';
      const value=JSON.parse(raw);
      recordsCache=Array.isArray(value)?value:[];
    }catch(_){
      recordsCache=[];
    }
    return recordsCache;
  }

  function save(records){
    recordsCache=records.slice(0,100);
    localStorage.setItem(LOCAL_KEY,JSON.stringify(recordsCache));
  }

  function currentIdentity(){
    try{
      const user=JSON.parse(localStorage.getItem('bubble_island_user')||'{}');
      return {id:String(user.id||''),name:cleanName(user.name||'')};
    }catch(_){
      return {id:'',name:''};
    }
  }

  function ensurePlayer(name){
    const safeName=cleanName(name);
    const records=load();
    let record=records.find(item=>item.name===safeName);
    if(!record){
      record={name:safeName,wins:0,games:0,currentStreak:0,bestStreak:0,bestCombo:0,updatedAt:Date.now()};
      records.push(record);
      save(records);
    }
    return {...record};
  }

  function updateRecord(name,updater){
    const safeName=cleanName(name);
    const records=load();
    let index=records.findIndex(item=>item.name===safeName);
    if(index<0){
      records.push({name:safeName,wins:0,games:0,currentStreak:0,bestStreak:0,bestCombo:0,updatedAt:Date.now()});
      index=records.length-1;
    }
    const next={...records[index]};
    updater(next);
    next.name=safeName;
    next.updatedAt=Date.now();
    records[index]=next;
    save(records);
    dispatchEvent(new CustomEvent('bubble-ranking-updated',{detail:{name:safeName,record:{...next}}}));
    scheduleCloudSync();
    if(screen?.classList.contains('active')) render();
    return {...next};
  }

  function updateCombo(name,combo){
    const value=Math.max(0,Math.floor(Number(combo)||0));
    const current=ensurePlayer(name);
    if(value<=current.bestCombo) return current;
    return updateRecord(name,record=>{record.bestCombo=value;});
  }

  function recordGame(name,won){
    return updateRecord(name,record=>{
      record.games=(record.games||0)+1;
      if(won){
        record.wins=(record.wins||0)+1;
        record.currentStreak=(record.currentStreak||0)+1;
        record.bestStreak=Math.max(record.bestStreak||0,record.currentStreak);
      }else{
        record.currentStreak=0;
      }
    });
  }

  function getStats(name){
    return ensurePlayer(name);
  }

  function sortRows(records,type){
    return [...records].sort((a,b)=>{
      const fields=type==='combo'
        ?['bestCombo','bestStreak','wins']
        :type==='wins'
          ?['wins','bestStreak','bestCombo']
          :['bestStreak','wins','bestCombo'];
      for(const field of fields){
        const diff=(b[field]||0)-(a[field]||0);
        if(diff) return diff;
      }
      return (a.updatedAt||0)-(b.updatedAt||0);
    }).slice(0,20);
  }

  function localBoard(type=activeBoard){
    return sortRows(load(),type);
  }

  function cloudConfig(){
    const config=window.BUBBLE_CLOUD_CONFIG||{};
    return {
      enabled:Boolean(config.enabled && config.supabaseUrl && config.supabasePublishableKey),
      url:String(config.supabaseUrl||''),
      key:String(config.supabasePublishableKey||'')
    };
  }

  async function ensureCloud(){
    const config=cloudConfig();
    if(!config.enabled || !window.supabase?.createClient) return null;
    if(!cloudClient){
      cloudClient=window.supabase.createClient(config.url,config.key,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      });
    }
    const {data:{session}}=await cloudClient.auth.getSession();
    if(session?.user){
      cloudUser=session.user;
      return cloudClient;
    }
    const {data,error}=await cloudClient.auth.signInAnonymously();
    if(error) throw error;
    cloudUser=data.user;
    return cloudClient;
  }

  async function pushCurrent(){
    const client=await ensureCloud();
    if(!client || !cloudUser) return false;
    const identity=currentIdentity();
    if(!identity.name) return false;
    const local=ensurePlayer(identity.name);
    const payload={
      user_id:cloudUser.id,
      player_name:identity.name,
      wins:local.wins||0,
      games:local.games||0,
      current_streak:local.currentStreak||0,
      best_streak:local.bestStreak||0,
      best_combo:local.bestCombo||0,
      updated_at:new Date().toISOString()
    };
    const {error}=await client.from('bubble_leaderboard').upsert(payload,{onConflict:'user_id'});
    if(error) throw error;
    return true;
  }

  function scheduleCloudSync(){
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer=setTimeout(()=>sync().catch(()=>{}),500);
  }

  async function globalBoard(type=activeBoard){
    const client=await ensureCloud();
    if(!client) return [];
    await pushCurrent();
    const orderColumn=type==='combo'?'best_combo':type==='wins'?'wins':'best_streak';
    const {data,error}=await client
      .from('bubble_leaderboard')
      .select('player_name,wins,games,current_streak,best_streak,best_combo,updated_at')
      .order(orderColumn,{ascending:false})
      .order('wins',{ascending:false})
      .limit(20);
    if(error) throw error;
    return (data||[]).map(row=>({
      name:cleanName(row.player_name),
      wins:Number(row.wins)||0,
      games:Number(row.games)||0,
      currentStreak:Number(row.current_streak)||0,
      bestStreak:Number(row.best_streak)||0,
      bestCombo:Number(row.best_combo)||0,
      updatedAt:Date.parse(row.updated_at)||0
    }));
  }

  function valueFor(record,type){
    if(type==='combo') return record.bestCombo||0;
    if(type==='wins') return record.wins||0;
    return record.bestStreak||0;
  }

  function subValue(record,type){
    if(type==='combo') return `最佳連勝 x${record.bestStreak||0}`;
    if(type==='wins') return `進行 ${record.games||0} 場`;
    return `總勝場 ${record.wins||0}`;
  }

  async function render(){
    if(!list) return;
    const renderToken=Date.now();
    list.dataset.renderToken=String(renderToken);
    const identity=currentIdentity();
    title.textContent=activeBoard==='combo'?'最高連擊榜':activeBoard==='wins'?'總勝場榜':'最佳連勝榜';
    metricTabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.board===activeBoard));
    scopeTabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.scope===activeScope));
    list.replaceChildren();

    const loading=document.createElement('li');
    loading.className='rank-empty';
    loading.textContent=activeScope==='global'?'正在載入全球排名…':'正在整理本機排名…';
    list.append(loading);

    let rows=[];
    try{
      if(activeScope==='global'){
        if(!cloudConfig().enabled){
          throw new Error('not_configured');
        }
        rows=await globalBoard(activeBoard);
        if(status) status.textContent='全球排行榜已連線';
      }else{
        rows=localBoard(activeBoard);
        if(status) status.textContent='這台裝置上的玩家紀錄';
      }
    }catch(error){
      if(list.dataset.renderToken!==String(renderToken)) return;
      list.replaceChildren();
      const empty=document.createElement('li');
      empty.className='rank-empty';
      empty.textContent=error?.message==='not_configured'
        ?'全球排行榜尚未完成雲端設定。'
        :'全球排行榜目前無法連線，請稍後再試。';
      list.append(empty);
      if(status) status.textContent='全球榜等待雲端連線';
      return;
    }

    if(list.dataset.renderToken!==String(renderToken)) return;
    list.replaceChildren();
    if(!rows.length){
      const empty=document.createElement('li');
      empty.className='rank-empty';
      empty.textContent='完成一場遊戲後就會出現排名。';
      list.append(empty);
      return;
    }

    rows.forEach((record,index)=>{
      const row=document.createElement('li');
      row.className=`rank-row${record.name===identity.name?' current':''}`;
      const medal=index===0?'🥇':index===1?'🥈':index===2?'🥉':String(index+1);
      row.innerHTML='<span class="rank-place"></span><span class="rank-name"></span><span class="rank-score"><strong></strong><small></small></span>';
      row.querySelector('.rank-place').textContent=medal;
      row.querySelector('.rank-name').textContent=record.name;
      row.querySelector('.rank-score strong').textContent=`x${valueFor(record,activeBoard)}`;
      row.querySelector('.rank-score small').textContent=subValue(record,activeBoard);
      list.append(row);
    });
  }

  async function sync(){
    if(!cloudConfig().enabled) return false;
    try{
      const ok=await pushCurrent();
      if(screen?.classList.contains('active') && activeScope==='global') await render();
      return ok;
    }catch(_){
      return false;
    }
  }

  function open(){
    activeBoard='streak';
    activeScope=cloudConfig().enabled?'global':'local';
    document.getElementById('menu')?.classList.remove('active');
    screen?.classList.add('active');
    render();
  }

  function close(){
    screen?.classList.remove('active');
    document.getElementById('menu')?.classList.add('active');
  }

  openButton?.addEventListener('click',open);
  closeButton?.addEventListener('click',close);
  metricTabs.forEach(tab=>tab.addEventListener('click',()=>{
    activeBoard=['streak','combo','wins'].includes(tab.dataset.board)?tab.dataset.board:'streak';
    render();
  }));
  scopeTabs.forEach(tab=>tab.addEventListener('click',()=>{
    activeScope=tab.dataset.scope==='global'?'global':'local';
    render();
  }));

  window.BubbleRanking={ensurePlayer,updateCombo,recordGame,getStats,localBoard,globalBoard,render,sync,isCloudReady:()=>cloudConfig().enabled};
  const identity=currentIdentity();
  if(identity.name) ensurePlayer(identity.name);
})();