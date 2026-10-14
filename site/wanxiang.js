(function(){
'use strict';
const KEY='football_wanxiang_single_v1';
const ROOT=document.getElementById('wanxiang');
const FACTIONS=[
 {id:'academy',name:'青训工厂',color:'#7addbb',hint:'2人：全队+4；4人：年轻力量再+8'},
 {id:'star',name:'银河巨星',color:'#e8c26d',hint:'2人：锋线+8；4人：进攻额外+9'},
 {id:'wall',name:'铁血防线',color:'#88bbef',hint:'2人：防线+9；4人：防守额外+9'},
 {id:'control',name:'极致传控',color:'#b3a4ff',hint:'2人：中场+8；4人：组织额外+9'},
 {id:'press',name:'高位压迫',color:'#ff9990',hint:'2人：攻防+4；4人：攻防额外+6'},
 {id:'legacy',name:'豪门传承',color:'#f0c4a5',hint:'2人：三线+3；4人：三线额外+6'}
];
const COACHES=[
 {id:'legacy',name:'传奇教父',skill:'逆风号角',detail:'落后时每次进攻小幅提升进球机会。'},
 {id:'control',name:'控球宗师',skill:'节奏控制',detail:'传控打法的中场强度额外增加。'},
 {id:'press',name:'压迫大师',skill:'全员逼抢',detail:'高位逼抢的进攻效率提高。'},
 {id:'wall',name:'防反名帅',skill:'铁血意志',detail:'防线组织能力额外增加。'},
 {id:'star',name:'更衣室大师',skill:'巨星管理',detail:'锋线核心的终结能力增强。'},
 {id:'academy',name:'青训导师',skill:'明日之星',detail:'球员训练所需资金减少。'}
];
const ROLE={G:'门将',D:'后卫',M:'中场',F:'前锋'};
const LIMIT={G:1,D:2,M:2,F:2};
const EVENTS=[
 {id:'fund',name:'赞助到位',desc:'获得8枚转会币',use(t){t.cash+=8;return '获得8枚转会币';}},
 {id:'train',name:'全队集训',desc:'随机两位上阵球员提升1级',use(t){let p=shuffle(t.lineup).slice(0,2);p.forEach(x=>x.level=Math.min(5,x.level+1));return p.length?'强化 '+p.map(x=>x.name).join('、'):'阵容为空';}},
 {id:'guard',name:'守住阵地',desc:'下一场防守+12',use(t){t.temp.def+=12;return '下一场防守+12';}},
 {id:'pass',name:'手术刀直塞',desc:'下一场进攻+10',use(t){t.temp.atk+=10;return '下一场进攻+10';}},
 {id:'mid',name:'阵地组织',desc:'下一场组织+12',use(t){t.temp.mid+=12;return '下一场组织+12';}},
 {id:'scout',name:'精英球探',desc:'免费刷新商店，获得4枚转会币',use(t){t.cash+=4;state.shop=makeShop();return '刷新商店并获得4枚转会币';}},
 {id:'heal',name:'球迷助威',desc:'恢复6点俱乐部声望',use(t){t.hp=Math.min(70,t.hp+6);return '恢复6点俱乐部声望';}},
 {id:'break',name:'压哨反扑',desc:'下一场进攻+6；落后时能力增强',use(t){t.temp.atk+=6;t.temp.comeback=true;return '下一场获得压哨反扑';}}
];
let state=null,selected=1,seq=1;
function rnd(n){return Math.floor(Math.random()*n);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function shuffle(arr){let a=arr.slice();for(let i=a.length-1;i>0;i--){let j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function pool(){
 let clubs=(window.FOOTBALL_DATABASE&&window.FOOTBALL_DATABASE.clubs)||[];
 let a=[];
 clubs.forEach((c,ci)=>(c.players||[]).forEach((p,pi)=>{
  let role=(p.pos||'M').charAt(0).toUpperCase();if(!ROLE[role])return;
  let name=p.cn||p.name;if(!name)return;
  a.push({name,role,faction:FACTIONS[(ci*3+pi)%6].id,tier:1+((ci+pi*3)%4)});
 }));
 if(a.length<50){
  const fallback={G:['星辰门将','钢铁门神','青训守护者'],D:['飞翼卫士','铁血后卫','后防队长','边路尖兵'],M:['传控司令','红魔组织者','节奏大师','中场发动机'],F:['锋线猎手','闪电射手','黄金前锋','禁区杀手']};
  for(let role of Object.keys(fallback))fallback[role].forEach((name,i)=>a.push({name,role,faction:FACTIONS[i%6].id,tier:1+(i%3)}));
 }
 return a;
}
const POOL=pool();
function fresh(role,maxTier){
 let p=POOL.filter(x=>(!role||x.role===role)&&x.tier<=maxTier);
 if(!p.length)p=POOL.filter(x=>!role||x.role===role);
 let source=p[rnd(p.length)]||POOL[0]||{name:'青训新秀',role:role||'M',faction:'academy',tier:1};
 return {uid:seq++,name:source.name,role:source.role,faction:source.faction,tier:source.tier,level:1};
}
function team(i,name,coach){
 return {id:i,name,coach, hp:70,cash:22,win:0,draw:0,loss:0,tactic:'balance',
 lineup:['G','D','M','F'].map(r=>fresh(r,2)),bench:[],temp:{atk:0,def:0,mid:0,comeback:false}};
}
function cardCost(p){return 2+p.tier*3;}
function trainCost(p,t){return Math.max(2,3+p.level*2-(t.coach==='academy'?2:0));}
function maxTier(){return clamp(Math.floor((state?state.round:1)/4)+2,2,5);}
function makeShop(){return Array.from({length:4},()=>fresh(null,maxTier()));}
function countRole(t,role){return t.lineup.filter(p=>p.role===role).length;}
function player(){return state.teams[0];}
function save(){try{localStorage.setItem(KEY,JSON.stringify({version:1,state,seq}));}catch(e){}}
function load(){try{let x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&x.version===1&&x.state&&Array.isArray(x.state.teams)&&x.state.teams.length===6){seq=Number(x.seq)||100;return x.state;}}catch(e){}return null;}
function log(msg){state.history.unshift('第'+state.round+'轮 · '+msg);state.history=state.history.slice(0,28);}
function createGame(name,coach){
 seq=1;
 let aiNames=['城市竞技','北境雄狮','黄金海岸','铁血联队','星河体育'];
 state={round:1,phase:'shop',teams:[team(0,name,coach),...aiNames.map((n,i)=>team(i+1,n,COACHES[(i+1)%6].id))],shop:[],events:[],eventUsed:false,shopFrozen:false,history:[],results:[],message:'欢迎来到绿茵万象棋。选择球员、培养阵容，准备挑战5名电脑经理。',winner:null};
 state.shop=makeShop();state.events=shuffle(EVENTS.map(x=>x.id)).slice(0,2);selected=1;save();render();
}
function buffs(t){
 let counts={};t.lineup.forEach(p=>counts[p.faction]=(counts[p.faction]||0)+1);
 let b={atk:0,def:0,mid:0,active:[]};
 Object.entries(counts).forEach(([id,n])=>{
  let a=n>=4?2:n>=2?1:0;if(!a)return;
  b.active.push({id,n,stage:a,name:FACTIONS.find(f=>f.id===id).name});
  if(id==='academy'){b.atk+=4+(a===2?8:0);b.mid+=4+(a===2?8:0);}
  if(id==='star')b.atk+=8+(a===2?9:0);
  if(id==='wall')b.def+=9+(a===2?9:0);
  if(id==='control')b.mid+=8+(a===2?9:0);
  if(id==='press'){b.atk+=4+(a===2?6:0);b.def+=4+(a===2?6:0);}
  if(id==='legacy'){let val=3+(a===2?6:0);b.atk+=val;b.def+=val;b.mid+=val;}
 });
 return b;
}
function power(t){
 const val=p=>9+4*p.tier+4*p.level;
 let s={atk:10,def:10,mid:10};
 for(let p of t.lineup){let v=val(p);
  if(p.role==='G')s.def+=v*.9;
  if(p.role==='D'){s.def+=v*.85;s.mid+=v*.15;}
  if(p.role==='M'){s.mid+=v*.85;s.atk+=v*.28;s.def+=v*.1;}
  if(p.role==='F'){s.atk+=v*.88;s.mid+=v*.12;}
 }
 let b=buffs(t);s.atk+=b.atk;s.def+=b.def;s.mid+=b.mid;
 if(t.coach==='legacy')s.atk+=4;
 if(t.coach==='control')s.mid+=7;
 if(t.coach==='press')s.atk+=7;
 if(t.coach==='wall')s.def+=9;
 if(t.coach==='star')s.atk+=7;
 if(t.coach==='academy')s.mid+=4;
 if(t.tactic==='press'){s.atk+=8;s.def-=5;}
 if(t.tactic==='control'){s.mid+=9;s.atk+=2;}
 if(t.tactic==='counter'){s.def+=7;s.atk+=4;s.mid-=4;}
 s.atk+=t.temp.atk;s.def+=t.temp.def;s.mid+=t.temp.mid;
 return {atk:Math.round(s.atk),def:Math.round(s.def),mid:Math.round(s.mid),buff:b};
}
function opponentAdapt(a,b){if(a.tactic==='press'&&b.tactic==='control')return .04;if(a.tactic==='counter'&&b.tactic==='press')return .06;if(a.tactic==='control'&&b.tactic==='counter')return .02;return 0;}
function goals(a,b,pa,pb){
 let chance=clamp(.18+(pa.atk*.47+pa.mid*.20-pb.def*.46)/115+opponentAdapt(a,b),.07,.62);
 if(a.temp.comeback)chance=Math.min(.68,chance+.06);
 let tries=clamp(Math.round(4+pa.mid/40),4,8),g=0;
 for(let i=0;i<tries;i++)if(Math.random()<chance*.54)g++;
 return Math.min(7,g);
}
function match(a,b){
 let pa=power(a),pb=power(b),ga=goals(a,b,pa,pb),gb=goals(b,a,pb,pa);
 if(ga>gb){a.win++;b.loss++;b.hp=Math.max(0,b.hp-(5+3*(ga-gb)));a.cash+=2;}
 else if(gb>ga){b.win++;a.loss++;a.hp=Math.max(0,a.hp-(5+3*(gb-ga)));b.cash+=2;}
 else {a.draw++;b.draw++;a.cash++;b.cash++;}
 return {a:a.id,b:b.id,ga,gb};
}
function income(t){t.cash=clamp(t.cash+6+Math.min(4,Math.floor(t.cash/10)),0,999);}
function aiTurn(t){
 if(t.hp<=0)return;
 let target=['G','D','D','M','M','F','F'];
 for(let role of target){
  if(countRole(t,role)>=LIMIT[role])continue;
  let cands=POOL.filter(x=>x.role===role&&x.tier<=maxTier()&&cardCost(x)<=t.cash);
  if(!cands.length)continue;
  let p=cands[rnd(cands.length)];t.cash-=cardCost(p);
  t.lineup.push({uid:seq++,name:p.name,role:p.role,faction:p.faction,tier:p.tier,level:1});
 }
 let options=t.lineup.filter(p=>p.level<5&&trainCost(p,t)<=t.cash);
 for(let n=0;n<(state.round>9?2:1)&&options.length;n++){
  let p=options[rnd(options.length)];if(!p||trainCost(p,t)>t.cash)break;
  t.cash-=trainCost(p,t);p.level++;
 }
 t.tactic=['balance','press','counter','control'][(t.id+Math.floor(state.round/3))%4];
 if(Math.random()<.35){t.temp[['atk','def','mid'][rnd(3)]]+=6;}
}
function doBattle(){
 if(!state||state.winner!==null)return;
 let t=player();
 if(t.lineup.length<3){state.message='至少需要3名上阵球员才能开赛。';render();return;}
 state.phase='battle';state.results=[];
 state.teams.slice(1).forEach(aiTurn);
 let alive=shuffle(state.teams.filter(x=>x.hp>0));
 if(alive.length%2===1){let ghost=alive.pop();ghost.cash+=2;log(ghost.name+' 本轮轮空，获得2枚转会币');}
 for(let i=0;i<alive.length;i+=2)state.results.push(match(alive[i],alive[i+1]));
 let own=state.results.find(x=>x.a===0||x.b===0);
 if(own){
  let other=state.teams[own.a===0?own.b:own.a],me=own.a===0?own.ga:own.gb,them=own.a===0?own.gb:own.ga;
  state.message='第'+state.round+'轮：'+t.name+' '+me+' : '+them+' '+other.name+(me>them?' · 获胜！':me<them?' · 遗憾落败':' · 战平');
  log(state.message);
 }else{state.message='本轮轮空。';log(state.message);}
 state.teams.forEach(x=>{income(x);x.temp={atk:0,def:0,mid:0,comeback:false};});
 let living=state.teams.filter(x=>x.hp>0);
 if(t.hp<=0||living.length<=1||state.round>=24){
  let top=ranked()[0];state.winner=top.id;
  state.phase='done';state.message=(top.id===0?'恭喜夺冠！':'赛季结束。冠军：'+top.name)+' 最终排名已出炉。';
  log(state.message);
 }else{
  state.round++;state.phase='shop';state.eventUsed=false;
  if(!state.shopFrozen)state.shop=makeShop();
  state.events=shuffle(EVENTS.map(x=>x.id)).slice(0,2);
 }
 save();render();
}
function ranked(){return state.teams.slice().sort((a,b)=>(b.hp-a.hp)||(b.win-a.win)||(b.cash-a.cash));}
function action(type,arg){
 let t=player(),p;
 if(type==='buy'){let i=Number(arg);p=state.shop[i];if(!p)return;
  if(t.cash<cardCost(p)){state.message='转会币不足。';return;}
  let starters=countRole(t,p.role)<LIMIT[p.role];
  if(!starters&&t.bench.length>=8){state.message='替补席已满（8人）。';return;}
  t.cash-=cardCost(p);
  (starters?t.lineup:t.bench).push(p);state.shop.splice(i,1);state.message='签下 '+p.name+(starters?'，自动上阵。':'，进入替补席。');
 }else if(type==='refresh'){if(t.cash<2){state.message='刷新需要2枚转会币。';return;}t.cash-=2;state.shop=makeShop();state.message='转会市场已刷新。';
 }else if(type==='freeze'){state.shopFrozen=!state.shopFrozen;state.message=state.shopFrozen?'下轮保留当前市场。':'解除锁定。';
 }else if(type==='train'){p=t.lineup.concat(t.bench).find(x=>x.uid===Number(arg));if(!p||p.level>=5)return;let c=trainCost(p,t);if(t.cash<c){state.message='训练资金不足，需要'+c+'枚。';return;}t.cash-=c;p.level++;state.message=p.name+' 训练升级至 Lv.'+p.level;
 }else if(type==='sell'){p=t.lineup.concat(t.bench).find(x=>x.uid===Number(arg));if(!p)return;
  t.lineup=t.lineup.filter(x=>x.uid!==p.uid);t.bench=t.bench.filter(x=>x.uid!==p.uid);t.cash+=Math.max(2,Math.floor(cardCost(p)*.55)+p.level-1);state.message=p.name+' 已出售。';
 }else if(type==='toggle'){p=t.lineup.find(x=>x.uid===Number(arg));if(p){t.lineup=t.lineup.filter(x=>x.uid!==p.uid);t.bench.push(p);state.message=p.name+' 调整为替补。';}
  else{p=t.bench.find(x=>x.uid===Number(arg));if(!p)return;if(countRole(t,p.role)>=LIMIT[p.role]){state.message=ROLE[p.role]+'位置已满，请先撤下一名同位置球员。';return;}t.bench=t.bench.filter(x=>x.uid!==p.uid);t.lineup.push(p);state.message=p.name+' 上阵。';}
 }else if(type==='event'){if(state.eventUsed)return;let e=EVENTS.find(x=>x.id===arg);if(!e)return;let result=e.use(t);state.eventUsed=true;state.message=e.name+'：'+result;log('使用 '+e.name);
 }else if(type==='tactic'){if(!['balance','press','control','counter'].includes(arg))return;t.tactic=arg;state.message='战术已切换。';
 }
 save();render();
}
function playerHTML(p,inBench){
 let f=FACTIONS.find(x=>x.id===p.faction),t=player(),c=trainCost(p,t),editable=state.winner===null;
 return '<div class="wx-card" style="--f:'+f.color+'"><div class="wx-card-head"><span class="wx-rarity">◆'+p.tier+'阶</span><span>'+ROLE[p.role]+'</span></div>'+
 '<strong>'+esc(p.name)+'</strong><small>'+f.name+' · Lv.'+p.level+' / 5</small><div class="wx-stars">'+('★'.repeat(p.level))+'</div>'+
 (editable?'<div class="wx-card-actions"><button data-act="toggle" data-id="'+p.uid+'">'+(inBench?'上阵':'替补')+'</button><button data-act="train" data-id="'+p.uid+'" '+(p.level>=5||t.cash<c?'disabled':'')+'>训练 '+(p.level>=5?'满级':c+'币')+'</button><button data-act="sell" data-id="'+p.uid+'">出售</button></div>':'')+'</div>';
}
function render(){
 if(!state){ROOT.querySelector('#wx-setup').hidden=false;ROOT.querySelector('#wx-game').hidden=true;return;}
 ROOT.querySelector('#wx-setup').hidden=true;ROOT.querySelector('#wx-game').hidden=false;
 let t=player(),pow=power(t),result=state.results,done=state.winner!==null;
 document.getElementById('wx-headline').textContent='第 '+state.round+' 回合'+(done?' · 决赛结束':' · 经营备战');
 document.getElementById('wx-credits').textContent=t.cash+' 转会币';
 document.getElementById('wx-hp').textContent=t.hp+' / 70';
 document.getElementById('wx-current').textContent=state.message;
 document.getElementById('wx-powers').textContent='进攻 '+pow.atk+'　防守 '+pow.def+'　组织 '+pow.mid;
 document.getElementById('wx-scoreboard').innerHTML=ranked().map((x,i)=>'<button type="button" class="wx-standing '+(x.id===selected?'on ':'')+(x.hp===0?'eliminated':'')+'" data-act="scout" data-id="'+x.id+'"><span>'+(i+1)+'. '+esc(x.name)+(x.id===0?'（你）':'')+'</span><b>'+x.hp+' ♥</b><small>'+x.win+'胜 '+x.draw+'平 '+x.loss+'负</small></button>').join('');
 document.getElementById('wx-scout').innerHTML=(function(){
  let x=state.teams[selected]||t,sp=power(x);
  return '<b>'+esc(x.name)+'</b> <small>｜主教练 '+(COACHES.find(c=>c.id===x.coach)||COACHES[0]).name+'</small><p>进攻 '+sp.atk+' · 防守 '+sp.def+' · 组织 '+sp.mid+' · 上阵 '+x.lineup.length+' 人</p>'+
  '<div class="wx-tags">'+(sp.buff.active.map(f=>'<span>'+f.name+' '+f.n+'</span>').join('')||'<span>暂无激活羁绊</span>')+'</div>';
 })();
 const pitch=document.getElementById('wx-pitch');
 pitch.innerHTML=['F','M','D','G'].map(role=>'<div class="wx-line"><span class="wx-position">'+ROLE[role]+'</span>'+Array.from({length:LIMIT[role]},(_,slot)=>{let p=t.lineup.filter(z=>z.role===role)[slot];return p?'<div class="wx-token" style="--f:'+FACTIONS.find(x=>x.id===p.faction).color+'"><b>'+esc(p.name)+'</b><small>'+p.tier+'阶 · Lv.'+p.level+'</small></div>':'<div class="wx-slot">+ 待上阵</div>';}).join('')+'</div>').join('');
 document.getElementById('wx-factions').innerHTML=FACTIONS.map(f=>{let n=t.lineup.filter(p=>p.faction===f.id).length;return '<span class="'+(n>=2?'active':'')+'" title="'+f.hint+'">'+f.name+' '+n+'/2</span>';}).join('');
 document.getElementById('wx-lineup').innerHTML=t.lineup.length?t.lineup.map(p=>playerHTML(p,false)).join(''):'<p class="wx-muted">暂无上阵球员</p>';
 document.getElementById('wx-bench').innerHTML=t.bench.length?t.bench.map(p=>playerHTML(p,true)).join(''):'<p class="wx-muted">暂无替补</p>';
 document.getElementById('wx-market').innerHTML=state.shop.length?state.shop.map((p,i)=>{let f=FACTIONS.find(x=>x.id===p.faction),c=cardCost(p);return '<div class="wx-buy" style="--f:'+f.color+'"><small>'+p.tier+'阶 · '+ROLE[p.role]+'</small><b>'+esc(p.name)+'</b><small>'+f.name+'</small><button type="button" data-act="buy" data-id="'+i+'" '+(t.cash<c||done?'disabled':'')+'>'+c+'币 · 签约</button></div>';}).join(''):'<p class="wx-muted">市场已售罄，可刷新。</p>';
 document.getElementById('wx-events').innerHTML=state.events.map(id=>{let e=EVENTS.find(x=>x.id===id);return '<button type="button" data-act="event" data-id="'+e.id+'" '+(state.eventUsed||done?'disabled':'')+'><b>'+e.name+'</b><small>'+e.desc+'</small></button>';}).join('');
 document.getElementById('wx-event-note').textContent=state.eventUsed?'本回合已使用事件牌，每回合限使用1张。':'每回合选择一张事件牌（可不用）。';
 let select=ROOT.querySelector('#wx-tactic');select.value=t.tactic;select.disabled=done;
 ROOT.querySelector('#wx-fight').disabled=done;ROOT.querySelector('#wx-refresh').disabled=done||t.cash<2;ROOT.querySelector('#wx-freeze').disabled=done;
 ROOT.querySelector('#wx-freeze').textContent=state.shopFrozen?'解除锁定商店':'锁定商店';
 document.getElementById('wx-last-results').innerHTML=result.length?result.map(m=>'<div>'+esc(state.teams[m.a].name)+' <b>'+m.ga+' : '+m.gb+'</b> '+esc(state.teams[m.b].name)+'</div>').join(''):'<p class="wx-muted">首轮尚未开赛。</p>';
 document.getElementById('wx-history').innerHTML=state.history.length?state.history.slice(0,8).map(x=>'<p>'+esc(x)+'</p>').join(''):'<p class="wx-muted">比赛记录将在这里出现。</p>';
 document.getElementById('wx-finish').hidden=!done;
 if(done){let winner=state.teams[state.winner];document.getElementById('wx-finish').textContent=(state.winner===0?'🏆 你夺得万象冠军杯！':'🏆 冠军是 '+winner.name+'，你排名第'+(ranked().findIndex(x=>x.id===0)+1)+'名')+'。可点击重新开局。';}
}
function init(){
 const cached=load();
 ROOT.querySelector('#wx-resume').hidden=!cached;
 ROOT.addEventListener('click',ev=>{
  const btn=ev.target.closest('button[data-act]');if(!btn||!ROOT.contains(btn)||btn.disabled)return;
  const type=btn.dataset.act,arg=btn.dataset.id;
  if(type==='start'){let nick=ROOT.querySelector('#wx-nick').value.trim().slice(0,14)||'绿茵经理';createGame(nick,ROOT.querySelector('#wx-coach').value);return;}
  if(type==='resume'){state=load();if(state){selected=1;render();}return;}
  if(type==='restart'){if(window.confirm('重新开局会覆盖当前单机存档，确定吗？')){state=null;ROOT.querySelector('#wx-resume').hidden=true;try{localStorage.removeItem(KEY);}catch(e){}render();}return;}
  if(!state)return;
  if(type==='scout'){selected=Number(arg);render();return;}
  if(type==='fight'){doBattle();return;}
  if(state.winner!==null)return;
  if(['buy','refresh','freeze','train','sell','toggle','event','tactic'].includes(type))action(type,arg);
 });
 ROOT.querySelector('#wx-tactic').addEventListener('change',ev=>{if(state&&state.winner===null)action('tactic',ev.target.value);});
 render();
}
init();
})();
