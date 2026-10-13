(() => {
"use strict";
const root = document.getElementById("footballApp");
if (!root || root.dataset.ready) return;
root.dataset.ready = "1";
const $ = id => document.getElementById(id);
const realData=window.FOOTBALL_DATABASE;
if(!realData||realData.clubs?.length!==20){root.textContent="2026/27真实球员数据库未加载，请刷新页面。";return;}
const worldData=window.FOOTBALL_WORLD;
const worldClubs=worldData?.clubs || [];
const allClubs=realData.clubs.map(c=>({...c,league:"英超"})).concat(worldClubs,window.FOOTBALL_LEAGUE_ADDITIONS||[]);
const clubInfo=allClubs;
const leagueList=["英超","西甲","德甲","意甲","法甲","中超","葡超","荷甲","沙特联","美职联"];
const fullLeagues=new Set(["英超","西甲","德甲","意甲","法甲","中超"]);
const byPos = {G:"门将",D:"后卫",M:"中场",F:"前锋"};
const patterns = {"4-3-3":{G:1,D:4,M:3,F:3},"4-2-3-1":{G:1,D:4,M:5,F:1},"4-4-2":{G:1,D:4,M:4,F:2}};
const STORAGE="chengdu_football_dynasty_v4";
const OLD_STORAGE="chengdu_football_dynasty_v3";
const OLDER_STORAGE="chengdu_football_dynasty_v2";
const leagueRounds=()=>state?.leagueIds?.length?(state.leagueIds.length%2?state.leagueIds.length*2:(state.leagueIds.length-1)*2):38;
const MAX_SQUAD=35;
let state=null,currentView="dashboard",toastTimer=null;
let bidTarget=null;
let setupLeague="英超";
let marketFilter={q:"",league:"",club:"",pos:"",sort:"rating",limit:24};
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => value >= 10000 ? "¥"+(value/10000).toFixed(2)+"亿" : "¥"+Math.round(value).toLocaleString("zh-CN")+"万";
const badge = id => '<span class="clublogo club-'+id+'">'+clubInfo[id].short+'</span>';
const drawName = i => firstNames[(i*7+3)%firstNames.length]+"·"+lastNames[(i*11+5)%lastNames.length];
const featuredRatings={
"Erling Haaland":95,"Gianluigi Donnarumma":92,"Phil Foden":90,"Bukayo Saka":92,
"Declan Rice":90,"Bruno Fernandes":89,"Alexander Isak":92,"Florian Wirtz":90,
"Virgil van Dijk":91,"Cole Palmer":90,"Joao Pedro":86,"Moises Caicedo":88,
"Martin Odegaard":89,"William Saliba":90,"David Raya":88,"Bruno Guimaraes":87,
"Kai Havertz":86,"Carlos Baleba":84,"Benjamin Sesko":85,"Bryan Mbeumo":85,
"Sandro Tonali":88,"Rayan Cherki":89,"Hugo Ekitike":86,"Viktor Gyokeres":88,
"Marcus Rashford":84,"Matheus Cunha":85,"Morgan Rogers":86,
"Kylian Mbappe":95,"Lamine Yamal":94,"Cristiano Ronaldo":89,"Lionel Messi":89,
"Harry Kane":94,"Vinicius Junior":93,"Jude Bellingham":93,"Pedri":92,
"Rodri":92,"Raphinha":91,"Lautaro Martinez":91,"Ousmane Dembele":92,
"Vitinha":91,"Jamal Musiala":92,"Michael Olise":90,"Declan Rice":90,
"Kevin De Bruyne":89,"Scott McTominay":87,"Wu Lei":77,"Wei Shihao":76};
function newPlayer(info,power,index){
  const id=state.nextId++;
  const age=rnd(18,34),ability=clamp(featuredRatings[info.name]??(power+rnd(-9,7)),57,96);
  const potential=clamp(ability+rnd(1,12),ability,98);
  return {id,name:info.cn||info.name,english:info.name,pos:info.pos,age,ability,potential,
    fitness:rnd(85,100),form:rnd(74,94),
    price:Math.round((ability-52)*(ability-52)*2.4+rnd(150,800)),played:0,goals:0,assists:0,injury:0};
}
function fixtures(){
 const ids=state.leagueIds,count=ids.length,n=count+(count%2);
 if(count<2)throw Error("Invalid league field");
 let order=ids.slice();if(count%2)order.push(-1);const first=[];
 for(let r=0;r<n-1;r++){
  const games=[];
  for(let i=0;i<n/2;i++){
   const a=order[i],b=order[n-1-i];
   if(a>=0&&b>=0)games.push((r+i)%2?{home:b,away:a}:{home:a,away:b});
  }
  first.push(games);
  order=[order[0],order[n-1],...order.slice(1,n-1)];
 }
 return first.concat(first.map(games=>games.map(g=>({home:g.away,away:g.home}))));
}
function emptyStandings(){return clubInfo.map((_,id)=>({id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));}
const academySurnames=["李","王","张","刘","陈","赵","周","吴","孙","胡","朱","高","林","何","马","罗","徐","郭","梁","谢"];
function youthPlayer(owner,pos,i){
 const id=state.nextId++,pwr=allClubs[owner].power||74;
 const name="青训·"+academySurnames[(owner*7+i*3)%20]+
 ["俊杰","嘉伟","志豪","博文","宇轩","哲宇","浩然","昊天","子航","明轩"][(owner+i)%10];
 const ability=clamp(pwr+rnd(-17,-5),48,88);
 return {id,name,english:"Generated academy player",pos,age:rnd(17,21),ability,
 potential:clamp(ability+rnd(8,21),ability,97),fitness:rnd(84,100),form:rnd(75,96),
 price:Math.round((ability-50)**2*1.6+200),played:0,goals:0,assists:0,injury:0,synthetic:true};
}
function ensureSquad(owner){
 const squad=state.squads[owner],minimum={G:2,D:7,M:6,F:4};
 for(const pos of ["G","D","M","F"]){
  const missing=Math.max(0,minimum[pos]-squad.filter(p=>p.pos===pos).length);
  for(let i=0;i<missing;i++)squad.push(youthPlayer(owner,pos,i));
 }
}
function start(id){
 if(!Number.isInteger(id)||!allClubs[id])return;
 const league=allClubs[id].league;
 const leagueIds=allClubs.map((c,i)=>c.league===league?i:-1).filter(i=>i>=0);
 state={clubId:id,league,leagueIds,year:2026,season:1,round:0,nextId:1,
 budget:allClubs[id].budget,aiBudgets:allClubs.map(c=>c.budget),
 squads:[],worldSquads:[],worldBudgets:[],market:[],finance:{earned:0,spent:0,academy:1,stadium:1,training:1,promoted:0,fanSupport:74},lastEvents:[],table:emptyStandings(),
 fixtures:[],results:[],news:[],lastResult:"",titles:0,negotiations:{},
 tactics:{formation:"4-3-3",style:"balance",training:"fitness"},lineup:[],
 moods:allClubs.map(()=>rnd(66,85))};
 allClubs.forEach((c,i)=>{state.squads.push((c.players||[]).map(entry=>newPlayer(entry,c.power)));ensureSquad(i);});
 state.fixtures=fixtures();state.lineup=bestXI(id,state.tactics.formation).map(p=>p.id);
 news("欢迎执教"+allClubs[id].name+"！"+league+leagueRounds()+"轮"+
 (fullLeagues.has(league)?"完整联赛":"精选俱乐部模拟联赛")+"，全球转会开启。");
 save();currentView="dashboard";render();
}
function squadFor(id){return state.squads[id];}
function fundsFor(id){return id===state.clubId?state.budget:state.aiBudgets[id];}
function setFunds(id,value){if(id===state.clubId)state.budget=value;else state.aiBudgets[id]=value;}
function canRelease(owner,player){
 const team=squadFor(owner);
 if(!team||player.synthetic||!team.some(p=>p.id===player.id))return false;
 const minimum={G:1,D:3,M:3,F:1};
 return team.length>13&&team.filter(p=>p.pos===player.pos).length>minimum[player.pos];
}
function offerFloor(owner,player){
 const quality=Math.max(0,player.ability-78);
 const prestige=(allClubs[owner]?.power||76)>=85?.10:0;
 return Math.max(1,Math.ceil(player.price*(1.05+quality*.014+prestige)));
}
function playerFor(id){
 for(let owner=0;owner<allClubs.length;owner++){
  const player=squadFor(owner)?.find(p=>p.id===id);
  if(player)return {player,owner};
 }
 return null;
}
function transferPlayer(id,buyer,fee){
 const found=playerFor(id);
 if(!found||found.owner===buyer||!canRelease(found.owner,found.player))return null;
 const targetTeam=squadFor(buyer),seller=squadFor(found.owner);
 if(!targetTeam||targetTeam.length>=MAX_SQUAD)return null;
 if(fundsFor(buyer)<fee||!Number.isSafeInteger(fee)||fee<1)return null;
 setFunds(buyer,fundsFor(buyer)-fee);
 setFunds(found.owner,fundsFor(found.owner)+fee);
 seller.splice(seller.findIndex(p=>p.id===id),1);targetTeam.push(found.player);
 if(found.owner===state.clubId)state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
 return {player:found.player,from:found.owner,fee,buyer};
}
function bestXI(team,formation) {
  const plan=patterns[formation]||patterns["4-3-3"];
  const list=state.squads[team], lineup=[];
  for(const pos of ["G","D","M","F"]) {
    const sorted=list.filter(p=>p.pos===pos&&(p.injury||0)===0).sort((a,b)=>scorePlayer(b)-scorePlayer(a));
    lineup.push(...sorted.slice(0,plan[pos]));
  }
  return lineup;
}
function scorePlayer(p){return p.ability*.68+p.form*.17+p.fitness*.15;}
function userXI(){
  const list=state.squads[state.clubId];
  const existing=state.lineup.map(id=>list.find(p=>p.id===id&&(p.injury||0)===0)).filter(Boolean);
  const required=patterns[state.tactics.formation],counts={G:0,D:0,M:0,F:0};
  existing.forEach(p=>counts[p.pos]++);
  if(existing.length!==11 || Object.keys(required).some(pos=>counts[pos]!==required[pos])){
    state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
  }
  return state.lineup.map(id=>list.find(p=>p.id===id)).filter(Boolean);
}
function standings(){return state.leagueIds.map(id=>state.table[id]).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.id-b.id);}
function rank(){return standings().findIndex(row=>row.id===state.clubId)+1;}
function nextFixture(){if(state.round>=state.fixtures.length)return null;return state.fixtures[state.round].find(g=>g.home===state.clubId||g.away===state.clubId);}
function news(text){state.news.unshift({round:state.round,season:state.season,text});state.news=state.news.slice(0,24);}
function save(){if(!state)return;try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch(error){/* private mode: the game remains playable */}}
function load(){
 try{
  const raw=localStorage.getItem(STORAGE)||localStorage.getItem(OLD_STORAGE)||localStorage.getItem(OLDER_STORAGE);
  if(!raw)return;
  const parsed=JSON.parse(raw);
  if(!parsed||!Number.isInteger(parsed.clubId)||!allClubs[parsed.clubId]||
     !Array.isArray(parsed.squads)||!parsed.tactics||!Array.isArray(parsed.fixtures)||
     !Array.isArray(parsed.aiBudgets))return;
  state=parsed;
  if(state.squads.length!==allClubs.length){
    // Preserve 2026/27 EPL careers from v2 and v3, and their global transfers.
    const oldSquads=state.squads,oldWorld=state.worldSquads||[];
    const oldBudgets=state.aiBudgets,oldWorldBudgets=state.worldBudgets||[];
    state.squads=allClubs.map((club,id)=>{
      if(id<20)return oldSquads[id]||[];
      if(id<20+worldClubs.length)return oldWorld[id-20]||[];
      return [];
    });
    state.aiBudgets=allClubs.map((club,id)=>{
      if(id<20)return oldBudgets[id]??club.budget;
      if(id<20+worldClubs.length)return oldWorldBudgets[id-20]??club.budget;
      return club.budget;
    });
    const realChinese=new Map(realData.clubs.flatMap(c=>c.players.map(p=>[p.name,p.cn])));
    const english=new Map(realData.clubs.flatMap(c=>c.players.map(p=>[p.cn,p.name])));
    for(const squad of state.squads)for(const player of squad){
       const origin=player.english||english.get(player.name)||player.name;
       if(realChinese.has(origin)){player.english=origin;player.name=realChinese.get(origin);}
    }
    state.nextId=Math.max(state.nextId||0,1,...state.squads.flatMap(team=>team.map(p=>p.id)))+1;
    allClubs.forEach((club,id)=>{
      if(!state.squads[id].length)state.squads[id]=(club.players||[]).map(p=>newPlayer(p,club.power));
    });
  }
  state.league=allClubs[state.clubId].league;
  state.leagueIds=allClubs.map((c,i)=>c.league===state.league?i:-1).filter(i=>i>=0);
  const oldTable=state.table||[];
  if(oldTable.length!==allClubs.length){
    state.table=allClubs.map((_,id)=>oldTable[id]||{id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  }
  state.moods=allClubs.map((_,id)=>state.moods?.[id]??rnd(66,85));
  state.worldSquads=[];state.worldBudgets=[];
  if(!Number.isInteger(state.nextId))state.nextId=1;
  allClubs.forEach((c,id)=>ensureSquad(id));
  if(state.fixtures.length!==leagueRounds())state.fixtures=fixtures();
  if(!state.negotiations||typeof state.negotiations!=="object")state.negotiations={};
  if(!state.finance)state.finance={earned:0,spent:0,academy:1,stadium:1,training:1,promoted:0,fanSupport:74};
  if(!Array.isArray(state.lastEvents))state.lastEvents=[];
  state.squads.forEach(team=>team.forEach(p=>{p.goals=p.goals||0;p.assists=p.assists||0;p.injury=p.injury||0;}));
  state.market=[];save();
 }catch(error){state=null;}
}
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
  const hg=goalDraw(homeLambda),ag=goalDraw(awayLambda);
  const events=[];
  for(const [team,goals] of [[game.home,hg],[game.away,ag]]){
   const starters=team===state.clubId?userXI():bestXI(team,"4-3-3");
   const pool=starters.flatMap(p=>Array(p.pos==="F"?5:p.pos==="M"?3:p.pos==="D"?1:0).fill(p));
   for(let i=0;i<goals;i++){
     if(!pool.length)continue;
     const goal=pool[rnd(0,pool.length-1)];
     const potentialAssist=starters.filter(p=>p.id!==goal.id && p.pos!=="G");
     const helper=potentialAssist.length && Math.random()<.65 ?
       potentialAssist[rnd(0,potentialAssist.length-1)]:null;
     events.push({team,scorer:goal.id,assist:helper?.id??null,
       name:goal.name,helperName:helper?.name??"",minute:rnd(2,90)});
   }
  }
  events.sort((a,b)=>a.minute-b.minute);
  return {home:game.home,away:game.away,hg,ag,events,round:state.round+1};
}
function applyResult(result){
  for(const evt of result.events||[]){
    const scorer=squadFor(evt.team).find(p=>p.id===evt.scorer);
    if(scorer)scorer.goals=(scorer.goals||0)+1;
    if(evt.assist!==null){
      const helper=squadFor(evt.team).find(p=>p.id===evt.assist);
      if(helper)helper.assists=(helper.assists||0)+1;
    }
  }
  const h=state.table[result.home],a=state.table[result.away];
  h.p++;a.p++;h.gf+=result.hg;h.ga+=result.ag;a.gf+=result.ag;a.ga+=result.hg;
  if(result.hg>result.ag){h.w++;h.pts+=3;a.l++;state.moods[result.home]=clamp(state.moods[result.home]+3,40,98);state.moods[result.away]=clamp(state.moods[result.away]-2,40,98);}
  else if(result.hg<result.ag){a.w++;a.pts+=3;h.l++;state.moods[result.away]=clamp(state.moods[result.away]+3,40,98);state.moods[result.home]=clamp(state.moods[result.home]-2,40,98);}
  else{h.d++;a.d++;h.pts++;a.pts++;}
}
function fatigue(){
  state.leagueIds.forEach(id=>{const squad=state.squads[id];
    const chosen=(id===state.clubId?userXI():bestXI(id,"4-3-3")).map(p=>p.id);
    squad.forEach(p=>{
      if(p.injury>0){
        p.injury--;p.fitness=clamp(p.fitness+5,34,100);
        return;
      }
      p.fitness=clamp(p.fitness+rnd(7,12),34,100);
      if(chosen.includes(p.id)){
        const heavy=id===state.clubId&&state.tactics.style==="press";
        p.fitness=clamp(p.fitness-rnd(11,heavy?22:17),32,100);
        p.form=clamp(p.form+rnd(-3,4),49,100);
        p.played++;
        if(p.age<=24&&p.ability<p.potential&&p.played%5===0&&Math.random()<.35)p.ability++;
        if(Math.random()<.0016){p.injury=rnd(1,4);if(id===state.clubId)news(p.name+"在比赛后受伤，将休养"+p.injury+"轮。");}
      } else p.form=clamp(p.form+rnd(-2,2),48,100);
    });
  });
  const focus=state.tactics.training;
  state.squads[state.clubId].forEach(p=>{
    if(focus==="fitness")p.fitness=clamp(p.fitness+5,32,100);
    else if((focus==="attack"&&(p.pos==="F"||p.pos==="M"))||(focus==="defense"&&(p.pos==="D"||p.pos==="G")))p.form=clamp(p.form+2+(state.finance.training-1),45,100);
  });
}
function aiTransfer(){
 const buyers=state.leagueIds.filter(id=>id!==state.clubId);
 const buyer=buyers[rnd(0,buyers.length-1)];
 const available=[];
 for(let owner=0;owner<allClubs.length;owner++){
  if(owner===buyer||owner===state.clubId)continue;
  for(const player of squadFor(owner)){
    if(canRelease(owner,player) && !player.synthetic && squadFor(buyer).length<MAX_SQUAD &&
       fundsFor(buyer)>offerFloor(owner,player) && player.ability>=79)
      available.push({owner,player});
  }
 }
 if(!available.length)return;
 const found=available[rnd(0,available.length-1)];
 const fee=offerFloor(found.owner,found.player);
 const deal=transferPlayer(found.player.id,buyer,fee);
 if(deal)news(allClubs[buyer].name+"从"+allClubs[deal.from].name+"签下"+deal.player.name+"，转会费"+money(fee)+"。");
}
function simulateOne(){
  if(state.round>=leagueRounds())return;
  const games=state.fixtures[state.round];
  const output=games.map(resultFor);
  output.forEach(applyResult);
  state.results.push(...output);
  const mine=output.find(r=>r.home===state.clubId||r.away===state.clubId);
  state.lastResult=clubInfo[mine.home].name+" "+mine.hg+" : "+mine.ag+" "+clubInfo[mine.away].name;
  state.lastEvents=mine.events||[];
  updateFinance(mine);
  state.round++;
  fatigue();
  news(state.league+"第"+state.round+"轮 "+state.lastResult+"。当前排名第"+rank()+"。");
  if(state.round%3===0)aiTransfer();
  if(state.round===leagueRounds()){const champion=standings()[0].id;if(champion===state.clubId)state.titles++;news("赛季结束！"+clubInfo[champion].name+"夺得冠军。你最终排名第"+rank()+"。");}
}
function advance(amount){
  if(state.round>=leagueRounds()){newSeason();render();return;}
  let n=Math.min(Math.max(1,amount),leagueRounds()-state.round);
  for(let i=0;i<n;i++)simulateOne();
  save();render();show("已完成"+n+"轮模拟，当前排名第"+rank()+"。");
}
function newSeason(){
 const finish=rank();state.year++;state.season++;state.round=0;
 state.table=emptyStandings();state.results=[];state.fixtures=fixtures();
 state.budget+=6000+(state.leagueIds.length+1-finish)*450;
 state.aiBudgets=state.aiBudgets.map(v=>v+8500);
 state.lastResult="";state.lastEvents=[];
 state.finance.earned=0;state.finance.spent=0;state.finance.promoted=0;
 state.squads.forEach(team=>team.forEach(p=>{
   p.age++;p.fitness=100;p.form=rnd(72,92);p.played=0;p.goals=0;p.assists=0;p.injury=0;
   if(p.age>31&&Math.random()<.45)p.ability=clamp(p.ability-1,45,99);
   else if(p.age<25&&p.ability<p.potential&&Math.random()<.55)p.ability++;
 }));
 state.lineup=bestXI(state.clubId,state.tactics.formation).map(p=>p.id);
 news("新赛季："+state.league+" "+leagueRounds()+"轮，全球转会市场持续开放。");save();
}
function negotiationInfo(id){
 const found=playerFor(id);
 const saved=state.negotiations?.[id];
 if(!found || found.owner===state.clubId)return null;
 const p=found.player,owner=found.owner;
 const listingCount=squadFor(owner).filter(x=>x.pos===p.pos).length;
 const scarcity=listingCount<5?0.09:0;
 const keyPlayer=p.ability>=88?0.08:p.ability>=83?0.04:0;
 const morale=p.form>=91?0.03:0;
 const reserve=Math.ceil(offerFloor(owner,p)*(1+scarcity+keyPlayer+morale));
 const asking=Math.ceil(reserve*1.18);
 const alive=saved && saved.season===state.season && saved.expiresRound>=state.round &&
      saved.owner===owner && saved.status==="counter";
 return {found,owner,player:p,asking,reserve,
    saved,activeCounter:alive?Number(saved.counter):0};
}
function recordNegotiation(id,fields){
 const previous=state.negotiations[id]||{};
 state.negotiations[id]={...previous,...fields,
   season:state.season,round:state.round,expiresRound:Math.min(leagueRounds(),state.round+5)};
 save();
}
function buy(id,fee){
 const info=negotiationInfo(id);
 if(!info)return {ok:false,kind:"unavailable",message:"球员已离队或已经在你的球队。"};
 const {player,owner,reserve,activeCounter,saved}=info;
 if(!canRelease(owner,player))return {ok:false,kind:"unavailable",message:"该球员是关键位置唯一人选，卖方需要保留他。"};
 if(squadFor(state.clubId).length>=MAX_SQUAD)return {ok:false,kind:"unavailable",message:"一线队已满35人，请先出售球员。"};
 if(!Number.isSafeInteger(fee)||fee<1)return {ok:false,kind:"invalid",message:"请填写有效的整数报价。"};
 if(fee>state.budget)return {ok:false,kind:"funds",message:"预算不足，当前最多可报价"+money(state.budget)+"。"};
 const attempts=Math.min(6,(saved?.attempts||0)+1);
 const reduced=reserve*(1-Math.min(attempts-1,4)*.022);
 const agreed=activeCounter>0 && fee>=activeCounter;
 if(!agreed&&fee<reduced){
   if(fee<reduced*.53){
      recordNegotiation(id,{owner,name:player.name,club:allClubs[owner].name,fee,attempts,status:"low",counter:0});
      return {ok:false,kind:"low",message:allClubs[owner].name+"认为报价偏离球员价值较远。建议将报价提高至约"+money(Math.ceil(reduced*.8))+"以上，仍可继续谈判。"};
   }
   const counter=Math.ceil(Math.max(reduced,Math.max(fee*1.025,reduced*(1.11-Math.min(attempts,4)*.025))));
   recordNegotiation(id,{owner,name:player.name,club:allClubs[owner].name,fee,attempts,status:"counter",counter});
   return {ok:false,kind:"counter",counter,
      message:allClubs[owner].name+"没有直接拒绝。俱乐部提出还价 "+money(counter)+"，你可以接受，或再次提交你的报价（有效期5轮）。"};
 }
 const deal=transferPlayer(id,state.clubId,fee);
 if(!deal)return {ok:false,kind:"unavailable",message:"交易未能完成，可能已经被其他球队买走。"};
 recordNegotiation(id,{owner:deal.from,name:deal.player.name,club:allClubs[deal.from].name,fee,attempts,status:"signed",counter:0});
 news("官宣："+deal.player.name+"从"+allClubs[deal.from].name+"加盟"+clubInfo[state.clubId].name+
    "，转会费"+money(fee)+"，谈判"+attempts+"轮完成。");
 save();render();show("成功签下："+deal.player.name);
 return {ok:true,kind:"signed",message:"签约成功："+deal.player.name+"已加入你的阵容。"};
}
function sell(id){
 const found=playerFor(id);
 if(!found||found.owner!==state.clubId)return show("该球员已不在你的队中。");
 if(!canRelease(state.clubId,found.player))return show("该位置人数不足，无法出售。");
 const price=Math.max(1,Math.round(found.player.price*.85));
 const buyers=allClubs.map((_,i)=>i).filter(i=>i!==state.clubId
  &&squadFor(i).length<MAX_SQUAD &&fundsFor(i)>=price);
 if(!buyers.length)return show("目前没有能支付这笔转会费的买家。");
 const buyer=buyers[rnd(0,buyers.length-1)],deal=transferPlayer(id,buyer,price);
 if(!deal)return show("转会未能完成。");
 news(deal.player.name+"转会"+allClubs[buyer].name+"，俱乐部获得"+money(price)+"。");
 save();render();show("出售成功："+deal.player.name+"，已收到转会费。");
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
 $("setupLeague").value=setupLeague;
 const clubs=allClubs.map((c,id)=>({...c,id})).filter(c=>c.league===setupLeague);
 const full=fullLeagues.has(setupLeague);
 $("setupLeagueHint").textContent=setupLeague+"共有"+clubs.length+
 "支可执教俱乐部 · 每队"+Math.max(0,clubs.length%2?clubs.length*2:(clubs.length-1)*2)+
 "个比赛周。"+(full?"完整联赛名单；缺失的实名球员用明确标注的模拟青训球员补充。":
 "精选俱乐部小型模拟比赛，尚未覆盖此联赛全部真实参赛球队。");
 $("clubGrid").innerHTML=clubs.map(c=>'<button type="button" class="clubitem" data-club="'+c.id+'">'+
 badge(c.id)+'<strong>'+esc(c.name)+'</strong><small>初始实力 '+c.power+
 ' · '+money(c.budget)+'</small><span class="pick">执教 '+esc(setupLeague)+' ↗</span></button>').join("");
}
function render(){
  renderSetup();if(!state)return;
  $("statClub").textContent=clubInfo[state.clubId].name+" · "+state.league;
  $("statSeason").textContent=state.year+"/"+String((state.year+1)%100).padStart(2,"0");
  $("statRound").textContent=state.round+" / "+leagueRounds()+" 轮";
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
  const metrics=[["首发综合能力",avg],["主力体能",fit],["更衣室士气",state.moods[state.clubId]],["队伍完整度",Math.round(clamp(state.squads[state.clubId].length/25*100,0,100))]];
  $("clubMetrics").innerHTML=metrics.map(([key,val])=>'<div class="metric"><div class="metrichead"><span>'+key+'</span><strong>'+val+'</strong></div><progress class="meter" max="100" value="'+clamp(val,0,100)+'"></progress></div>').join("");
  $("miniTable").innerHTML=tableHTML(true);
  $("newsFeed").innerHTML=state.news.slice(0,6).map(n=>'<div class="feeditem"><small>S'+n.season+' / R'+n.round+'</small><span>'+esc(n.text)+'</span></div>').join("");
}
function renderSquad(){
  const squad=[...state.squads[state.clubId]].sort((a,b)=>"GDMF".indexOf(a.pos)-"GDMF".indexOf(b.pos)||b.ability-a.ability);
  $("squadCount").textContent=squad.length+" 名球员";
  $("squadTable").innerHTML='<table class="data-table"><thead><tr><th>姓名</th><th>位置</th><th>模拟年龄</th><th>能力</th><th>潜力</th><th>状态</th><th>体能</th><th>模拟身价</th><th>操作</th></tr></thead><tbody>'+squad.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong></td><td>'+byPos[p.pos]+'</td><td>'+p.age+'</td><td class="high">'+p.ability+'</td><td>'+p.potential+'</td><td>'+p.form+'</td><td>'+p.fitness+'</td><td>'+money(p.price)+'</td><td><button type="button" class="action" data-sell="'+p.id+'">出售</button></td></tr>').join("")+'</tbody></table>';
}
function renderTactics(){
  $("formationSelect").value=state.tactics.formation;$("styleSelect").value=state.tactics.style;$("trainingSelect").value=state.tactics.training;
  $("formationBadge").textContent=state.tactics.formation;
  const lineup=userXI(),starters=new Set(lineup.map(p=>p.id)),groups={G:[],D:[],M:[],F:[]};
  lineup.forEach(p=>groups[p.pos].push(p));
  $("pitch").innerHTML='<div class="center-circle"></div>'+["F","M","D","G"].map(pos=>'<div class="pitchrow">'+groups[pos].map(p=>'<div class="pitchplayer"><div class="shirt">'+p.ability+'</div><span>'+esc(p.name.split("·").pop())+'</span></div>').join("")+'</div>').join("");
  $("lineupRoster").innerHTML='<div class="panelheading"><span>阵容轮换</span><span class="tag">首发 11 人</span></div>'+state.squads[state.clubId].map(p=>'<div class="rosterline"><span>'+esc(p.name)+' <small>'+byPos[p.pos]+' '+p.ability+'</small></span>'+(starters.has(p.id)?'<small>首发</small>':'<button type="button" data-swap="'+p.id+'">替换上场</button>')+'</div>').join("");
}
function marketCandidates(){
 const result=[];
 for(let owner=0;owner<allClubs.length;owner++){
   if(owner===state.clubId)continue;
   const club=allClubs[owner];
   if(marketFilter.league&&club.league!==marketFilter.league)continue;
   if(marketFilter.club&&String(owner)!==marketFilter.club)continue;
   for(const player of squadFor(owner)){
     if(marketFilter.pos&&player.pos!==marketFilter.pos)continue;
     const q=marketFilter.q.toLowerCase().trim();
     if(q&&!([player.name,player.english||"",club.name,club.league].join(" ").toLowerCase().includes(q)))continue;
     if(!canRelease(owner,player))continue;
     result.push({owner,club,player});
   }
 }
 result.sort((a,b)=>{
   if(marketFilter.sort==="priceLow")return a.player.price-b.player.price;
   if(marketFilter.sort==="priceHigh")return b.player.price-a.player.price;
   if(marketFilter.sort==="name")return a.player.name.localeCompare(b.player.name,"zh");
   return b.player.ability-a.player.ability||a.player.price-b.player.price;
 });
 return result;
}
function renderMarket(){
 $("marketBudget").textContent="可用预算 "+money(state.budget);
 const leagueSelect=$("marketLeague"),clubSelect=$("marketClub");
 if(!leagueSelect.dataset.initialized){
   const leagues=leagueList;
   leagueSelect.innerHTML='<option value="">全球全部联赛</option>'+
       leagues.map(l=>'<option value="'+esc(l)+'">'+esc(l)+'</option>').join("");
   leagueSelect.dataset.initialized="1";
 }
 leagueSelect.value=marketFilter.league;
 const selectedClubs=allClubs.map((c,i)=>({...c,id:i})).filter(c=>
   (!marketFilter.league||c.league===marketFilter.league)&&c.id!==state.clubId);
 const current=selectedClubs.some(c=>String(c.id)===marketFilter.club)?marketFilter.club:"";
 marketFilter.club=current;
 clubSelect.innerHTML='<option value="">全部俱乐部</option>'+
   selectedClubs.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");
 clubSelect.value=marketFilter.club;
 $("marketSearch").value=marketFilter.q;
 $("marketPos").value=marketFilter.pos;
 $("marketSort").value=marketFilter.sort;
 const items=marketCandidates(),page=items.slice(0,marketFilter.limit);
 $("marketCount").textContent="当前找到 "+items.length+" 位可交易球员 · 涵盖 "+allClubs.length+" 家俱乐部";
 $("marketList").innerHTML=page.map(({owner,club,player})=>
 '<article class="marketcard"><div class="badge">'+esc(club.league)+' · '+esc(club.name)+
 ' · '+byPos[player.pos]+'</div><h3>'+esc(player.name)+'</h3>'+
 '<p>'+esc(player.english||"")+'</p><p>能力 '+player.ability+
 ' · 游戏潜力 '+player.potential+' · 状态 '+player.form+'</p>'+
 '<div class="value">'+money(player.price)+'</div>'+
 '<button type="button" class="primary" data-offer="'+player.id+'">'+
 (state.negotiations[player.id]?.status==="counter"?"继续谈判":"向俱乐部报价")+'</button></article>').join("")
 ||'<div class="panel">没有符合条件的球员。请修改联赛、球队或搜索关键词。</div>';
 $("marketMore").hidden=page.length>=items.length;
 $("marketMore").textContent="加载更多（已显示 "+page.length+" / "+items.length+"）";
 const negotiations=Object.entries(state.negotiations||{}).map(([id,v])=>({id:Number(id),...v}))
   .filter(n=>n.season===state.season).sort((a,b)=>b.round-a.round);
 $("offerCount").textContent=negotiations.length+" 条记录";
 $("offerHistory").innerHTML=negotiations.length?negotiations.slice(0,16).map(n=>{
   const available=playerFor(n.id);
   const active=n.status==="counter" && n.expiresRound>=state.round &&
       available && available.owner!==state.clubId;
   const status=n.status==="signed"?"转会完成":active?"待你答复":n.status==="low"?"报价偏低":"已结束";
   return '<div class="offer-row"><div><strong>'+esc(n.name||"球员")+'</strong><small>'+
     esc(n.club||"原俱乐部")+' · 第'+(n.round+1)+'轮 · '+status+
     '</small></div><div><strong>'+money(n.fee||0)+'</strong>'+
     (active?'<button type="button" class="action" data-offer="'+n.id+'">继续谈判</button>':"")+
     '</div></div>';
 }).join(""):'<p class="fine">尚无转会谈判。点击球员的「向俱乐部报价」开始。</p>';
}
function showOfferFeedback(result){
 $("bidFeedback").textContent=result.message||"";
 const info=bidTarget===null?null:negotiationInfo(bidTarget);
 const active=result.kind==="counter" ? result.counter : info?.activeCounter||0;
 $("acceptCounter").hidden=!active;
 $("acceptCounter").disabled=!!(active && state.budget<active);
 $("acceptCounter").textContent=active?"接受还价 "+money(active)+" 并签约":"接受对方还价并签约";
 $("bidQuote").textContent=active?
   "卖方已提出还价。若预算不足，可先出售球员补充资金，报价将保留至有效期结束。":"";
}
function openBid(id){
 const info=negotiationInfo(id);
 if(!info)return show("该球员已离队或在你的球队。");
 bidTarget=id;
 const {player,owner,asking,saved,activeCounter}=info;
 $("bidHeading").textContent="求购 "+player.name;
 $("bidDetails").innerHTML="<strong>"+esc(player.name)+"</strong><p>"+
   esc(player.english||"")+"</p><p>当前所属："+esc(allClubs[owner].league)+" · "+
   esc(allClubs[owner].name)+"</p><p>位置："+byPos[player.pos]+
   " · 能力："+player.ability+" · 参考身价："+money(player.price)+"</p>";
 $("bidAmount").value=activeCounter||Math.min(asking,Math.max(1,state.budget));
 $("bidInfo").textContent="俱乐部起始要价约 "+money(asking)+"，当前预算 "+
   money(state.budget)+"。你可以主动提交低价，对方会结合球员能力、球队实力和谈判轮次还价。";
 $("bidFeedback").textContent="";
 showOfferFeedback({kind:activeCounter?"counter":"start",counter:activeCounter,message:
   activeCounter?"上一次还价 "+money(activeCounter)+" 有效至本赛季第 "+(saved.expiresRound+1)+" 轮。":""});
 const dlg=$("bidDialog");
 if(typeof dlg.showModal==="function"&&!dlg.open)dlg.showModal();
 else dlg.setAttribute("open","");
}
function closeBid(){
 bidTarget=null;
 const dlg=$("bidDialog");
 if(typeof dlg.close==="function"&&dlg.open)dlg.close();
 else dlg.removeAttribute("open");
}
function renderLeague(){
  $("leagueRound").textContent="已进行 "+state.round+" / "+leagueRounds()+" 轮";$("leagueDescription").textContent=state.league+" · "+state.leagueIds.length+"支球队，主客场双循环共"+leagueRounds()+"个比赛周、"+(state.leagueIds.length*(state.leagueIds.length-1))+"场，球队各赛"+((state.leagueIds.length-1)*2)+"场。赛程为游戏生成，非官方现实赛程。";$("fullTable").innerHTML=tableHTML(false);
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
  if(data.offer!==undefined){openBid(Number(data.offer));return;}
  if(data.sell!==undefined){sell(Number(data.sell));return;}
  if(data.swap!==undefined){swap(Number(data.swap));return;}
});
$("setupLeague").addEventListener("change",ev=>{setupLeague=ev.target.value;renderSetup();});
$("marketSearch").addEventListener("input",ev=>{marketFilter.q=ev.target.value.slice(0,120);marketFilter.limit=24;renderMarket();});
$("marketLeague").addEventListener("change",ev=>{marketFilter.league=ev.target.value;marketFilter.club="";marketFilter.limit=24;renderMarket();});
$("marketClub").addEventListener("change",ev=>{marketFilter.club=ev.target.value;marketFilter.limit=24;renderMarket();});
$("marketPos").addEventListener("change",ev=>{marketFilter.pos=ev.target.value;marketFilter.limit=24;renderMarket();});
$("marketSort").addEventListener("change",ev=>{marketFilter.sort=ev.target.value;marketFilter.limit=24;renderMarket();});
$("marketMore").addEventListener("click",()=>{marketFilter.limit+=24;renderMarket();});
$("bidClose").addEventListener("click",closeBid);
$("acceptCounter").addEventListener("click",()=>{
 if(bidTarget===null)return;
 const info=negotiationInfo(bidTarget);
 if(!info?.activeCounter)return showOfferFeedback({kind:"unavailable",message:"还价已失效，请重新报价。"});
 const result=buy(bidTarget,info.activeCounter);
 if(result.ok)closeBid();else{showOfferFeedback(result);renderMarket();}
});
$("bidDialog").addEventListener("close",()=>{bidTarget=null;});
$("bidForm").addEventListener("submit",ev=>{
 ev.preventDefault();
 if(bidTarget===null)return;
 const amount=Number($("bidAmount").value);
 const result=buy(bidTarget,amount);
 if(result.ok){closeBid();}else{showOfferFeedback(result);renderMarket();}
});
$("playOne").addEventListener("click",()=>advance(1));
$("playFive").addEventListener("click",()=>advance(5));
$("playSeason").addEventListener("click",()=>advance(leagueRounds()));
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