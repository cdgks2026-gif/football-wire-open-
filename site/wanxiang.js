(function(){
'use strict';
const KEY='football_wanxiang_single_v1';
const ROOT=document.getElementById('wanxiang');
const FACTIONS=[
 {id:'academy',icon:'🌱',name:'青训工厂',color:'#59dcb2',short:'越养越强',base:'每场累积青训进度；每满2点，自动培养1名低等级球员。',boost:'青训升级额外强化球队组织与进攻。',guide:'成长期｜优先凑2名青训球员，再培养低阶核心。'},
 {id:'star',icon:'★',name:'银河巨星',color:'#e8c26d',short:'明星单核',base:'王牌前锋获得额外终结能力；每轮积累星光热度。',boost:'星光额外强化进攻，形成超级得分手。',guide:'单核流｜重点提升前锋等级，别把资源平均分配。'},
 {id:'wall',icon:'◆',name:'铁血防线',color:'#86c1f7',short:'防守反击',base:'增加防线协作，比赛后积累钢铁壁垒。',boost:'壁垒成长更快，防守成功时获得额外反击能力。',guide:'防守流｜保留后卫和门将，搭配稳守反击。'},
 {id:'control',icon:'∞',name:'极致传控',color:'#baa8ff',short:'控球运营',base:'强化中场组织；选择控球战术还能获得额外转会资金。',boost:'提升传控效率，节奏越稳，组织越强。',guide:'运营流｜用控球组织战术赚取额外资金。'},
 {id:'press',icon:'⚡',name:'高位压迫',color:'#fa998d',short:'快攻抢断',base:'增加进攻强度；使用逼抢战术时获得额外收益。',boost:'逼抢效果翻倍，但防守端仍承担风险。',guide:'快攻流｜搭配高位逼抢战术主动冲击对手。'},
 {id:'legacy',icon:'♛',name:'豪门传承',color:'#f1c6a0',short:'传帮带',base:'进攻、防守、组织共同提升；每3次参赛自动培养后备力量。',boost:'更强的全能加成，拥有替补时成长更快。',guide:'均衡流｜积累队伍深度，及时轮换上阵。'}
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
const TALENTS=[
 {id:'striker',icon:'⚔',name:'进球机器',desc:'永久增加球队进攻 +14',effect:'进攻+14'},
 {id:'wall',icon:'◈',name:'钢铁阵线',desc:'永久增加球队防守 +14',effect:'防守+14'},
 {id:'brain',icon:'∞',name:'中场大脑',desc:'永久增加组织能力 +14',effect:'组织+14'},
 {id:'budget',icon:'◆',name:'转会操盘手',desc:'之后每轮额外获得3枚转会币',effect:'每轮+3币'},
 {id:'youth',icon:'🌱',name:'天才青训',desc:'训练球员所需转会币永久 -2',effect:'训练费用-2'},
 {id:'momentum',icon:'⚡',name:'不屈斗志',desc:'永久获得进攻 +7、防守 +7',effect:'攻防各+7'}
];
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
 return {id:i,name,coach, hp:80,cash:28,win:0,draw:0,loss:0,tactic:'balance',
 lineup:['G','D','M','F'].map(r=>fresh(r,2)),bench:[],resources:{academy:0,star:0,wall:0,control:0,press:0,legacy:0},talents:[],temp:{atk:0,def:0,mid:0,comeback:false}};
}
function cardCost(p){return 2+p.tier*3;}
function trainCost(p,t){return Math.max(2,3+p.level*2-(t.coach==='academy'?2:0)-(t.talents?.includes('youth')?2:0));}
function maxTier(){return clamp(Math.floor((state?state.round:1)/4)+2,2,5);}
function bestFaction(t){
 const counts={};t.lineup.forEach(p=>counts[p.faction]=(counts[p.faction]||0)+1);
 let list=FACTIONS.map(f=>({id:f.id,n:counts[f.id]||0,score:(counts[f.id]||0)*10+(f.id===t.coach?5:0)+(state&&state.focus===f.id?16:0)}));
 list.sort((a,b)=>b.score-a.score);return list[0]||{id:'academy',n:0};
}
function makeShop(){
 const options=Array.from({length:4},()=>fresh(null,maxTier()));
 const t=state&&state.teams&&state.teams[0];if(!t)return options;
 const focus=bestFaction(t),faction=focus.id;
 const roles=['G','D','M','F'].filter(role=>countRole(t,role)<LIMIT[role]);
 const candidates=POOL.filter(p=>p.faction===faction&&p.tier<=maxTier()&&(roles.includes(p.role)||t.bench.length<8));
 if(candidates.length){const p=candidates[rnd(candidates.length)];options[rnd(4)]={uid:seq++,name:p.name,role:p.role,faction:p.faction,tier:p.tier,level:1};}
 return options;
}
function countRole(t,role){return t.lineup.filter(p=>p.role===role).length;}
function player(){return state.teams[0];}
function save(){try{localStorage.setItem(KEY,JSON.stringify({version:1,state,seq}));}catch(e){}}
function load(){try{let x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&x.version===1&&x.state&&Array.isArray(x.state.teams)&&x.state.teams.length===6){seq=Number(x.seq)||100;x.state.teams.forEach(t=>{t.resources=t.resources||{academy:0,star:0,wall:0,control:0,press:0,legacy:0};t.talents=t.talents||[];});return x.state;}}catch(e){}return null;}
function log(msg){state.history.unshift('第'+state.round+'轮 · '+msg);state.history=state.history.slice(0,28);}
function createGame(name,coach){
 seq=1;
 let aiNames=['城市竞技','北境雄狮','黄金海岸','铁血联队','星河体育'];
 state={round:1,phase:'shop',teams:[team(0,name,coach),...aiNames.map((n,i)=>team(i+1,n,COACHES[(i+1)%6].id))],shop:[],events:[],eventUsed:false,shopFrozen:false,history:[],results:[],message:'欢迎来到绿茵万象棋。选择球员、培养阵容，准备挑战5名电脑经理。',winner:null,battleReport:null,focus:coach,talentOffers:[]};
 
 // First-match identity: two chosen-faction starters create an immediately understandable playstyle.
 const me=state.teams[0];
 for(const role of ['M','F']){
  const candidates=POOL.filter(p=>p.role===role&&p.faction===coach&&p.tier<=2);
  if(candidates.length){const p=candidates[rnd(candidates.length)],index=me.lineup.findIndex(q=>q.role===role);
   if(index>=0)me.lineup[index]={uid:seq++,name:p.name,role:p.role,faction:p.faction,tier:p.tier,level:1};}
 }
 state.shop=makeShop();state.events=shuffle(EVENTS.map(x=>x.id)).slice(0,2);selected=1;save();render();
}
function factionCount(t,id){return t.lineup.filter(p=>p.faction===id).length;}
function buffs(t){
 const counts={};t.lineup.forEach(p=>counts[p.faction]=(counts[p.faction]||0)+1);
 const b={atk:0,def:0,mid:0,active:[]},r=t.resources||{};
 for(const [id,n] of Object.entries(counts)){
  const stage=n>=4?2:n>=2?1:0;if(!stage)continue;
  const f=FACTIONS.find(x=>x.id===id);b.active.push({id,n,stage,name:f.name});
  if(id==='academy'){b.mid+=5+(stage===2?13:0);b.atk+=3+(stage===2?8:0);}
  if(id==='star'){b.atk+=8+(stage===2?12:0)+Math.min(8,(r.star||0)*2);}
  if(id==='wall'){b.def+=10+(stage===2?15:0)+Math.min(12,(r.wall||0)*2);if(stage===2)b.atk+=6;}
  if(id==='control'){b.mid+=9+(stage===2?14:0)+Math.min(8,(r.control||0)*2);if(t.tactic==='control')b.mid+=5;}
  if(id==='press'){b.atk+=6+(stage===2?12:0);b.def+=stage===2?6:2;if(t.tactic==='press')b.atk+=8;}
  if(id==='legacy'){let x=4+(stage===2?8:0);b.atk+=x;b.def+=x;b.mid+=x;}
 }
 return b;
}
function turnGrowth(t){
 let notes=[],r=t.resources||(t.resources={academy:0,star:0,wall:0,control:0,press:0,legacy:0});
 const n=id=>factionCount(t,id);
 if(n('academy')>=2){
   r.academy++;if(r.academy>=2){r.academy=0;let list=t.lineup.filter(p=>p.level<5).sort((a,b)=>a.level-b.level);
    if(list.length){list[0].level++;notes.push('🌱 青训培养：'+list[0].name+' 升至Lv.'+list[0].level);}}
 }
 if(n('star')>=2){r.star=Math.min(4,(r.star||0)+1);notes.push('★ 星光热度 '+r.star+'/4');}
 if(n('wall')>=2){r.wall=Math.min(6,(r.wall||0)+1);notes.push('◆ 钢铁壁垒 '+r.wall+'/6');}
 if(n('control')>=2){r.control=Math.min(4,(r.control||0)+1);if(t.tactic==='control'){t.cash+=2;notes.push('∞ 传控运营：获得2枚转会币');}else notes.push('∞ 掌控节奏 '+r.control+'/4');}
 if(n('press')>=2&&t.tactic==='press'){r.press=(r.press||0)+1;t.cash+=2;notes.push('⚡ 前场反抢：获得2枚转会币');}
 if(n('legacy')>=2){r.legacy=(r.legacy||0)+1;if(r.legacy%3===0){let p=t.bench.find(x=>x.level<5)||t.lineup.find(x=>x.level<5);if(p){p.level++;notes.push('♛ 师徒传承：'+p.name+' 升至Lv.'+p.level);}}}
 return notes;
}

function power(t){
 const val=p=>9+4*p.tier+4*p.level;
 let s={atk:10,def:10,mid:10};
 for(let p of t.lineup){let v=val(p);
  if(p.role==='G')s.def+=v*.9;
  if(p.role==='D'){s.def+=v*.85;s.mid+=v*.15;}
  if(p.role==='M'){s.mid+=v*.85;s.atk+=v*.28;s.def+=v*.1;}
  if(p.role==='F'){s.atk+=v*.88;s.mid+=v*.12;}
  const active=factionCount(t,p.faction)>=2;
  if(active&&p.faction==='academy'&&p.level>=3){s.mid+=5;s.atk+=3;}
  if(active&&p.faction==='star'){if(p.role==='F')s.atk+=3*p.level;else s.mid+=4;}
  if(active&&p.faction==='wall')s.def+=p.role==='D'||p.role==='G'?3*p.level:2;
  if(active&&p.faction==='control'&&p.role==='M')s.mid+=t.tactic==='control'?4*p.level:2*p.level;
  if(active&&p.faction==='press'&&t.tactic==='press')s.atk+=2*p.level;
  if(active&&p.faction==='legacy'&&p.level>=3){s.atk+=3;s.def+=3;}
 }
 let b=buffs(t);s.atk+=b.atk;s.def+=b.def;s.mid+=b.mid;
 if(t.coach==='legacy')s.atk+=4;
 if(t.coach==='control')s.mid+=7;
 if(t.coach==='press')s.atk+=7;
 if(t.coach==='wall')s.def+=9;
 if(t.coach==='star')s.atk+=7;
 if(t.coach==='academy')s.mid+=4;
 const tl=t.talents||[];if(tl.includes('striker'))s.atk+=14;if(tl.includes('wall'))s.def+=14;if(tl.includes('brain'))s.mid+=14;if(tl.includes('momentum')){s.atk+=7;s.def+=7;}
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
 if(ga>gb){a.win++;b.loss++;b.hp=Math.max(0,b.hp-(4+2*(ga-gb)));a.cash+=2;}
 else if(gb>ga){b.win++;a.loss++;a.hp=Math.max(0,a.hp-(4+2*(gb-ga)));b.cash+=2;}
 else {a.draw++;b.draw++;a.cash++;b.cash++;}
 return {a:a.id,b:b.id,ga,gb};
}
function income(t){t.cash=clamp(t.cash+8+Math.min(3,Math.floor(t.cash/12))+(t.talents?.includes('budget')?3:0),0,999);}
function aiTurn(t){
 if(t.hp<=0)return;
 const target=clamp(4+Math.floor(state.round/2),5,7);
 for(const role of ['F','M','D','M','F','D']){
  if(t.lineup.length>=target)break;
  if(countRole(t,role)>=LIMIT[role])continue;
  const near=t.lineup.reduce((m,p)=>(m[p.faction]=(m[p.faction]||0)+1,m),{});
  const candidates=POOL.filter(p=>p.role===role&&p.tier<=maxTier()&&cardCost(p)<=t.cash)
    .sort((a,b)=>(near[b.faction]||0)-(near[a.faction]||0)||(b.tier-a.tier));
  if(!candidates.length)continue;
  const p=candidates[rnd(Math.min(5,candidates.length))];t.cash-=cardCost(p);
  t.lineup.push({uid:seq++,name:p.name,role:p.role,faction:p.faction,tier:p.tier,level:1});
 }
 let options=t.lineup.filter(p=>p.level<5&&trainCost(p,t)<=t.cash).sort((a,b)=>b.tier-a.tier);
 for(let n=0;n<(state.round>10?1:state.round%2===0?1:0)&&options.length;n++){
  let p=options.find(x=>trainCost(x,t)<=t.cash);
  if(!p)break;t.cash-=trainCost(p,t);p.level++;
 }
 t.tactic=['balance','press','counter','control'][(t.id+Math.floor(state.round/4))%4];
}

function doBattle(){
 if(!state||state.winner!==null)return;
 const t=player();if(t.lineup.length<3){state.message='至少3名上阵球员才能开赛。';render();return;}
 if(state.talentOffers&&state.talentOffers.length){state.message='你已获得阶段天赋机会，请先从三张天赋牌中选择一张。';render();return;}
 state.phase='battle';state.results=[];
 state.teams.slice(1).forEach(aiTurn);
 const alive=shuffle(state.teams.filter(x=>x.hp>0));
 if(alive.length%2===1){const ghost=alive.pop();ghost.cash+=2;log(ghost.name+' 轮空，获2枚转会币');}
 const scoreBefore=power(t);
 for(let i=0;i<alive.length;i+=2)state.results.push(match(alive[i],alive[i+1]));
 const own=state.results.find(x=>x.a===0||x.b===0);
 const growth=state.teams.map(team=>({team:team.id,notes:team.hp>0?turnGrowth(team):[]}));
 let ownSummary='';
 if(own){
  const other=state.teams[own.a===0?own.b:own.a],me=own.a===0?own.ga:own.gb,them=own.a===0?own.gb:own.ga;
  const theirPower=power(other);
  state.message='第'+state.round+'轮：'+t.name+' '+me+' : '+them+' '+other.name+(me>them?' · 获胜！':me<them?' · 遗憾落败':' · 战平');
  ownSummary=me>them?'获得胜利奖励+2转会币':me<them?'本轮失去俱乐部声望':'平局结束，获得1枚额外转会币';
  state.battleReport={home:t.name,away:other.name,homeGoals:me,awayGoals:them,our:scoreBefore,their:theirPower,synergies:scoreBefore.buff.active.map(f=>f.name+'('+f.n+'人)'),bonus:growth[0].notes,summary:ownSummary};
  log(state.message);
 }else{
  state.message='本轮轮空，获得2枚转会币。';log(state.message);
  state.battleReport={home:t.name,away:'轮空',homeGoals:'—',awayGoals:'—',our:scoreBefore,their:{atk:0,def:0,mid:0},synergies:scoreBefore.buff.active.map(f=>f.name+'('+f.n+'人)'),bonus:growth[0].notes,summary:'本轮免战'};
 }
 state.teams.forEach(x=>{income(x);x.temp={atk:0,def:0,mid:0,comeback:false};});
 const living=state.teams.filter(x=>x.hp>0);
 if(t.hp<=0||living.length<=1||state.round>=18){
  const top=ranked()[0];state.winner=top.id;state.phase='done';
  state.message=(top.id===0?'恭喜夺冠！':'赛季结束。冠军：'+top.name)+' 查看最终排行榜。';log(state.message);
 }else{
  state.round++;state.phase='shop';state.eventUsed=false;
  if(!state.shopFrozen)state.shop=makeShop();
  state.events=shuffle(EVENTS.map(x=>x.id)).slice(0,2);
  state.talentOffers=state.round%4===0?shuffle(TALENTS.filter(x=>!t.talents.includes(x.id)).map(x=>x.id)).slice(0,3):[];
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
 }else if(type==='talent'){if(!state.talentOffers?.includes(arg))return;t.talents.push(arg);state.talentOffers=[];let card=TALENTS.find(x=>x.id===arg);state.message='解锁永久天赋「'+card.name+'」！'+card.desc;log('选中天赋 '+card.name);
 }else if(type==='tactic'){if(!['balance','press','control','counter'].includes(arg))return;t.tactic=arg;state.message='战术已切换。';
 }
 save();render();
}
function cardSkill(p){
 const f=p.faction;
 if(f==='academy')return {name:'潜力觉醒',effect:'到Lv.3时，为全队贡献额外组织'};
 if(f==='star')return {name:'巨星连携',effect:p.role==='F'?'与另一位巨星同队，终结能力随等级提升':'有巨星搭档时，协助中场组织'};
 if(f==='wall')return {name:'防线支点',effect:'有防守流队友时，随等级强化拦截'};
 if(f==='control')return {name:'连续传递',effect:'激活传控后，强化中场；控球战术更强'};
 if(f==='press')return {name:'前场压迫',effect:'激活压迫并使用高位逼抢，强化进攻'};
 return {name:'王牌传承',effect:'达到Lv.3时，额外增强球队攻防'};
}
function art(p){
 const r=p.role;
 return '<div class="wx-art wx-art-'+r+'" aria-hidden="true"><svg viewBox="0 0 80 88" class="wx-jersey"><path d="M24 9L33 3H47L56 9L73 22L64 41L56 36V81H24V36L16 41L7 22Z" fill="currentColor" opacity=".84" stroke="white" stroke-width="1.5"/><path d="M33 3Q40 23 47 3" fill="none" stroke="#e9e1b7" stroke-width="3"/><path d="M31 29L49 29" stroke="#ffffff" opacity=".35"/><text x="40" y="57" fill="#fff" font-size="23" text-anchor="middle" font-weight="800">'+((p.uid*7)%89+10)+'</text></svg><span class="wx-avatar-label">'+ROLE[r]+'</span></div>';
}
function playerHTML(p,inBench){
 const f=FACTIONS.find(x=>x.id===p.faction),t=player(),c=trainCost(p,t),editable=state.winner===null;
 const n=factionCount(t,p.faction),next=n>=4?'完整体系':n>=2?'距强化差'+(4-n)+'人':'距解锁差'+(2-n)+'人';
 return '<div class="wx-card" style="--f:'+f.color+'"><div class="wx-card-head"><span class="wx-rarity">◆ '+p.tier+'阶球员</span><span>'+ROLE[p.role]+'</span></div>'+
 art(p)+'<strong title="'+esc(p.name)+'">'+esc(p.name)+'</strong><small class="wx-card-affinity">'+f.icon+' '+f.name+' <em>'+next+'</em></small><div class="wx-card-skill"><b>'+cardSkill(p).name+'</b><small>'+cardSkill(p).effect+'</small></div>'+
 '<div class="wx-levelline"><b>Lv.'+p.level+'</b><span>'+('●'.repeat(p.level)+'○'.repeat(5-p.level))+'</span></div>'+
 (editable?'<div class="wx-card-actions"><button data-act="toggle" data-id="'+p.uid+'">'+(inBench?'↑ 上阵':'↓ 替补')+'</button><button data-act="train" data-id="'+p.uid+'" '+(p.level>=5||t.cash<c?'disabled':'')+'>＋训练 '+(p.level>=5?'满级':c+'币')+'</button><button data-act="sell" data-id="'+p.uid+'">出售</button></div>':'')+'</div>';
}
function factionDetail(t,id){
 const f=FACTIONS.find(x=>x.id===id)||FACTIONS[0],n=factionCount(t,f.id),r=t.resources||{};
 const step=n>=4?'已完成进阶联动':n>=2?'基础联动已激活':'基础联动尚未激活';
 const resName={academy:'青训进度',star:'星光热度',wall:'钢铁壁垒',control:'传控节奏',press:'高位抢断',legacy:'传承回合'}[f.id];
 const amount=r[f.id]||0,goal=f.id==='academy'?2:f.id==='wall'?6:f.id==='star'||f.id==='control'?4:f.id==='legacy'?3:3;
 return '<div class="wx-detail-title" style="--f:'+f.color+'"><span>'+f.icon+'</span><div><b>'+f.name+'</b><small>'+f.short+' · 当前'+n+'人 · '+step+'</small></div></div>'+
 '<div class="wx-milestone '+(n>=2?'unlocked':'')+'"><b>① 基础联动 · 需要2人 '+(n>=2?'✓ 已激活':'🔒')+'</b><p>'+f.base+'</p></div>'+
 '<div class="wx-milestone '+(n>=4?'unlocked':'')+'"><b>② 强化联动 · 需要4人 '+(n>=4?'✓ 已激活':'🔒')+'</b><p>'+f.boost+'</p></div>'+
 '<p class="wx-guide-tip">玩法建议：'+f.guide+'</p>'+
 (n>=2?'<div class="wx-growth">专属成长资源 · '+resName+' <strong>'+amount+'/'+goal+'</strong></div>':'');
}
function objective(t){
 const n=bestFaction(t),f=FACTIONS.find(x=>x.id===n.id),openRoles=['G','D','M','F'].filter(role=>countRole(t,role)<LIMIT[role]);
 if(t.lineup.length<6&&openRoles.length){return {heading:'先补齐阵容：'+ROLE[openRoles[0]]+'位置还有空位',desc:'先扩大上场人数，比单纯提升一名球员等级更划算。',id:n.id};}
 if(n.n<2)return {heading:'距离解锁「'+f.name+'」仅差 '+(2-n.n)+' 人',desc:f.base+'｜优先选择同流派且能上阵的球员。',id:n.id};
 if(n.n<4)return {heading:'已开启 '+f.name+'！继续凑到4人可进阶',desc:'当前'+n.n+'/4人。'+f.boost,id:n.id};
 return {heading:f.name+' 已完全激活！培养核心球员',desc:'优先升级高阶球员、调整战术，对抗其他五支球队。',id:n.id};
}
function render(){
 if(!state){ROOT.querySelector('#wx-setup').hidden=false;ROOT.querySelector('#wx-game').hidden=true;return;}
 ROOT.querySelector('#wx-setup').hidden=true;ROOT.querySelector('#wx-game').hidden=false;
 const t=player(),pow=power(t),res=state.results,done=state.winner!==null,rank=ranked(),target=objective(t);
 const el=id=>document.getElementById(id);
 el('wx-headline').textContent='第 '+state.round+' 回合'+(done?' · 赛季结算':' / 经营备战');
 el('wx-round-bar').style.width=Math.min(100,Math.max(4,state.round/18*100))+'%';
 el('wx-credits').textContent=t.cash+' 转会币';
 el('wx-hp').textContent=t.hp+' / 80';
 el('wx-rank').textContent=(rank.findIndex(x=>x.id===0)+1)+' / 6';
 el('wx-current').textContent=state.message;
 el('wx-powers').textContent=pow.atk+' / '+pow.def+' / '+pow.mid;
 el('wx-objective').textContent=target.heading;
 el('wx-objective-note').textContent=target.desc;
 const suggestion=state.shop.find(x=>x.faction===target.id);
 el('wx-suggest-card').innerHTML=suggestion?'<small>本轮可选</small><strong>'+esc(suggestion.name)+'</strong><span> '+FACTIONS.find(f=>f.id===target.id).name+' · '+ROLE[suggestion.role]+'</span>':'<small>推荐操作</small><strong>刷新商店 / 训练核心</strong><span>寻找 '+FACTIONS.find(f=>f.id===target.id).name+' 球员</span>';
 el('wx-scoreboard').innerHTML=rank.map((x,i)=>'<button type="button" class="wx-standing '+(x.id===selected?'on ':'')+(x.hp===0?'eliminated':'')+'" data-act="scout" data-id="'+x.id+'"><span class="wx-rank-pos">'+(i+1)+'</span><span class="wx-rank-name">'+esc(x.name)+(x.id===0?' <i>你</i>':'')+'</span><b>'+x.hp+' ♥</b><small>'+x.win+'胜 '+x.draw+'平 '+x.loss+'负</small></button>').join('');
 const scout=state.teams[selected]||t,sp=power(scout),sc=COACHES.find(c=>c.id===scout.coach)||COACHES[0];
 el('wx-scout').innerHTML='<b>🔍 '+esc(scout.name)+'</b><small>｜'+sc.name+'：'+sc.skill+'</small>'+
 '<p>进攻 '+sp.atk+' · 防守 '+sp.def+' · 控球 '+sp.mid+' · 上阵 '+scout.lineup.length+'/7人</p>'+
 '<div class="wx-tags">'+(sp.buff.active.map(f=>'<span>'+esc(f.name)+' '+f.n+'人</span>').join('')||'<span>暂无激活羁绊</span>')+'</div>';
 el('wx-lineup-count').textContent=t.lineup.length+' / 7 位球员';
 el('wx-pitch').innerHTML=['F','M','D','G'].map(role=>'<div class="wx-line"><span class="wx-position">'+ROLE[role]+'</span>'+
 Array.from({length:LIMIT[role]},(_,slot)=>{const p=t.lineup.filter(x=>x.role===role)[slot];
 const f=p?FACTIONS.find(x=>x.id===p.faction):null;
 return p?'<div class="wx-token" style="--f:'+f.color+'"><span class="wx-token-icon">'+f.icon+'</span><b>'+esc(p.name)+'</b><small>Lv.'+p.level+' · '+p.tier+'阶</small></div>':'<div class="wx-slot">空位</div>';}).join('')+'</div>').join('');
 const focus=state.focus||target.id;
 el('wx-factions').innerHTML=FACTIONS.map(f=>{
  const n=factionCount(t,f.id),unlocked=n>=2,progress=n>=4?100:n/4*100,remaining=n>=4?'满级':n>=2?'再'+(4-n)+'人进阶':'差'+(2-n)+'人激活';
  return '<button type="button" data-act="focus" data-id="'+f.id+'" class="wx-faction-tile '+(unlocked?'is-on ':'')+(focus===f.id?'is-picked':'')+'" style="--f:'+f.color+'">'+
  '<span class="wx-faction-icon">'+f.icon+'</span><span class="wx-faction-copy"><b>'+f.name+'</b><small>'+f.short+' · '+remaining+'</small></span>'+
  '<span class="wx-faction-count">'+n+'/4</span><span class="wx-faction-meter"><i style="width:'+progress+'%"></i></span></button>';
 }).join('');
 el('wx-faction-detail').innerHTML=factionDetail(t,focus);
 el('wx-lineup').innerHTML=t.lineup.length?t.lineup.map(p=>playerHTML(p,false)).join(''):'<p class="wx-muted">暂无上阵球员</p>';
 el('wx-lineup-hint').textContent=t.lineup.length<7?'当前共'+t.lineup.length+'/7人；补足空位能大幅提高战力。':'阵容已满。购买新球员会先进入替补席，可在球员卡上进行轮换。';
 el('wx-bench').innerHTML=t.bench.length?t.bench.map(p=>playerHTML(p,true)).join(''):'<p class="wx-muted">替补席空着。签下位置已满的球员会进入这里。</p>';
 const counts={};t.lineup.forEach(p=>counts[p.faction]=(counts[p.faction]||0)+1);
 el('wx-market').innerHTML=state.shop.length?state.shop.map((p,i)=>{
  const f=FACTIONS.find(x=>x.id===p.faction),c=cardCost(p),n=counts[p.faction]||0;
  const fits=countRole(t,p.role)<LIMIT[p.role],recommended=p.faction===target.id,trigger=n===1&&fits;
  let benefit=trigger?'⚡ 买下就能激活羁绊':n>=2&&n<4&&fits?'进阶组合 '+(n+1)+'/4':recommended?'★ 当前推荐阵营':fits?'补充'+ROLE[p.role]+'空位':'将进入替补席';
  return '<div class="wx-buy '+(trigger?'combo-ready ':recommended?'recommended':'')+'" style="--f:'+f.color+'">'+
  '<div class="wx-buy-meta"><span>◆ '+p.tier+'阶</span><span>'+ROLE[p.role]+'</span></div>'+art(p)+
  '<b class="wx-buy-name" title="'+esc(p.name)+'">'+esc(p.name)+'</b><small>'+f.icon+' '+f.name+'</small>'+
  '<div class="wx-buy-benefit">'+benefit+'</div><div class="wx-buy-skill"><b>'+cardSkill(p).name+'</b><small>'+cardSkill(p).effect+'</small></div>'+
  '<button type="button" data-act="buy" data-id="'+i+'" '+(t.cash<c||done||(!fits&&t.bench.length>=8)?'disabled':'')+'><span>签约球员</span><b>'+c+' 币</b></button></div>';
 }).join(''):'<p class="wx-muted">市场已售罄，可以点击重新搜卡。</p>';
 el('wx-market-tip').textContent='✨ 金边提示：买下后立即激活羁绊的球员将优先高亮。看准位置和流派再签约。';
 el('wx-events').innerHTML=state.events.map((id,i)=>{const e=EVENTS.find(x=>x.id===id),icons={fund:'◆',train:'★',guard:'⬡',pass:'➚',mid:'∞',scout:'◎',heal:'♥',break:'⚡'};
 return '<button type="button" class="wx-event-card" data-act="event" data-id="'+e.id+'" '+(state.eventUsed||done?'disabled':'')+'>'+
 '<span class="wx-event-glyph">'+(icons[id]||'✦')+'</span><b>'+e.name+'</b><small>'+e.desc+'</small><em>效果牌 '+(i+1)+'</em></button>';}).join('');
 const choices=state.talentOffers||[];
 el('wx-talent-panel').hidden=!choices.length;
 el('wx-talents').innerHTML=choices.map(id=>{const card=TALENTS.find(x=>x.id===id);return '<button type="button" data-act="talent" data-id="'+id+'" class="wx-talent-card"><span>'+card.icon+'</span><b>'+card.name+'</b><small>'+card.desc+'</small><em>永久天赋</em></button>';}).join('');
 const ownTalents=t.talents||[];el('wx-current-talents').hidden=!ownTalents.length;
 el('wx-current-talents').innerHTML='<b>已获得的永久天赋</b> '+ownTalents.map(id=>{const card=TALENTS.find(x=>x.id===id);return '<span>'+card.icon+' '+card.name+'</span>';}).join('');
 el('wx-event-note').textContent=state.eventUsed?'✓ 本回合效果牌已使用；下回合可再次选择。':'提示：本回合二选一，强化后再开始交锋。';
 const tactic=ROOT.querySelector('#wx-tactic');tactic.value=t.tactic;tactic.disabled=done;
 ROOT.querySelector('#wx-fight').disabled=done;ROOT.querySelector('#wx-fight').textContent=choices.length?'★ 先选择一张天赋牌，再开始比赛':'⚔ 阵容已就绪 · 开始交锋 →';ROOT.querySelector('#wx-refresh').disabled=done||t.cash<2;ROOT.querySelector('#wx-freeze').disabled=done;
 ROOT.querySelector('#wx-freeze').textContent=state.shopFrozen?'🔒 商店已锁定 · 点击解锁':'○ 锁定商店';
 el('wx-last-results').innerHTML=res.length?res.map(m=>'<div><span>'+esc(state.teams[m.a].name)+'</span><b>'+m.ga+' : '+m.gb+'</b><span>'+esc(state.teams[m.b].name)+'</span></div>').join(''):'<p class="wx-muted">比赛尚未开始，先安排你的第一套阵容。</p>';
 const br=state.battleReport;
 el('wx-battle-report').innerHTML=br?'<div class="wx-recap-score"><span>'+esc(br.home)+'</span><b>'+br.homeGoals+' : '+br.awayGoals+'</b><span>'+esc(br.away)+'</span></div>'+
 '<p class="wx-recap-tip">⚔ '+esc(br.summary)+' · 本队赛前进攻 '+br.our.atk+' / 防守 '+br.our.def+' / 组织 '+br.our.mid+'</p>'+
 '<p class="wx-recap-tip">触发联动：'+(br.synergies.length?esc(br.synergies.join('、')):'暂无，尝试凑出2人组合')+'</p>'+
 (br.bonus.length?'<div class="wx-bonus-list">'+br.bonus.map(b=>'<span>'+esc(b)+'</span>').join('')+'</div>':''):'<p class="wx-muted">下一场结束后，将显示比分、触发的羁绊和球员成长收益。</p>';
 el('wx-history').innerHTML=state.history.length?state.history.slice(0,8).map(x=>'<p>'+esc(x)+'</p>').join(''):'<p class="wx-muted">暂无比赛记录。</p>';
 el('wx-finish').hidden=!done;
 if(done){const winner=state.teams[state.winner];el('wx-finish').textContent=(state.winner===0?'🏆 你夺得万象冠军杯！':'🏆 冠军：'+winner.name+'；你获得第'+(rank.findIndex(x=>x.id===0)+1)+'名')+'。可以重新开始一局。';}
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
  if(type==='focus'){state.focus=arg;save();render();return;}
  if(type==='fight'){doBattle();return;}
  if(state.winner!==null)return;
  if(['buy','refresh','freeze','train','sell','toggle','event','talent','tactic'].includes(type))action(type,arg);
 });
 ROOT.querySelector('#wx-tactic').addEventListener('change',ev=>{if(state&&state.winner===null)action('tactic',ev.target.value);});
 const coachPicker=ROOT.querySelector('#wx-coach'),tip=ROOT.querySelector('#wx-coach-tip');
 const updateCoachTip=()=>{
  const c=COACHES.find(x=>x.id===coachPicker.value)||COACHES[0];
  const f=FACTIONS.find(x=>x.id===c.id)||FACTIONS[0];
  tip.textContent=c.name+' · '+c.skill+'：'+c.detail+' 推荐玩法：'+f.guide;
 };
 coachPicker.addEventListener('change',updateCoachTip);updateCoachTip();
 render();
}
init();
})();
