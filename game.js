(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const cards = [...document.querySelectorAll('.difficulty-card')];
  const buildButtons = [...document.querySelectorAll('.build-button')];
  const spellButtons = [...document.querySelectorAll('.spell-button')];

  const ui = {
    menu: $('menuScreen'), game: $('gameScreen'), newGame: $('newGame'), continueBox: $('continueBox'),
    continueGame: $('continueGame'), resetSave: $('resetSave'), startWave: $('startWaveButton'), pause: $('pauseButton'),
    restart: $('restartButton'), resultRestart: $('resultRestart'), resultOverlay: $('resultOverlay'),
    resultEyebrow: $('resultEyebrow'), resultTitle: $('resultTitle'), resultBody: $('resultBody'),
    gold: $('goldText'), wave: $('waveText'), health: $('castleHealthText'), healthFill: $('healthFill'),
    save: $('saveStatus'), details: $('selectionDetails'), actions: $('contextActions'), kingdom: $('kingdomDetails'),
    castleUpgrade: $('castleUpgradeButton'), spellUpgrade: $('spellUpgradeButton'), toast: $('toast')
  };

  const SAVE = 'kingdom-defense-v2-save';
  const MAX_WAVE = 15;
  const difficulty = {
    easy: { name: 'Easy', gold: 340, hp: 30, enemy: 0.8, speed: 0.9, reward: 1.25 },
    medium: { name: 'Medium', gold: 280, hp: 23, enemy: 1, speed: 1, reward: 1 },
    hard: { name: 'Hard', gold: 230, hp: 18, enemy: 1.25, speed: 1.1, reward: 0.85 }
  };
  const defs = {
    archer: { name: 'Archer Tower', cost: 80, range: 150, rate: .55, dmg: 11, color: '#3477d6' },
    cannon: { name: 'Cannon Tower', cost: 120, range: 132, rate: 1.05, dmg: 27, splash: 44, color: '#5f5a55' },
    mage: { name: 'Mage Tower', cost: 140, range: 165, rate: .85, dmg: 17, slow: 1.4, color: '#7c54d8' },
    barracks: { name: 'Barracks', cost: 130, range: 120, rate: .72, dmg: 13, color: '#ba6b28' },
    farm: { name: 'Farm', cost: 100, income: 24, color: '#43a047' },
    mine: { name: 'Mine', cost: 160, income: 42, color: '#7e7b73' }
  };
  const path = [{x:-40,y:425},{x:120,y:425},{x:120,y:170},{x:350,y:170},{x:350,y:505},{x:610,y:505},{x:610,y:250},{x:830,y:250},{x:1000,y:250}];
  const spotList = [{x:72,y:314},{x:207,y:493},{x:214,y:97},{x:420,y:106},{x:275,y:326},{x:459,y:583},{x:535,y:403},{x:690,y:555},{x:710,y:176},{x:810,y:342},{x:890,y:175},{x:890,y:420}];

  let chosen = 'medium', raf = false, last = performance.now(), toastTimer = 0;
  let s = makeState(chosen);

  function makeState(mode) {
    const d = difficulty[mode] || difficulty.medium;
    return { mode, gold:d.gold, wave:0, maxHp:d.hp, hp:d.hp, castle:1, spell:1, selectedBuild:'archer', selectedSpell:null,
      selectedSpot:null, paused:false, over:false, active:false, spawn:0, spawned:0, total:0,
      enemies:[], shots:[], fx:[], cooldown:{fireball:0, freeze:0, repair:0},
      spots:spotList.map((p,i)=>({...p,i,b:null})) };
  }

  function setState(n) { s = n; }
  function showGame() { ui.menu.classList.add('hidden'); ui.game.classList.remove('hidden'); ui.resultOverlay.classList.add('hidden'); startLoop(); draw(); updateUI(); }
  function newGame() { setState(makeState(chosen)); showGame(); toast('Pick a glowing spot for your first tower.'); save('New game ready'); }
  function startLoop(){ if(!raf){ raf=true; requestAnimationFrame(loop); } }

  function loop(t){
    const dt = Math.min((t-last)/1000, .05); last = t;
    if(!s.paused && !s.over && !ui.game.classList.contains('hidden')) tick(dt);
    draw(); requestAnimationFrame(loop);
  }

  function tick(dt){
    Object.keys(s.cooldown).forEach(k=>s.cooldown[k]=Math.max(0,s.cooldown[k]-dt));
    if(s.active){
      s.spawn -= dt;
      if(s.spawned < s.total && s.spawn <= 0){ spawnEnemy(); s.spawned++; s.spawn = Math.max(.36, 1.02 - s.wave*.025); }
    }
    updateEnemies(dt); updateTowers(dt); updateShots(dt); updateFx(dt);
    if(s.active && s.spawned >= s.total && s.enemies.length === 0) finishWave();
    updateUI();
  }

  function startWave(){
    if(s.active || s.over) return;
    if(!s.spots.some(p=>p.b && !defs[p.b.type].income)){ toast('Build an Archer, Cannon, Mage, or Barracks first.'); return; }
    s.wave++; s.total = 8 + s.wave*2 + (s.wave%5===0 ? 1 : 0); s.spawned = 0; s.spawn = 0; s.active = true; s.selectedSpot = null;
    toast(`Wave ${s.wave} started`); save('Wave started'); updateUI();
  }

  function spawnEnemy(){
    const boss = s.spawned === s.total-1 && s.wave%5 === 0, d = difficulty[s.mode], p = pointOnPath(0);
    const hp = (40 + s.wave*8) * d.enemy * (boss ? 4.2 : 1);
    s.enemies.push({x:p.x,y:p.y,dist:0,hp,max:hp,boss,slow:0,speed:(44+s.wave*1.5)*(boss?.72:1),
      reward:Math.max(8, Math.round((12+s.wave*1.8)*d.reward*(boss?4:1))), era:s.wave<5?'beast':s.wave<9?'undead':s.wave<13?'raider':'alien'});
  }

  function updateEnemies(dt){
    const d = difficulty[s.mode];
    for(let i=s.enemies.length-1;i>=0;i--){
      const e=s.enemies[i]; e.slow=Math.max(0,e.slow-dt); e.dist += e.speed*d.speed*(e.slow>0?.5:1)*dt;
      const p=pointOnPath(e.dist); e.x=p.x; e.y=p.y;
      if(p.done){ s.enemies.splice(i,1); s.hp -= e.boss?3:1; burst(e.x,e.y,'#d94d3a',10); if(s.hp<=0){ s.hp=0; end(false); } }
    }
  }

  function updateTowers(dt){
    s.spots.forEach(p=>{
      if(!p.b || defs[p.b.type].income) return;
      p.b.cd = Math.max(0, (p.b.cd||0)-dt); if(p.b.cd>0) return;
      const st=stats(p.b), target=nearest(p.x,p.y,st.range); if(!target) return;
      p.b.cd = st.rate; s.shots.push({x:p.x,y:p.y,t:target,spd:p.b.type==='cannon'?360:520,dmg:st.dmg,splash:st.splash||0,slow:st.slow||0,color:st.color});
    });
  }

  function updateShots(dt){
    for(let i=s.shots.length-1;i>=0;i--){
      const p=s.shots[i]; if(!s.enemies.includes(p.t)){ s.shots.splice(i,1); continue; }
      const dx=p.t.x-p.x, dy=p.t.y-p.y, dist=Math.hypot(dx,dy)||1, step=p.spd*dt;
      if(step>=dist){ hit(p.t,p.dmg,p.splash,p.slow); burst(p.t.x,p.t.y,p.color, p.splash?18:7); s.shots.splice(i,1); }
      else { p.x += dx/dist*step; p.y += dy/dist*step; }
    }
  }

  function hit(target,dmg,splash,slow){
    if(splash){ s.enemies.slice().forEach(e=>{ if(Math.hypot(e.x-target.x,e.y-target.y)<=splash) damage(e,dmg*(e===target?1:.55),slow); }); }
    else damage(target,dmg,slow);
  }
  function damage(e,dmg,slow){ e.hp -= dmg; if(slow) e.slow = Math.max(e.slow, slow); if(e.hp<=0){ const i=s.enemies.indexOf(e); if(i>-1){ s.gold += e.reward; s.enemies.splice(i,1); burst(e.x,e.y,e.boss?'#ffdf68':'#d94d3a',e.boss?24:12); } } }
  function nearest(x,y,r){ let best=null, prog=-1; s.enemies.forEach(e=>{ const d=Math.hypot(e.x-x,e.y-y); if(d<=r && e.dist>prog){best=e; prog=e.dist;} }); return best; }

  function finishWave(){
    s.active=false; const bonus=Math.round(20+s.wave*5+income()); s.gold+=bonus; toast(`Wave ${s.wave} cleared! +${bonus} gold`);
    if(s.wave>=MAX_WAVE) end(true); else save('Saved after wave');
  }
  function end(win){ s.over=true; s.active=false; ui.resultOverlay.classList.remove('hidden'); ui.resultEyebrow.textContent=win?'Victory':'Defeat'; ui.resultTitle.textContent=win?'Kingdom Saved!':'Castle Lost'; ui.resultBody.textContent=win?`You survived ${MAX_WAVE} waves on ${difficulty[s.mode].name}.`:`The kingdom fell on wave ${Math.max(1,s.wave)}.`; if(win) localStorage.removeItem(SAVE); }

  function buildOrSelect(p){
    if(!s.selectedBuild){ s.selectedSpot=p.i; updateUI(); return; }
    if(p.b){ s.selectedSpot=p.i; updateUI(); return; }
    const d=defs[s.selectedBuild]; if(s.gold<d.cost){ toast(`Need ${d.cost} gold for ${d.name}.`); return; }
    s.gold-=d.cost; p.b={type:s.selectedBuild,level:1,cd:0}; s.selectedSpot=p.i; toast(`${d.name} built.`); save('Saved build'); updateUI();
  }

  function upgradeBuilding(){ const p=s.spots[s.selectedSpot]; if(!p||!p.b) return; const d=defs[p.b.type], cost=Math.round(d.cost*(.75+p.b.level*.65)); if(p.b.level>=4){toast('Max level.');return;} if(s.gold<cost){toast(`Need ${cost} gold.`);return;} s.gold-=cost; p.b.level++; toast(`${d.name} upgraded.`); save('Saved upgrade'); updateUI(); }
  function sellBuilding(){ const p=s.spots[s.selectedSpot]; if(!p||!p.b) return; const d=defs[p.b.type], refund=Math.round(d.cost*.55*p.b.level); s.gold+=refund; p.b=null; toast(`Sold for ${refund} gold.`); save('Saved sale'); updateUI(); }
  function upgradeCastle(){ const cost=150+s.castle*110; if(s.gold<cost){toast(`Need ${cost} gold.`);return;} s.gold-=cost; s.castle++; s.maxHp+=7; s.hp=Math.min(s.maxHp,s.hp+9); toast(`Castle level ${s.castle}.`); save('Saved castle upgrade'); updateUI(); }
  function upgradeSpell(){ const cost=130+s.spell*95; if(s.gold<cost){toast(`Need ${cost} gold.`);return;} s.gold-=cost; s.spell++; toast(`Spells level ${s.spell}.`); save('Saved spell upgrade'); updateUI(); }

  function cast(x,y){
    const sp=s.selectedSpell; if(!sp) return false; if(s.cooldown[sp]>0){toast('Spell cooling down.');return true;}
    if(sp==='fireball'){ s.enemies.slice().forEach(e=>{ if(Math.hypot(e.x-x,e.y-y)<92) damage(e,70+s.spell*28,0,0); }); s.cooldown.fireball=10; burst(x,y,'#ff7f35',34); }
    if(sp==='freeze'){ s.enemies.forEach(e=>{ if(Math.hypot(e.x-x,e.y-y)<130) e.slow=3+s.spell*.7; }); s.cooldown.freeze=13; burst(x,y,'#8fd4ff',28); }
    if(sp==='repair'){ s.hp=Math.min(s.maxHp,s.hp+4+s.spell*3); s.cooldown.repair=16; burst(890,250,'#9dff4f',28); }
    s.selectedSpell=null; updateUI(); return true;
  }

  function stats(b){ const d=defs[b.type], m=1+(b.level-1)*.38; return {...d,dmg:Math.round((d.dmg||0)*m),range:(d.range||0)+(b.level-1)*12,rate:Math.max(.28,(d.rate||1)*(1-(b.level-1)*.06))}; }
  function income(){ return s.spots.reduce((a,p)=>a+(p.b&&defs[p.b.type].income?defs[p.b.type].income*p.b.level:0),0); }
  function pointOnPath(dist){ let left=dist; for(let i=0;i<path.length-1;i++){ const a=path[i],b=path[i+1],len=Math.hypot(b.x-a.x,b.y-a.y); if(left<=len){ const t=left/len; return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,done:false}; } left-=len; } return {...path[path.length-1],done:true}; }
  function pos(evt){ const r=canvas.getBoundingClientRect(), e=evt.touches?evt.touches[0]:evt; return {x:(e.clientX-r.left)/r.width*canvas.width,y:(e.clientY-r.top)/r.height*canvas.height}; }

  function save(msg){ try{ localStorage.setItem(SAVE, JSON.stringify({mode:s.mode,gold:s.gold,wave:s.wave,maxHp:s.maxHp,hp:s.hp,castle:s.castle,spell:s.spell,spots:s.spots.map(p=>({i:p.i,b:p.b}))})); ui.save.textContent=msg; }catch{} updateContinue(); }
  function load(){ try{ const raw=localStorage.getItem(SAVE); if(!raw) return null; const o=JSON.parse(raw), n=makeState(o.mode||'medium'); Object.assign(n,{gold:o.gold??n.gold,wave:o.wave||0,maxHp:o.maxHp||n.maxHp,hp:o.hp||n.hp,castle:o.castle||1,spell:o.spell||1}); (o.spots||[]).forEach(sp=>{ if(n.spots[sp.i] && sp.b && defs[sp.b.type]) n.spots[sp.i].b={type:sp.b.type,level:sp.b.level||1,cd:0}; }); return n; }catch{return null;} }
  function updateContinue(){ ui.continueBox.classList.toggle('hidden', !localStorage.getItem(SAVE)); }
  function continueGame(){ const n=load(); if(!n){toast('No save found.');return;} setState(n); showGame(); toast('Save loaded.'); }
  function restartMenu(){ s.active=false; s.enemies=[]; s.shots=[]; ui.game.classList.add('hidden'); ui.menu.classList.remove('hidden'); ui.resultOverlay.classList.add('hidden'); updateContinue(); }
  function resetSave(){ localStorage.removeItem(SAVE); updateContinue(); toast('Save reset.'); }

  function updateUI(){
    ui.gold.textContent=Math.floor(s.gold); ui.wave.textContent=`${s.wave} / ${MAX_WAVE}`; ui.health.textContent=`${s.hp} / ${s.maxHp}`; ui.healthFill.style.width=`${Math.max(0,s.hp/s.maxHp*100)}%`;
    ui.startWave.textContent=s.active?'Wave Running':s.wave>=MAX_WAVE?'Complete':`Start Wave ${s.wave+1}`; ui.startWave.disabled=s.active||s.over; ui.pause.textContent=s.paused?'Resume':'Pause';
    ui.kingdom.textContent=`Camp Level ${s.castle} • ${difficulty[s.mode].name} • Economy +${income()} gold/wave`;
    cards.forEach(c=>c.classList.toggle('selected',c.dataset.difficulty===chosen));
    buildButtons.forEach(b=>{ const d=defs[b.dataset.build]; b.classList.toggle('selected',s.selectedBuild===b.dataset.build); b.disabled=s.gold<d.cost && s.selectedBuild!==b.dataset.build; });
    spellButtons.forEach(b=>{ const sp=b.dataset.spell, cd=Math.ceil(s.cooldown[sp]||0), label=b.querySelector('strong'); b.classList.toggle('selected',s.selectedSpell===sp); b.classList.toggle('cooling',cd>0); if(label) label.textContent=cd?`${cd}s`:'Ready'; });
    renderDetails();
  }

  function renderDetails(){
    ui.actions.innerHTML=''; const p=s.spots[s.selectedSpot];
    if(p&&p.b){ const d=defs[p.b.type], st=stats(p.b), cost=Math.round(d.cost*(.75+p.b.level*.65)); ui.details.innerHTML=d.income?`${d.name} • Level ${p.b.level}<br>Income: +${d.income*p.b.level} gold/wave.`:`${d.name} • Level ${p.b.level}<br>Damage: ${st.dmg} • Range: ${Math.round(st.range)}`; const up=document.createElement('button'); up.className='secondary-button'; up.textContent=p.b.level>=4?'Max Level':`Upgrade (${cost}g)`; up.disabled=p.b.level>=4||s.gold<cost; up.onclick=upgradeBuilding; const sell=document.createElement('button'); sell.className='quiet-button'; sell.textContent='Sell Building'; sell.onclick=sellBuilding; ui.actions.append(up,sell); return; }
    if(s.selectedSpell){ ui.details.innerHTML=`Selected spell: <strong>${s.selectedSpell}</strong><br>Tap the map to cast it.`; return; }
    if(s.selectedBuild){ const d=defs[s.selectedBuild]; ui.details.innerHTML=`Selected: <strong>${d.name}</strong><br>Tap a glowing empty spot. Cost: ${d.cost}g.`; return; }
    ui.details.textContent='Choose a building type, then pick a spot on the map.';
  }

  function toast(msg){ ui.toast.textContent=msg; ui.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'),2200); }
  function burst(x,y,color,count){ for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2,v=40+Math.random()*120; s.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,color,life:.35+Math.random()*.45,size:2+Math.random()*4}); } }
  function updateFx(dt){ for(let i=s.fx.length-1;i>=0;i--){ const f=s.fx[i]; f.life-=dt; f.x+=f.vx*dt; f.y+=f.vy*dt; if(f.life<=0)s.fx.splice(i,1); } }

  function draw(){
    ctx.clearRect(0,0,960,640); const g=ctx.createLinearGradient(0,0,960,640); g.addColorStop(0,'#7ccf48'); g.addColorStop(1,'#3f8f3d'); ctx.fillStyle=g; ctx.fillRect(0,0,960,640);
    drawPath(); drawCastle(); s.spots.forEach(drawSpot); s.enemies.forEach(drawEnemy); s.shots.forEach(p=>circle(p.x,p.y,5,p.color,'#2d2418')); s.fx.forEach(f=>{ctx.globalAlpha=Math.max(0,f.life*2.2); circle(f.x,f.y,f.size,f.color); ctx.globalAlpha=1;});
    if(s.paused&&!ui.game.classList.contains('hidden')){ ctx.fillStyle='rgba(47,30,19,.58)'; ctx.fillRect(0,0,960,640); ctx.fillStyle='#fff7d7'; ctx.font='900 58px system-ui'; ctx.textAlign='center'; ctx.fillText('Paused',480,330); }
  }
  function drawPath(){ ctx.lineCap='round'; ctx.lineJoin='round'; trace('#8b5a2a',76); trace('#d9a751',58); ctx.setLineDash([20,24]); trace('rgba(255,255,255,.2)',8); ctx.setLineDash([]); }
  function trace(color,w){ ctx.strokeStyle=color; ctx.lineWidth=w; ctx.beginPath(); ctx.moveTo(path[0].x,path[0].y); path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); }
  function drawCastle(){ ctx.fillStyle='#7d6d5a'; ctx.strokeStyle='#3a2517'; ctx.lineWidth=4; ctx.fillRect(850,228,84,98); ctx.strokeRect(850,228,84,98); [842,884,924].forEach(x=>{ctx.fillRect(x,198,28,58);ctx.strokeRect(x,198,28,58);}); ctx.fillStyle='#4a311f'; ctx.fillRect(884,278,20,48); }
  function drawSpot(p){ if(p.b){ drawBuilding(p); } else { circle(p.x,p.y,25,s.selectedBuild?'#fff2a8':'#d8c38b',s.selectedBuild?'#2f873e':'#6d492b',s.selectedBuild?5:3); ctx.fillStyle='#6d492b'; ctx.fillRect(p.x-12,p.y-3,24,6); ctx.fillRect(p.x-3,p.y-12,6,24); } if(s.selectedSpot===p.i) circle(p.x,p.y,34,'transparent','#ffdf68',5); }
  function drawBuilding(p){ const b=p.b,d=defs[b.type]; ctx.fillStyle='rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(p.x,p.y+20,28,10,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle=d.color; ctx.strokeStyle='#2f210d'; ctx.lineWidth=4; if(d.income){ ctx.fillRect(p.x-24,p.y-16,48,38); ctx.strokeRect(p.x-24,p.y-16,48,38); } else { ctx.fillRect(p.x-18,p.y-24,36,48); ctx.strokeRect(p.x-18,p.y-24,36,48); ctx.fillStyle='#fff4d5'; ctx.beginPath(); ctx.moveTo(p.x-28,p.y-24); ctx.lineTo(p.x,p.y-48); ctx.lineTo(p.x+28,p.y-24); ctx.closePath(); ctx.fill(); ctx.stroke(); } circle(p.x+22,p.y+22,12,'#fff7d7','#2f210d',3); ctx.fillStyle='#2f210d'; ctx.font='900 13px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(b.level,p.x+22,p.y+22); }
  function drawEnemy(e){ const c={beast:'#73432a',undead:'#74806b',raider:'#343942',alien:'#4f3fc8'}[e.era], r=e.boss?24:15; circle(e.x,e.y,r,c,'#20150f',3); ctx.fillStyle='#fff1cc'; circle(e.x-r*.35,e.y-r*.2,r*.15,'#fff1cc'); circle(e.x+r*.35,e.y-r*.2,r*.15,'#fff1cc'); ctx.fillStyle='#2a1712'; ctx.fillRect(e.x-r,e.y-r-13,r*2,5); ctx.fillStyle=e.slow>0?'#8fd4ff':'#9dff4f'; ctx.fillRect(e.x-r,e.y-r-13,r*2*Math.max(0,e.hp/e.max),5); }
  function circle(x,y,r,fill,stroke,w=2){ ctx.fillStyle=fill; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); if(fill!=='transparent')ctx.fill(); if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke();} }

  function canvasClick(e){ e.preventDefault(); const p=pos(e); if(cast(p.x,p.y)) return; const spot=s.spots.find(q=>Math.hypot(q.x-p.x,q.y-p.y)<=38); if(spot) buildOrSelect(spot); else if(s.selectedBuild) toast('Tap a round build spot.'); }

  cards.forEach(c=>c.addEventListener('click',()=>{ chosen=c.dataset.difficulty||'medium'; updateUI(); }));
  buildButtons.forEach(b=>b.addEventListener('click',()=>{ s.selectedBuild=b.dataset.build; s.selectedSpell=null; updateUI(); }));
  spellButtons.forEach(b=>b.addEventListener('click',()=>{ const sp=b.dataset.spell; if(s.cooldown[sp]>0){toast('Spell cooling down.');return;} s.selectedSpell=sp; s.selectedBuild=null; if(sp==='repair') cast(890,250); updateUI(); }));
  ui.newGame.onclick=newGame; ui.continueGame.onclick=continueGame; ui.resetSave.onclick=resetSave; ui.startWave.onclick=startWave; ui.pause.onclick=()=>{s.paused=!s.paused; updateUI();}; ui.restart.onclick=restartMenu; ui.resultRestart.onclick=()=>newGame(); ui.castleUpgrade.onclick=upgradeCastle; ui.spellUpgrade.onclick=upgradeSpell;
  canvas.addEventListener('click',canvasClick); canvas.addEventListener('touchstart',canvasClick,{passive:false});
  if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations?.().then(rs=>rs.forEach(r=>{ if(r.scope.includes('/Kingdom-Defense-V1/')) r.unregister(); })).catch(()=>{});
  updateContinue(); updateUI(); draw(); console.info('Kingdom Defense controls loaded.');
})();
