(() => {
  'use strict';

  const STORAGE_KEY='bubble_local_rankings_v1';
  const $=id=>document.getElementById(id);
  const screen=$('leaderboard-screen');
  const list=$('leaderboard-list');
  const title=$('leaderboard-title');
  const openButton=$('leaderboard-btn');
  const closeButton=$('leaderboard-close-btn');
  const tabs=[...document.querySelectorAll('[data-board]')];
  let activeBoard='streak';

  const cleanName=value=>String(value||'玩家').replace(/\s+/g,' ').trim().slice(0,12)||'玩家';

  function load(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(value)?value:[];
    }catch(_){
      return [];
    }
  }

  function save(records){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(records.slice(0,100)));
  }

  function currentName(){
    try{
      const name=JSON.parse(localStorage.getItem('bubble_island_user')||'{}').name;
      return name?cleanName(name):'';
    }catch(_){
      return '';
    }
  }

  function ensurePlayer(name){
    const safeName=cleanName(name);
    const records=load();
    let record=records.find(item=>item.name===safeName);
    if(!record){
      const oldWins=Number(localStorage.getItem('nah_best_win')||0);
      const oldCombo=Number(localStorage.getItem('bubble_best_combo')||0);
      record={
        name:safeName,wins:records.length?0:oldWins,games:records.length?0:oldWins,
        currentStreak:0,bestStreak:0,bestCombo:records.length?0:oldCombo,
        updatedAt:Date.now()
      };
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
      records.push({
        name:safeName,wins:0,games:0,currentStreak:0,bestStreak:0,bestCombo:0,updatedAt:Date.now()
      });
      index=records.length-1;
    }
    const next={...records[index]};
    updater(next);
    next.name=safeName;
    next.updatedAt=Date.now();
    records[index]=next;
    save(records);
    dispatchEvent(new CustomEvent('bubble-ranking-updated',{detail:{name:safeName,record:{...next}}}));
    if(screen?.classList.contains('active')) render();
    return {...next};
  }

  function updateCombo(name,combo){
    const value=Math.max(0,Math.floor(Number(combo)||0));
    return updateRecord(name,record=>{
      if(value>record.bestCombo) record.bestCombo=value;
    });
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

  function board(type=activeBoard){
    const records=load();
    const sorted=[...records].sort((a,b)=>{
      if(type==='combo'){
        return (b.bestCombo||0)-(a.bestCombo||0) ||
          (b.bestStreak||0)-(a.bestStreak||0) ||
          (b.wins||0)-(a.wins||0) ||
          (a.updatedAt||0)-(b.updatedAt||0);
      }
      return (b.bestStreak||0)-(a.bestStreak||0) ||
        (b.wins||0)-(a.wins||0) ||
        (b.bestCombo||0)-(a.bestCombo||0) ||
        (a.updatedAt||0)-(b.updatedAt||0);
    });
    return sorted.slice(0,10);
  }

  function render(){
    if(!list) return;
    const rows=board();
    const me=currentName();
    if(title) title.textContent=activeBoard==='combo'?'最高連擊榜':'最佳連勝榜';
    tabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.board===activeBoard));

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
      row.className=`rank-row${record.name===me?' current':''}`;
      const medal=index===0?'🥇':index===1?'🥈':index===2?'🥉':String(index+1);
      const mainValue=activeBoard==='combo'?`x${record.bestCombo||0}`:`x${record.bestStreak||0}`;
      const subValue=activeBoard==='combo'
        ?`最佳連勝 x${record.bestStreak||0}`
        :`總勝場 ${record.wins||0}`;
      row.innerHTML=`<span class="rank-place">${medal}</span><span class="rank-name"></span><span class="rank-score"><strong>${mainValue}</strong><small>${subValue}</small></span>`;
      row.querySelector('.rank-name').textContent=record.name;
      list.append(row);
    });
  }

  function open(){
    activeBoard='streak';
    render();
    document.getElementById('menu')?.classList.remove('active');
    screen?.classList.add('active');
  }

  function close(){
    screen?.classList.remove('active');
    document.getElementById('menu')?.classList.add('active');
  }

  openButton?.addEventListener('click',open);
  closeButton?.addEventListener('click',close);
  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    activeBoard=tab.dataset.board==='combo'?'combo':'streak';
    render();
  }));

  window.BubbleRanking={ensurePlayer,updateCombo,recordGame,getStats,board,render};
  const bootName=currentName();
  if(bootName) ensurePlayer(bootName);
})();