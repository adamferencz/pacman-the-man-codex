/* PAC-MAN: THE MAN EDITION — all tunable game values live here. */
(() => {
  'use strict';

  const CONFIG = {
    tile: 32, playerSpeed: 4.2, ghostSpeed: 2.55, bossSpeed: 3.45,
    lives: 3, dotPoints: 10, bonusPoints: 50, levelPoints: 200,
    bossPoints: 500, bossScore: 1000, bossHealth: 3,
    phaseDuration: 5, attackDuration: 7, bonusInterval: 13,
    speedTiers: [[0, 1], [100, 1.1], [250, 1.2], [500, 1.35], [1000, 1.5], [2000, 1.75]]
  };
  const MAP = [
    '#####################',
    '#.........#.........#',
    '#.###.###.#.###.###.#',
    '#o###.###.#.###.###o#',
    '#...................#',
    '#.###.#.#####.#.###.#',
    '#.....#...#...#.....#',
    '#####.###.#.###.#####',
    '#...#.#.......#.#...#',
    '#.#.#.#.##.##.#.#.#.#',
    '#.#.....#...#.....#.#',
    '#.#.#.#.#####.#.#.#.#',
    '#...#.#.......#.#...#',
    '#####.###.#.###.#####',
    '#.....#...#...#.....#',
    '#.###.#.#####.#.###.#',
    '#o..#.....P.....#..o#',
    '###.#.###.#.###.#.###',
    '#.....#...#...#.....#',
    '#.#######.#.#######.#',
    '#...................#',
    '#####################'
  ];
  const W = MAP[0].length, H = MAP.length, T = CONFIG.tile;
  const DIRS = { up: {x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
  const DIR_NAMES = Object.keys(DIRS);
  const OPP = {up:'down',down:'up',left:'right',right:'left'};
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['overlay','mainButton','soundButton','pauseButton','restartButton','score','lives','level','speed','speedTier','speedBar','bonuses','bossCard','bossLives','boardStatus','levelProgress','toast','mobileScore','mobileLives','mobileLevel','mobileBonus'].map(id => [id, document.getElementById(id)]));
  const bossImage = new Image(); bossImage.src = 'zeman.png';
  const key = (x,y) => `${x},${y}`;
  const wall = (x,y) => x < 0 || y < 0 || x >= W || y >= H || MAP[y][x] === '#';
  const inside = (x,y) => x > 0 && y > 0 && x < W-1 && y < H-1;
  const open = (x,y) => inside(x,y) && !wall(x,y);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const rand = (n) => Math.floor(Math.random()*n);
  const spawn = {x:10,y:16};
  const ghostSpawns = [{x:9,y:10},{x:10,y:10},{x:11,y:10},{x:10,y:8}];
  let state = 'menu', score = 0, lives = CONFIG.lives, level = 1, player, ghosts = [], boss = null;
  let dots = new Set(), powerDots = new Set(), initialDots = 0, bonuses = [], phaseUntil = 0, attackUntil = 0;
  let gameTime = 0, bonusClock = 0, invulnerableUntil = 0, bossTriggered = false, bannerUntil = 0, banner = '';
  let lastFrame = 0, accumulator = 0, muted = false, audio = null, toastTimer = 0;

  function actor(x,y,speed,extra={}) { return {x,y,target:null,dir:null,speed,...extra}; }
  function resetPositions() {
    player = actor(spawn.x,spawn.y,CONFIG.playerSpeed,{want:null});
    ghosts = ghostSpawns.map((p,i) => actor(p.x,p.y,CONFIG.ghostSpeed+level*.09,{mode:i,home:{...p},color:['#6c83ff','#ab7cff','#60c8ff','#c585fa'][i]}));
    if (boss) { boss.x=10; boss.y=10; boss.target=null; boss.dir=null; }
    invulnerableUntil = gameTime + 1.8;
  }
  function buildLevel() {
    dots.clear(); powerDots.clear(); bonuses = [];
    MAP.forEach((row,y) => [...row].forEach((c,x) => {
      if (c === '.' || c === 'o') (c === 'o' ? powerDots : dots).add(key(x,y));
    }));
    initialDots = dots.size + powerDots.size;
    resetPositions();
    phaseUntil = attackUntil = 0; bonusClock = 0;
    addBonus('phase', 13, 16);
    if (boss && boss.hp > 0) addBonus('attack', 11, 16);
    updateHUD();
  }
  function newGame() {
    score=0; lives=CONFIG.lives; level=1; gameTime=0; boss=null; bossTriggered=false;
    buildLevel(); state='playing'; hideOverlay(); notify('ÚROVEŇ 01'); sound('start');
  }
  function speedFactor() { return CONFIG.speedTiers.reduce((v,[limit,factor]) => score >= limit ? factor : v, 1); }
  function addScore(n) {
    score += n;
    if (!bossTriggered && score >= CONFIG.bossScore) summonBoss();
    updateHUD();
  }
  function addBonus(type,x,y) {
    if (!open(x,y) || bonuses.some(b => b.x===x && b.y===y)) return false;
    bonuses.push({type,x,y}); return true;
  }
  function randomBonus(type) {
    const spots=[];
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++) if(open(x,y) && distance({x,y},player)>2 && !bonuses.some(b=>b.x===x&&b.y===y)) spots.push({x,y});
    if(spots.length) { const p=spots[rand(spots.length)]; addBonus(type,p.x,p.y); }
  }
  function summonBoss() {
    bossTriggered=true;
    boss=actor(10,10,CONFIG.bossSpeed,{hp:CONFIG.bossHealth,hitUntil:0});
    state='boss'; banner='THE MAN IS COMING!'; bannerUntil=gameTime+3;
    addBonus('attack',player.x|0,player.y|0) || randomBonus('attack');
    randomBonus('attack'); notify('THE MAN IS COMING!',3500); sound('boss'); updateHUD();
  }
  function nextTile(e,dir,phasing=false) {
    const d=DIRS[dir]; if(!d) return null;
    const x=Math.round(e.x)+d.x,y=Math.round(e.y)+d.y;
    return (phasing ? inside(x,y) : open(x,y)) ? {x,y} : null;
  }
  function available(e,allowReverse=true) {
    const options=DIR_NAMES.filter(dir=>nextTile(e,dir));
    if (!allowReverse && options.length>1 && e.dir) return options.filter(d=>d!==OPP[e.dir]);
    return options;
  }
  function nearestOpen(x,y) {
    let best={...spawn}, bestDist=Infinity;
    for(let yy=1;yy<H-1;yy++) for(let xx=1;xx<W-1;xx++) if(open(xx,yy)) {
      const d=(xx-x)**2+(yy-y)**2; if(d<bestDist){bestDist=d;best={x:xx,y:yy};}
    }
    return best;
  }
  function pathDirection(from,goal) {
    const sx=Math.round(from.x),sy=Math.round(from.y);
    const safeGoal=wall(Math.round(goal.x),Math.round(goal.y)) ? nearestOpen(goal.x,goal.y) : {x:Math.round(goal.x),y:Math.round(goal.y)};
    const start=key(sx,sy),end=key(safeGoal.x,safeGoal.y);
    if(start===end) return null;
    const queue=[{x:sx,y:sy}], seen=new Set([start]), first=new Map();
    for(let i=0;i<queue.length;i++) {
      const p=queue[i];
      for(const dir of DIR_NAMES) {
        const d=DIRS[dir],x=p.x+d.x,y=p.y+d.y,k=key(x,y);
        if(!open(x,y)||seen.has(k)) continue;
        seen.add(k);first.set(k, key(p.x,p.y)===start ? dir : first.get(key(p.x,p.y)));
        if(k===end) return first.get(k);
        queue.push({x,y});
      }
    }
    return null;
  }
  function chooseGhost(e) {
    const options=available(e,false); if(!options.length) return null;
    if(e.mode===0) return options[rand(options.length)];
    let goal={x:player.x,y:player.y};
    if(e.mode===2) {const d=DIRS[player.dir||player.want||'left'];goal={x:player.x+d.x*3,y:player.y+d.y*3};}
    if(e.mode===3 && distance(e,player)>6) goal={x:ghosts[0].x,y:ghosts[0].y};
    const smart=pathDirection(e,goal);
    if(smart && options.includes(smart) && (e.mode!==3 || Math.random()>.25)) return smart;
    return options[rand(options.length)];
  }
  function moveActor(e,dt,choose,phasing=false) {
    let travel=e.speed*dt;
    while(travel>0.00001) {
      if(!e.target) {
        const dir=choose(e);
        const tile=nextTile(e,dir,phasing);
        if(!tile) {e.dir=null;break;}
        e.dir=dir;e.target=tile;
      }
      const remaining=distance(e,e.target), step=Math.min(remaining,travel);
      if(remaining<0.00001) {e.x=e.target.x;e.y=e.target.y;e.target=null;continue;}
      e.x+=(e.target.x-e.x)*step/remaining;
      e.y+=(e.target.y-e.y)*step/remaining;
      travel-=step;
      if(step>=remaining-0.00001){e.x=e.target.x;e.y=e.target.y;e.target=null;}
    }
  }
  function collect() {
    const x=Math.round(player.x),y=Math.round(player.y),k=key(x,y);
    if(distance(player,{x,y})>.38) return;
    if(dots.delete(k)){addScore(CONFIG.dotPoints);sound('dot');}
    if(powerDots.delete(k)){addScore(CONFIG.bonusPoints);sound('bonus');notify('+50 BONUS');}
    const i=bonuses.findIndex(b=>b.x===x&&b.y===y);
    if(i>=0){
      const b=bonuses.splice(i,1)[0];addScore(CONFIG.bonusPoints);
      if(b.type==='phase'){phaseUntil=gameTime+CONFIG.phaseDuration;notify('PRŮCHOD ZDÍ AKTIVNÍ');}
      else {attackUntil=gameTime+CONFIG.attackDuration;notify('ÚTOK NA BOSSE AKTIVNÍ');}
      sound('bonus');
    }
    if(dots.size+powerDots.size===0) completeLevel();
  }
  function completeLevel() {
    addScore(CONFIG.levelPoints);sound('win');level++;
    banner=`ÚROVEŇ ${String(level).padStart(2,'0')}`;bannerUntil=gameTime+2.5;
    buildLevel();notify(`ÚROVEŇ ${String(level).padStart(2,'0')} · +200`);
  }
  function loseLife() {
    if(gameTime<invulnerableUntil) return;
    lives--;sound('hurt');phaseUntil=attackUntil=0;
    if(lives<=0){state='gameover';showOverlay('GAME OVER',`Dosáhl jsi skóre ${score.toLocaleString('cs-CZ')}. Zkus to znovu!`,'HRÁT ZNOVU');sound('gameover');}
    else {resetPositions();notify(`ZTRÁCÍŠ ŽIVOT · ZBÝVÁ ${lives}`);}
    updateHUD();
  }
  function collisions() {
    for(const ghost of ghosts) if(distance(player,ghost)<.65) {loseLife();return;}
    if(boss && boss.hp>0 && distance(player,boss)<.82){
      if(gameTime<attackUntil && gameTime>=boss.hitUntil){
        boss.hp--;boss.hitUntil=gameTime+1.45;invulnerableUntil=gameTime+.8;
        sound('hit');notify(boss.hp ? `THE MAN · ZBÝVÁ ${boss.hp} ♥` : 'THE MAN PORAŽEN!');
        if(boss.hp===0){boss=null;state='playing';addScore(CONFIG.bossPoints);sound('win');}
        else {boss.x=10;boss.y=10;boss.target=null;boss.dir=null;attackUntil=Math.max(attackUntil,gameTime+1.5);}
        updateHUD();
      } else if(gameTime>=boss.hitUntil) loseLife();
    }
  }
  function tick(dt) {
    if(state!=='playing'&&state!=='boss') return;
    gameTime+=dt;bonusClock+=dt;
    if(phaseUntil && gameTime>=phaseUntil){
      phaseUntil=0;
      if(wall(Math.round(player.x),Math.round(player.y)) || (player.target && wall(player.target.x,player.target.y))){
        const safe=nearestOpen(player.x,player.y);player.x=safe.x;player.y=safe.y;player.target=null;player.dir=null;
      }
      notify('PRŮCHOD ZDÍ SKONČIL');
    }
    if(attackUntil && gameTime>=attackUntil) attackUntil=0;
    if(bonusClock>=CONFIG.bonusInterval){bonusClock=0;if(!bonuses.some(b=>b.type==='phase'))randomBonus('phase');if(boss&&!bonuses.some(b=>b.type==='attack'))randomBonus('attack');}
    player.speed=CONFIG.playerSpeed*speedFactor();
    moveActor(player,dt,e=>{
      const phase=gameTime<phaseUntil;
      if(nextTile(e,e.want,phase))return e.want;
      if(nextTile(e,e.dir,phase))return e.dir;
      return null;
    },gameTime<phaseUntil);
    collect();
    ghosts.forEach(g=>moveActor(g,dt,chooseGhost));
    if(boss)moveActor(boss,dt,e=>pathDirection(e,player)||available(e)[0]);
    collisions();
    updateHUD();
  }
  function drawWall(x,y) {
    const px=x*T,py=y*T;
    ctx.fillStyle='#0b2147';ctx.fillRect(px+1,py+1,T-2,T-2);
    ctx.strokeStyle='#2177dc';ctx.lineWidth=1.5;ctx.shadowColor='#147cff';ctx.shadowBlur=8;
    if(!wall(x,y-1)){ctx.beginPath();ctx.moveTo(px+2,py+2);ctx.lineTo(px+T-2,py+2);ctx.stroke();}
    if(!wall(x,y+1)){ctx.beginPath();ctx.moveTo(px+2,py+T-2);ctx.lineTo(px+T-2,py+T-2);ctx.stroke();}
    if(!wall(x-1,y)){ctx.beginPath();ctx.moveTo(px+2,py+2);ctx.lineTo(px+2,py+T-2);ctx.stroke();}
    if(!wall(x+1,y)){ctx.beginPath();ctx.moveTo(px+T-2,py+2);ctx.lineTo(px+T-2,py+T-2);ctx.stroke();}
    ctx.shadowBlur=0;
  }
  function drawPlayer() {
    if(gameTime<invulnerableUntil && Math.floor(gameTime*10)%2===0)return;
    const x=(player.x+.5)*T,y=(player.y+.5)*T;
    const phase=gameTime<phaseUntil;
    if(phase){ctx.beginPath();ctx.arc(x,y,15+Math.sin(gameTime*10)*2,0,Math.PI*2);ctx.strokeStyle=phaseUntil-gameTime<1.2&&Math.floor(gameTime*12)%2?'#ffffff':'#42f2e1';ctx.lineWidth=3;ctx.shadowColor='#42f2e1';ctx.shadowBlur=18;ctx.stroke();}
    const angle={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[player.dir||player.want||'right'];
    const mouth=.15+Math.abs(Math.sin(gameTime*13))*.25;
    ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,12,angle+mouth,angle+Math.PI*2-mouth);ctx.closePath();
    ctx.fillStyle='#9ee8ff';ctx.shadowColor=phase?'#42f2e1':'#39aaff';ctx.shadowBlur=16;ctx.fill();ctx.shadowBlur=0;
  }
  function drawGhost(g) {
    const x=(g.x+.5)*T,y=(g.y+.5)*T+Math.sin(gameTime*6+g.mode)*1.5,r=11;
    ctx.fillStyle=g.color;ctx.shadowColor=g.color;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(x,y-2,r,Math.PI,0);ctx.lineTo(x+r,y+10);
    for(let i=0;i<4;i++){const xx=x+r-i*7;ctx.lineTo(xx-3.5,y+6+(i%2)*4);ctx.lineTo(xx-7,y+10);}
    ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#eefaff';ctx.beginPath();ctx.ellipse(x-4,y-2,3,4,0,0,Math.PI*2);ctx.ellipse(x+4,y-2,3,4,0,0,Math.PI*2);ctx.fill();
    const d=DIRS[g.dir||'left'];ctx.fillStyle='#152a58';ctx.beginPath();ctx.arc(x-4+d.x,y-2+d.y,1.5,0,Math.PI*2);ctx.arc(x+4+d.x,y-2+d.y,1.5,0,Math.PI*2);ctx.fill();
  }
  function drawBoss() {
    if(!boss)return;
    const x=(boss.x+.5)*T,y=(boss.y+.5)*T,r=20+Math.sin(gameTime*8)*2;
    ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.fillStyle=gameTime<boss.hitUntil?'#fff':'#ff496d';ctx.shadowColor='#ff284f';ctx.shadowBlur=22;ctx.fill();ctx.shadowBlur=0;
    ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
    if(bossImage.complete&&bossImage.naturalWidth)ctx.drawImage(bossImage,x-r,y-r,r*2,r*2);
    else{ctx.fillStyle='#12336b';ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle='white';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText('M',x,y+7);}
    ctx.restore();
  }
  function drawBonus(b) {
    const x=(b.x+.5)*T,y=(b.y+.5)*T, pulse=Math.sin(gameTime*7)*2;
    ctx.save();ctx.translate(x,y);ctx.rotate(gameTime*(b.type==='phase'?1:-1));
    ctx.strokeStyle=b.type==='phase'?'#42f2e1':'#bc7dff';ctx.fillStyle=b.type==='phase'?'#104e5b':'#4b226a';ctx.lineWidth=2;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=15;
    ctx.beginPath();for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,rr=10+pulse;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.rotate(-gameTime*(b.type==='phase'?1:-1));
    ctx.fillStyle='#eaffff';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.type==='phase'?'◆':'ϟ',0,0);ctx.restore();
  }
  function render() {
    ctx.fillStyle='#020711';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(wall(x,y))drawWall(x,y);
    ctx.fillStyle='#c6efff';ctx.shadowColor='#6ec7ff';ctx.shadowBlur=8;
    for(const k of dots){const [x,y]=k.split(',').map(Number);ctx.beginPath();ctx.arc((x+.5)*T,(y+.5)*T,2.5,0,Math.PI*2);ctx.fill();}
    for(const k of powerDots){const [x,y]=k.split(',').map(Number);ctx.beginPath();ctx.arc((x+.5)*T,(y+.5)*T,5+Math.sin(gameTime*7),0,Math.PI*2);ctx.fill();}
    ctx.shadowBlur=0;
    bonuses.forEach(drawBonus);ghosts.forEach(drawGhost);drawBoss();if(player)drawPlayer();
    if(bannerUntil>gameTime&&(state==='playing'||state==='boss')){
      ctx.fillStyle='#041126df';ctx.fillRect(0,canvas.height/2-29,canvas.width,58);
      ctx.fillStyle=banner.includes('MAN')?'#ff7896':'#42f2e1';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;
      ctx.textAlign='center';ctx.font='bold 26px Impact,sans-serif';ctx.letterSpacing='2px';ctx.fillText(banner,canvas.width/2,canvas.height/2+9);ctx.shadowBlur=0;
    }
  }
  function updateHUD() {
    ui.score.textContent=String(score).padStart(6,'0');ui.lives.textContent=Array.from({length:lives},()=> '◕').join(' ');
    ui.level.textContent=String(level).padStart(2,'0');const factor=speedFactor();ui.speed.textContent=`${Math.round(factor*100)}%`;
    ui.mobileScore.textContent=String(score).padStart(6,'0');
    ui.mobileLives.textContent=Array.from({length:lives},()=> '◕').join(' ') || '—';
    ui.mobileLevel.textContent=String(level).padStart(2,'0');
    ui.mobileBonus.textContent=[gameTime<phaseUntil?`◆${Math.ceil(phaseUntil-gameTime)}s`:null,gameTime<attackUntil?`ϟ${Math.ceil(attackUntil-gameTime)}s`:null].filter(Boolean).join(' ')||'—';
    ui.speedTier.textContent=factor>=1.5?'TURBO':factor>=1.2?'ZRYCHLENÝ':'ZÁKLADNÍ';
    ui.speedBar.style.width=`${Math.min(100,((factor-1)/.75)*100+18)}%`;
    const active=[];
    if(gameTime<phaseUntil)active.push(`<div class="bonus-item"><span>◆ PRŮCHOD ZDÍ</span><strong>${Math.ceil(phaseUntil-gameTime)}s</strong></div>`);
    if(gameTime<attackUntil)active.push(`<div class="bonus-item attack"><span>ϟ ÚTOK NA BOSSE</span><strong>${Math.ceil(attackUntil-gameTime)}s</strong></div>`);
    ui.bonuses.innerHTML=active.join('')||'<div class="empty-bonus">Zatím žádný aktivní bonus</div>';
    ui.bossCard.classList.toggle('hidden',!boss);if(boss)ui.bossLives.textContent=Array.from({length:boss.hp},()=> '♥').join(' ');
    ui.boardStatus.textContent=state==='paused'?'PAUZA':state==='boss'?'BOSS FIGHT':state==='playing'?'VE HŘE':state==='gameover'?'KONEC HRY':'PŘIPRAV SE';
    ui.levelProgress.textContent=`${initialDots-dots.size-powerDots.size} / ${initialDots} TEČEK`;
  }
  function notify(message,duration=1800) {
    ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),duration);
  }
  function showOverlay(title,body,button) {
    ui.overlay.classList.remove('hidden');
    ui.overlay.querySelector('h1').innerHTML=title.includes('PAC-MAN')?'PAC-MAN<span>THE MAN EDITION</span>':title;
    ui.overlay.querySelector('p').textContent=body;ui.mainButton.innerHTML=`${button} <span>↗</span>`;
    ui.overlay.querySelector('.hero-symbol').textContent=title==='GAME OVER'?'×':title==='PAUZA'?'Ⅱ':'◕';
  }
  function hideOverlay(){ui.overlay.classList.add('hidden');}
  function togglePause(){
    if(state==='playing'||state==='boss'){state='paused';showOverlay('PAUZA','Hra čeká. Nadechni se a pokračuj.','POKRAČOVAT');}
    else if(state==='paused'){state=boss?'boss':'playing';hideOverlay();lastFrame=performance.now();}
    updateHUD();
  }
  function sound(name){
    if(muted)return;
    try{
      audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
      const now=audio.currentTime;
      const patterns={dot:[[480,.045,0]],bonus:[[620,.09,0],[920,.12,.09]],hurt:[[250,.15,0],[130,.25,.15]],boss:[[160,.14,0],[130,.14,.15],[100,.35,.3]],hit:[[330,.08,0],[650,.14,.09]],win:[[420,.09,0],[540,.09,.1],[720,.2,.2]],start:[[340,.08,0],[480,.08,.1],[680,.16,.2]],gameover:[[380,.14,0],[290,.16,.15],[180,.3,.32]]};
      for(const [freq,len,delay] of patterns[name]||[]){const osc=audio.createOscillator(),gain=audio.createGain();osc.type=name==='boss'?'sawtooth':'square';osc.frequency.setValueAtTime(freq,now+delay);gain.gain.setValueAtTime(.035,now+delay);gain.gain.exponentialRampToValueAtTime(.001,now+delay+len);osc.connect(gain).connect(audio.destination);osc.start(now+delay);osc.stop(now+delay+len);}
    }catch(_){/* Browsers without Web Audio still run the game. */}
  }
  function frame(ts){
    if(!lastFrame)lastFrame=ts;accumulator+=Math.min((ts-lastFrame)/1000,.1);lastFrame=ts;
    const STEP=1/120;while(accumulator>=STEP){tick(STEP);accumulator-=STEP;}
    render();requestAnimationFrame(frame);
  }
  const controls={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right'};
  window.addEventListener('keydown',e=>{
    if(controls[e.code]){e.preventDefault();if(player)player.want=controls[e.code];if(state==='menu')newGame();}
    else if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();togglePause();}
    else if(e.code==='Enter'&&state==='menu')newGame();
  });
  document.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();if(state==='menu')newGame();if(player)player.want=b.dataset.dir;}));
  let touchStart=null;
  const touchBoard=document.querySelector('.canvas-wrap');
  touchBoard.addEventListener('touchstart',e=>{
    if(state!=='playing'&&state!=='boss')return;
    const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY};
  },{passive:true});
  touchBoard.addEventListener('touchmove',e=>{
    if(!touchStart||(state!=='playing'&&state!=='boss'))return;
    e.preventDefault();
    const t=e.touches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;
    if(Math.hypot(dx,dy)<18)return;
    player.want=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
    touchStart={x:t.clientX,y:t.clientY};
  },{passive:false});
  touchBoard.addEventListener('touchend',()=>{touchStart=null;});
  ui.mainButton.addEventListener('click',()=>state==='paused'?togglePause():newGame());
  ui.pauseButton.addEventListener('click',togglePause);
  ui.restartButton.addEventListener('click',newGame);
  ui.soundButton.addEventListener('click',()=>{muted=!muted;ui.soundButton.textContent=muted?'♩':'♫';ui.soundButton.title=muted?'Zvuk vypnutý':'Zvuk zapnutý';ui.soundButton.setAttribute('aria-label',muted?'Zapnout zvuk':'Vypnout zvuk');});
  buildLevel();state='menu';updateHUD();requestAnimationFrame(frame);
})();
