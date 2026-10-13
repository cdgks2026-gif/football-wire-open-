(() => {
"use strict";
const root = document.getElementById("footballApp");
if (!root || root.dataset.ready) return;
root.dataset.ready = "1";
const $ = id => document.getElementById(id);
const clubInfo = [
  {name:"曼联",short:"MU",color:"#b72636",power:80,budget:25800},
  {name:"曼城",short:"MC",color:"#519cc6",power:86,budget:31000},
  {name:"阿森纳",short:"ARS",color:"#c43544",power:85,budget:28500},
  {name:"利物浦",short:"LIV",color:"#b82e3d",power:84,budget:26500},
  {name:"切尔西",short:"CHE",color:"#3166b5",power:81,budget:26000},
  {name:"热刺",short:"TOT",color:"#394862",power:79,budget:23000},
  {name:"纽卡斯尔",short:"NEW",color:"#536270",power:80,budget:23500},
  {name:"阿斯顿维拉",short:"AVL",color:"#8c4b6c",power:79,budget:22000}
];
const firstNames = ["亚历克斯","卢卡","马特奥","奥利弗","尼科","埃里克","莱昂","艾登","加布里埃尔","罗曼","丹尼尔","马尔科","塞巴斯蒂安","迭戈","伊萨克","约书亚","本杰明","阿德里安","费利克斯","诺亚","维克托","埃米尔","米格尔","拉斐尔"];
const lastNames = ["罗梅罗","加西亚","威尔逊","杜兰特","席尔瓦","穆勒","佩雷拉","奥尔森","莱曼","布鲁克斯","科斯塔","马丁内斯","诺瓦克","费雷拉","桑托斯","伊万诺夫","阿尔瓦罗","莫雷诺","霍尔","麦肯齐","罗西","戈麦斯","沃克","巴雷拉"];
const byPos = {G:"门将",D:"后卫",M:"中场",F:"前锋"};
const patterns = {"4-3-3":{G:1,D:4,M:3,F:3},"4-2-3-1":{G:1,D:4,M:5,F:1},"4-4-2":{G:1,D:4,M:4,F:2}};
const STORAGE = "chengdu_football_dynasty_v1";
let state = null, currentView = "dashboard", toastTimer = null;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => value >= 10000 ? "¥"+(value/10000).toFixed(2)+"亿" : "¥"+Math.round(value).toLocaleString("zh-CN")+"万";
const badge = id => '<span class="clublogo club-'+id+'">'+clubInfo[id].short+'</span>';
const drawName = i => firstNames[(i*7+3)%firstNames.length]+"·"+lastNames[(i*11+5)%lastNames.length];
function newPlayer(pos,power,index) {
  const id = state.nextId++;
  const age=rnd(17,33), ability=clamp(power+rnd(-9,8),56,96), potential=clamp(ability+rnd(0,15),ability,98);
  return {id,name:drawName(index+id),pos,age,ability,potential,fitness:rnd(78,100),form:rnd(67,93),price:Math.round((ability-52)*(ability-52)*2.4+rnd(150,800)),played:0};
}
function fixtures() {
  let order=clubInfo.map((_,i)=>i), first=[];
  for(let r=0;r<7;r++){
    const games=[];
    for(let i=0;i<4;i++){let a=order[i],b=order[7-i];games.push(r%2?{home:b,away:a}:{home:a,away:b});}
    first.push(games);
    order=[order[0],order[7],...order.slice(1,7)];
  }
  return first.concat(first.map(games=>games.map(g=>({home:g.away,away:g.home}))));
}
function emptyStandings(){return clubInfo.map((_,id)=>({id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));}
function start(id){
  state={clubId:id,year:2026,season:1,round:0,nextId:1,budget:clubInfo[id].budget,squads:[],market:[],table:emptyStandings(),fixtures:fixtures(),results:[],news:[],lastResult:"",titles:0,tactics:{formation:"4-3-3",style:"balance",training:"fitness"},lineup:[],moods:clubInfo.map(()=>rnd(66,85))};
  clubInfo.forEach(c=>{
    const slots=["G","G","D","D","D","D","D","D","M","M","M","M","M","F","F","F"];
    state.squads.push(slots.map((pos,i)=>newPlayer(pos,c.power,i+c.short.length*13)));
  });
  fillMarket();
  state.lineup=bestXI(id,state.tactics.formation).map(p=>p.id);
  news("欢迎执教"+clubInfo[id].name+"！董事会为你准备了"+money(state.budget)+"转会预算。");
  save();currentView="dashboard";render();
}
function fillMarket(){
  const slots=["G","D","M","F","M","F","D","M","F","G","D","F","M","D","F","M","D","F"];
  state.market=slots.map((pos,i)=>newPlayer(pos,rnd(73,87),1000+i));
}
function bestXI(team,formation) {
  const plan=patterns[formation]||patterns["4-3-3"];
  const list=state.squads[team], lineup=[];
  for(const pos of ["G","D","M","F"]) {
    const sorted=list.filter(p=>p.pos===pos).sort((a,b)=>scorePlayer(b)-scorePlayer(a));
    lineup.push(...sorted.slice(0,plan[pos]));
  }
  return lineup;
}
function scorePlayer(p){return p.ability*.68+p.form*.17+p.fitness*.15;}
function userXI(){
  const list=state.squads[state.clubId];
  const existing=state.lineup.map(id=>list.find(p=>p.id===id)).filter(Boolean);
  const required=patterns[state.tactics.formation],counts={G:0,D:0,M:0,F:0};
  existing.forEach(p=>counts[p.pos]++);
  if(existing.length!==11 || Object.keys(required).some(pos=>counts[pos]!==required[pos])){
    state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
  }
  return state.lineup.map(id=>list.find(p=>p.id===id)).filter(Boolean);
}
function standings(){return [...state.table].sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.id-b.id);}
function rank(){return standings().findIndex(row=>row.id===state.clubId)+1;}
function nextFixture(){if(state.round>=state.fixtures.length)return null;return state.fixtures[state.round].find(g=>g.home===state.clubId||g.away===state.clubId);}
function news(text){state.news.unshift({round:state.round,season:state.season,text});state.news=state.news.slice(0,24);}
function save(){if(!state)return;try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch(error){/* private mode: the game remains playable */}}
function load(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE)||"null");if(parsed&&Number.isInteger(parsed.clubId)&&parsed.clubId>=0&&parsed.clubId<8&&Array.isArray(parsed.squads)&&parsed.squads.length===8&&Array.isArray(parsed.fixtures)&&parsed.tactics&&Array.isArray(parsed.market))state=parsed;}catch(error){state=null;}}
function goalDraw(lambda){
  const limit=Math.exp(-clamp(lambda,.15,4)),u=Math.random();let product=1,k=0;
  while(product>limit&&k<7){product*=Math.random();k++;}
  return clamp(k-1,0,6);
}
function strength(id,kind){
  const xi=id===state.clubId?userXI():bestXI(id,"4-3-3");
  const subset=kind==="attack"?xi.filter(p=>p.pos==="F"||p.pos==="M"):xi.filter(p=>p.pos==="D"||p.pos==="G");
  return subset.reduce((sum,p)=>sum+p.ability*.7+p.form*.15+p.fitness*.15,0)/Math.max(1,subset.length)+state.moods[id]*.06;
}
function styleFactor(id){if(id!==state.clubId)return {atk:0,def:0};const s=state.tactics.style;return s==="press"?{atk:7,def:-3}:s==="control"?{atk:4,def:2}:s==="counter"?{atk:1,def:4}:{atk:0,def:0};}
function resultFor(game){
  const h=styleFactor(game.home),a=styleFactor(game.away);
  const homeAtk=strength(game.home,"attack")+h.atk,awayAtk=strength(game.away,"attack")+a.atk;
  const homeDef=strength(game.home,"defense")+h.def,awayDef=strength(game.away,"defense")+a.def;
  const homeLambda=clamp(1.38+(homeAtk-awayDef)*.055+.20,.22,3.6);
  const awayLambda=clamp(1.28+(awayAtk-homeDef)*.055,.22,3.6);
  return {home:game.home,away:game.away,hg:goalDraw(homeLambda),ag:goalDraw(awayLambda),round:state.round+1};
}
function applyResult(result){
  const h=state.table[result.home],a=state.table[result.away];
  h.p++;a.p++;h.gf+=result.hg;h.ga+=result.ag;a.gf+=result.ag;a.ga+=result.hg;
  if(result.hg>result.ag){h.w++;h.pts+=3;a.l++;state.moods[result.home]=clamp(state.moods[result.home]+3,40,98);state.moods[result.away]=clamp(state.moods[result.away]-2,40,98);}
  else if(result.hg<result.ag){a.w++;a.pts+=3;h.l++;state.moods[result.away]=clamp(state.moods[result.away]+3,40,98);state.moods[result.home]=clamp(state.moods[result.home]-2,40,98);}
  else{h.d++;a.d++;h.pts++;a.pts++;}
}
function fatigue(){
  state.squads.forEach((squad,id)=>{
    const chosen=(id===state.clubId?userXI():bestXI(id,"4-3-3")).map(p=>p.id);
    squad.forEach(p=>{
      p.fitness=clamp(p.fitness+rnd(7,12),34,100);
      if(chosen.includes(p.id)){
        const heavy=id===state.clubId&&state.tactics.style==="press";
        p.fitness=clamp(p.fitness-rnd(11,heavy?22:17),32,100);
        p.form=clamp(p.form+rnd(-3,4),49,100);
        p.played++;
        if(p.age<=24&&p.ability<p.potential&&p.played%5===0&&Math.random()<.35)p.ability++;
      } else p.form=clamp(p.form+rnd(-2,2),48,100);
    });
  });
  const focus=state.tactics.training;
  state.squads[state.clubId].forEach(p=>{
    if(focus==="fitness")p.fitness=clamp(p.fitness+5,32,100);
    else if((focus==="attack"&&(p.pos==="F"||p.pos==="M"))||(focus==="defense"&&(p.pos==="D"||p.pos==="G")))p.form=clamp(p.form+2,45,100);
  });
}
function aiTransfer(){
  if(state.market.length===0)return;
  const teams=clubInfo.map((_,i)=>i).filter(id=>id!==state.clubId);
  const id=teams[rnd(0,teams.length-1)];
  const options=state.market.filter(p=>!state.squads[id].some(x=>x.id===p.id));
  if(!options.length||state.squads[id].length>=23)return;
  options.sort((a,b)=>scorePlayer(b)-scorePlayer(a));
  const p=options[rnd(0,Math.min(4,options.length-1))];
  state.squads[id].push(p);
  state.market=state.market.filter(x=>x.id!==p.id);
  news(clubInfo[id].name+"自动完成签约："+p.name+"（"+byPos[p.pos]+"，"+p.ability+"能力）。");
}
function simulateOne(){
  if(state.round>=14)return;
  const games=state.fixtures[state.round];
  const output=games.map(resultFor);
  output.forEach(applyResult);
  state.results.push(...output);
  const mine=output.find(r=>r.home===state.clubId||r.away===state.clubId);
  state.lastResult=clubInfo[mine.home].name+" "+mine.hg+" : "+mine.ag+" "+clubInfo[mine.away].name;
  state.round++;
  fatigue();
  news("第"+state.round+"轮 "+state.lastResult+"。当前排名第"+rank()+"。");
  if(state.round%3===0)aiTransfer();
  if(state.round===14){const champion=standings()[0].id;if(champion===state.clubId)state.titles++;news("赛季结束！"+clubInfo[champion].name+"夺得冠军。你最终排名第"+rank()+"。");}
}
function advance(amount){
  if(state.round>=14){newSeason();render();return;}
  let n=Math.min(Math.max(1,amount),14-state.round);
  for(let i=0;i<n;i++)simulateOne();
  save();render();show("已完成"+n+"轮模拟，当前排名第"+rank()+"。");
}
function newSeason(){
  const finish=rank();
  state.year++;state.season++;state.round=0;state.table=emptyStandings();state.results=[];state.fixtures=fixtures();
  state.budget+=8000+(9-finish)*1000;state.lastResult="";
  state.squads.forEach(team=>team.forEach(p=>{p.age++;p.fitness=100;p.form=rnd(72,92);p.played=0;if(p.age>31&&Math.random()<.45)p.ability=clamp(p.ability-1,45,99);else if(p.age<25&&p.ability<p.potential&&Math.random()<.55)p.ability++;}));
  fillMarket();state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
  news("新赛季开启！董事会提供了"+money(state.budget)+"转会资金。");save();
}
function buy(id){
  const i=state.market.findIndex(p=>p.id===id);
  if(i<0)return;
  const p=state.market[i],squad=state.squads[state.clubId];
  if(squad.length>=23)return show("一线队已满 23 人，请先出售球员。");
  if(state.budget<p.price)return show("转会预算不足。");
  state.budget-=p.price;squad.push(p);state.market.splice(i,1);news("转会完成："+p.name+"加盟"+clubInfo[state.clubId].name+"，转会费"+money(p.price)+"。");
  save();render();show("签约成功："+p.name);
}
function sell(id){
  const squad=state.squads[state.clubId],index=squad.findIndex(p=>p.id===id);
  if(index<0)return;
  if(squad.length<=13)return show("一线队至少保留 13 名球员。");
  const p=squad[index];
  const min=patterns[state.tactics.formation][p.pos];
  if(squad.filter(x=>x.pos===p.pos).length<=min)return show("出售后该位置人数不足，无法完成转会。");
  squad.splice(index,1);const price=Math.round(p.price*.78);state.budget+=price;state.market.push(p);
  state.lineup=bestXI(state.clubId,state.tactics.formation).map(x=>x.id);
  news(p.name+"正式离队，俱乐部收回"+money(price)+"转会资金。");save();render();show("出售成功，资金已入账。");
}
function swap(id){
  const squad=state.squads[state.clubId],p=squad.find(x=>x.id===id);
  if(!p||state.lineup.includes(id))return;
  const starters=userXI().filter(x=>x.pos===p.pos).sort((a,b)=>scorePlayer(a)-scorePlayer(b));
  if(!starters.length)return show("此阵型不需要该位置。");
  state.lineup=state.lineup.map(x=>x===starters[0].id?id:x);
  save();render();show("已换上"+p.name+"。");
}
function show(msg){const el=$("toast");el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2700);}
function nav(view){currentView=view;render();}
function tableHTML(short){
  const list=standings(),rows=(short?list.slice(0,5):list).map((t,index)=>'<tr class="'+(t.id===state.clubId?'me':'')+'"><td class="high">'+(index+1)+'</td><td><strong>'+esc(clubInfo[t.id].name)+'</strong></td><td>'+t.p+'</td><td>'+t.w+'</td><td>'+t.d+'</td><td>'+t.l+'</td><td>'+(t.gf-t.ga)+'</td><td class="high">'+t.pts+'</td></tr>').join("");
  return '<table class="data-table"><thead><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>净胜</th><th>分</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function renderSetup(){
  $("setup").hidden=!!state;$("workspace").hidden=!state;
  $("saveBtn").hidden=!state;$("resetBtn").hidden=!state;
  if(state)return;
  $("clubGrid").innerHTML=clubInfo.map((c,id)=>'<button type="button" class="clubitem" data-club="'+id+'">'+badge(id)+'<strong>'+esc(c.name)+'</strong><small>初始实力 '+c.power+' · '+money(c.budget)+'</small><span class="pick">开启执教生涯 ↗</span></button>').join("");
}
function render(){
  renderSetup();if(!state)return;
  $("statClub").textContent=clubInfo[state.clubId].name;
  $("statSeason").textContent=state.year+"/"+String((state.year+1)%100).padStart(2,"0");
  $("statRound").textContent=state.round+" / 14 轮";
  $("statBudget").textContent=money(state.budget);
  $("statRank").textContent="第 "+rank()+" 名";
  root.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===currentView));
  root.querySelectorAll(".view").forEach(v=>v.hidden=v.id!=="view-"+currentView);
  renderDashboard();renderSquad();renderTactics();renderMarket();renderLeague();
}
function renderDashboard(){
  const game=nextFixture();$("stageLabel").textContent=game?"第 "+(state.round+1)+" 轮":"赛季已结束";
  if(game){
    $("nextMatch").innerHTML='<div class="versus"><div class="team">'+badge(game.home)+'<strong>'+esc(clubInfo[game.home].name)+'</strong></div><div class="vs">VS</div><div class="team">'+badge(game.away)+'<strong>'+esc(clubInfo[game.away].name)+'</strong></div></div><p class="matchmeta">模拟联赛 · 第'+(state.round+1)+'轮 · 即将开赛</p>';
    $("playOne").textContent="▶ 模拟下一轮";$("playFive").hidden=false;$("playSeason").hidden=false;
  }else{
    $("nextMatch").innerHTML='<div class="versus"><div class="team">'+badge(standings()[0].id)+'<strong>联赛冠军</strong></div><div class="vs">🏆</div><div class="team">'+badge(state.clubId)+'<strong>第 '+rank()+' 名</strong></div></div><p class="matchmeta">赛季结束 · 可继承阵容开始新赛季</p>';
    $("playOne").textContent="开启下一赛季";$("playFive").hidden=true;$("playSeason").hidden=true;
  }
  $("lastMatch").textContent=state.lastResult?"最近一轮："+state.lastResult:"准备就绪：调整阵容与战术后即可开赛。";
  const xi=userXI(),avg=Math.round(xi.reduce((s,p)=>s+p.ability,0)/Math.max(1,xi.length)),fit=Math.round(xi.reduce((s,p)=>s+p.fitness,0)/Math.max(1,xi.length));
  const metrics=[["首发综合能力",avg],["主力体能",fit],["更衣室士气",state.moods[state.clubId]],["队伍完整度",Math.round(clamp(state.squads[state.clubId].length/23*100,0,100))]];
  $("clubMetrics").innerHTML=metrics.map(([key,val])=>'<div class="metric"><div class="metrichead"><span>'+key+'</span><strong>'+val+'</strong></div><progress class="meter" max="100" value="'+clamp(val,0,100)+'"></progress></div>').join("");
  $("miniTable").innerHTML=tableHTML(true);
  $("newsFeed").innerHTML=state.news.slice(0,6).map(n=>'<div class="feeditem"><small>S'+n.season+' / R'+n.round+'</small><span>'+esc(n.text)+'</span></div>').join("");
}
function renderSquad(){
  const squad=[...state.squads[state.clubId]].sort((a,b)=>"GDMF".indexOf(a.pos)-"GDMF".indexOf(b.pos)||b.ability-a.ability);
  $("squadCount").textContent=squad.length+" 名球员";
  $("squadTable").innerHTML='<table class="data-table"><thead><tr><th>姓名</th><th>位置</th><th>年龄</th><th>能力</th><th>潜力</th><th>状态</th><th>体能</th><th>模拟身价</th><th>操作</th></tr></thead><tbody>'+squad.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong></td><td>'+byPos[p.pos]+'</td><td>'+p.age+'</td><td class="high">'+p.ability+'</td><td>'+p.potential+'</td><td>'+p.form+'</td><td>'+p.fitness+'</td><td>'+money(p.price)+'</td><td><button type="button" class="action" data-sell="'+p.id+'">出售</button></td></tr>').join("")+'</tbody></table>';
}
function renderTactics(){
  $("formationSelect").value=state.tactics.formation;$("styleSelect").value=state.tactics.style;$("trainingSelect").value=state.tactics.training;
  $("formationBadge").textContent=state.tactics.formation;
  const lineup=userXI(),starters=new Set(lineup.map(p=>p.id)),groups={G:[],D:[],M:[],F:[]};
  lineup.forEach(p=>groups[p.pos].push(p));
  $("pitch").innerHTML='<div class="center-circle"></div>'+["F","M","D","G"].map(pos=>'<div class="pitchrow">'+groups[pos].map(p=>'<div class="pitchplayer"><div class="shirt">'+p.ability+'</div><span>'+esc(p.name.split("·").pop())+'</span></div>').join("")+'</div>').join("");
  $("lineupRoster").innerHTML='<div class="panelheading"><span>阵容轮换</span><span class="tag">首发 11 人</span></div>'+state.squads[state.clubId].map(p=>'<div class="rosterline"><span>'+esc(p.name)+' <small>'+byPos[p.pos]+' '+p.ability+'</small></span>'+(starters.has(p.id)?'<small>首发</small>':'<button type="button" data-swap="'+p.id+'">替换上场</button>')+'</div>').join("");
}
function renderMarket(){
  $("marketBudget").textContent="可用预算 "+money(state.budget);
  $("marketList").innerHTML=state.market.length?state.market.map(p=>'<article class="marketcard"><div class="badge">'+byPos[p.pos]+' · '+p.age+' 岁 · 潜力 '+p.potential+'</div><h3>'+esc(p.name)+'</h3><p>能力 '+p.ability+' · 状态 '+p.form+' · 体能 '+p.fitness+'</p><div class="value">'+money(p.price)+'</div><button type="button" class="primary" data-sign="'+p.id+'" '+(state.budget<p.price?'disabled title="预算不足"':'')+'>签约球员</button></article>').join(""):'<div class="panel">当前市场球员已被签约，请进入下一赛季刷新。</div>';
}
function renderLeague(){
  $("leagueRound").textContent="已进行 "+state.round+" / 14 轮";$("fullTable").innerHTML=tableHTML(false);
  $("fixtureList").innerHTML=state.fixtures.map((games,index)=>'<div class="fixture-round"><strong>第 '+(index+1)+' 轮 '+(index===state.round?'· 下一轮':'')+'</strong>'+games.map(g=>{
    const r=state.results.find(x=>x.round===index+1&&x.home===g.home&&x.away===g.away);
    return '<div class="fixture '+(g.home===state.clubId||g.away===state.clubId?'mine':'')+'"><span>'+esc(clubInfo[g.home].name)+'</span><b>'+(r?r.hg+" : "+r.ag:"—")+'</b><span>'+esc(clubInfo[g.away].name)+'</span></div>';
  }).join("")+'</div>').join("");
}
root.addEventListener("click",ev=>{
  const control=ev.target.closest("button");
  if(!control || !root.contains(control))return;
  const data=control.dataset;
  if(data.club!==undefined){start(Number(data.club));return;}
  if(data.view){nav(data.view);return;}
  if(data.sign!==undefined){buy(Number(data.sign));return;}
  if(data.sell!==undefined){sell(Number(data.sell));return;}
  if(data.swap!==undefined){swap(Number(data.swap));return;}
});
$("playOne").addEventListener("click",()=>advance(1));
$("playFive").addEventListener("click",()=>advance(5));
$("playSeason").addEventListener("click",()=>advance(14));
$("autoLineup").addEventListener("click",()=>{state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);save();render();show("已重新安排最强首发。");});
$("saveBtn").addEventListener("click",()=>{save();show("进度已保存到当前浏览器。");});
$("resetBtn").addEventListener("click",()=>{if(!confirm("确定重新开档？当前浏览器中的足球游戏进度将清除，无法撤销。"))return;state=null;currentView="dashboard";try{localStorage.removeItem(STORAGE);}catch(error){}renderSetup();});
[["formationSelect","formation"],["styleSelect","style"],["trainingSelect","training"]].forEach(([id,key])=>{
  $(id).addEventListener("change",ev=>{
    state.tactics[key]=ev.target.value;
    if(key==="formation")state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
    save();render();show("战术设置已更新。");
  });
});
load();render();
})();