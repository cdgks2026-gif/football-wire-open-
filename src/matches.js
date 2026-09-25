const SEASON=process.env.FOOTBALL_SEASON||"2026-27";
const BASE="https://raw.githubusercontent.com/openfootball/football.json/master";
const LEAGUES={
  epl:{name:"英超",file:"en.1.json"},
  laliga:{name:"西甲",file:"es.1.json"},
  seriea:{name:"意甲",file:"it.1.json"},
  bundesliga:{name:"德甲",file:"de.1.json"},
  ligue1:{name:"法甲",file:"fr.1.json"}
};
let cache={at:0,data:{}};
const TTL=6*3600_000;

const TEAM_ZH={
  // 英超
  "AFC Bournemouth":"伯恩茅斯","Arsenal FC":"阿森纳","Aston Villa FC":"维拉","Brentford FC":"布伦特福德","Brighton & Hove Albion FC":"布莱顿",
  "Chelsea FC":"切尔西","Coventry City FC":"考文垂","Crystal Palace FC":"水晶宫","Everton FC":"埃弗顿","Fulham FC":"富勒姆",
  "Hull City AFC":"赫尔城","Ipswich Town FC":"伊普斯维奇","Leeds United FC":"利兹联","Liverpool FC":"利物浦","Manchester City FC":"曼城",
  "Manchester United FC":"曼联","Newcastle United FC":"纽卡","Nottingham Forest FC":"诺丁汉森林","Sunderland AFC":"桑德兰","Tottenham Hotspur FC":"热刺",

  // 西甲
  "Athletic Club":"毕尔巴鄂竞技","CA Osasuna":"奥萨苏纳","Club Atlético de Madrid":"马竞","Deportivo Alavés":"阿拉维斯","Elche CF":"埃尔切",
  "FC Barcelona":"巴萨","Getafe CF":"赫塔费","Levante UD":"莱万特","Málaga CF":"马拉加","RC Celta de Vigo":"塞尔塔",
  "RC Deportivo La Coruña":"拉科鲁尼亚","RCD Espanyol de Barcelona":"西班牙人","Rayo Vallecano de Madrid":"巴列卡诺","Real Betis Balompié":"贝蒂斯","Real Madrid CF":"皇马",
  "Real Racing Club de Santander":"桑坦德竞技","Real Sociedad de Fútbol":"皇家社会","Sevilla FC":"塞维利亚","Valencia CF":"瓦伦西亚","Villarreal CF":"比利亚雷亚尔",

  // 意甲
  "AC Milan":"AC米兰","AC Monza":"蒙扎","ACF Fiorentina":"佛罗伦萨","AS Roma":"罗马","Atalanta BC":"亚特兰大",
  "Bologna FC 1909":"博洛尼亚","Cagliari Calcio":"卡利亚里","Como 1907":"科莫","FC Internazionale Milano":"国米","Frosinone Calcio":"弗罗西诺内",
  "Genoa CFC":"热那亚","Juventus FC":"尤文","Parma Calcio 1913":"帕尔马","SS Lazio":"拉齐奥","SSC Napoli":"那不勒斯",
  "Torino FC":"都灵","US Lecce":"莱切","US Sassuolo Calcio":"萨索洛","Udinese Calcio":"乌迪内斯","Venezia FC":"威尼斯",

  // 德甲
  "1. FC Köln":"科隆","1. FC Union Berlin":"柏林联合","1. FSV Mainz 05":"美因茨","Bayer 04 Leverkusen":"勒沃库森","Borussia Dortmund":"多特",
  "Borussia Mönchengladbach":"门兴","Eintracht Frankfurt":"法兰克福","FC Augsburg":"奥格斯堡","FC Bayern München":"拜仁","FC Schalke 04":"沙尔克04",
  "Hamburger SV":"汉堡","RB Leipzig":"莱比锡","SC Freiburg":"弗赖堡","SC Paderborn 07":"帕德博恩","SV 07 Elversberg":"埃弗斯堡",
  "SV Werder Bremen":"不莱梅","TSG 1899 Hoffenheim":"霍芬海姆","VfB Stuttgart":"斯图加特",

  // 法甲
  "AJ Auxerre":"欧塞尔","AS Monaco FC":"摩纳哥","Angers SCO":"昂热","ES Troyes AC":"特鲁瓦","FC Lorient":"洛里昂",
  "Le Havre AC":"勒阿弗尔","Le Mans FC":"勒芒","Lille OSC":"里尔","OGC Nice":"尼斯","Olympique Lyonnais":"里昂",
  "Olympique de Marseille":"马赛","Paris FC":"巴黎FC","Paris Saint-Germain FC":"巴黎","RC Strasbourg Alsace":"斯特拉斯堡","Racing Club de Lens":"朗斯",
  "Stade Brestois 29":"布雷斯特","Stade Rennais FC 1901":"雷恩","Toulouse FC":"图卢兹"
}
export function displayTeamName(name){return TEAM_ZH[String(name||"")]||String(name||"")}

const TEAM_ALIASES=Object.fromEntries(
  Object.entries(TEAM_ZH).map(([canonical,zh])=>[canonical,[zh,canonical]])
);
Object.assign(TEAM_ALIASES,{
  "Manchester United FC":["曼联","Manchester United","Man Utd","Manchester United FC"],
  "Manchester City FC":["曼城","Manchester City","Man City","Manchester City FC"],
  "Tottenham Hotspur FC":["热刺","托特纳姆热刺","Tottenham","Spurs","Tottenham Hotspur FC"],
  "Real Madrid CF":["皇马","皇家马德里","Real Madrid","Real Madrid CF"],
  "FC Barcelona":["巴萨","巴塞罗那","Barcelona","FC Barcelona"],
  "Club Atlético de Madrid":["马竞","马德里竞技","Atletico Madrid","Atlético Madrid","Club Atlético de Madrid"],
  "FC Bayern München":["拜仁","拜仁慕尼黑","Bayern","Bayern Munich","FC Bayern München"],
  "Borussia Dortmund":["多特","多特蒙德","Dortmund","Borussia Dortmund"],
  "FC Internazionale Milano":["国米","国际米兰","Inter","Inter Milan","FC Internazionale Milano"],
  "Juventus FC":["尤文","尤文图斯","Juventus","Juventus FC"],
  "Paris Saint-Germain FC":["巴黎","巴黎圣日耳曼","PSG","Paris Saint-Germain","Paris Saint-Germain FC"]
})
function scoreFt(score){
  if(!score)return null;
  if(Array.isArray(score)&&score.length>=2)return score;
  if(Array.isArray(score.ft))return score.ft;
  return null;
}
export async function loadFootballData(force=false){
  if(!force&&Date.now()-cache.at<TTL&&Object.keys(cache.data).length)return cache.data;
  const data={};
  await Promise.all(Object.entries(LEAGUES).map(async([id,l])=>{
    try{
      const r=await fetch(`${BASE}/${SEASON}/${l.file}`,{signal:AbortSignal.timeout(7000)});
      if(!r.ok)return;
      const j=await r.json();
      data[id]={id,name:l.name,title:j.name,matches:(j.matches||[]).map(m=>({...m,league:id,leagueName:l.name,ft:scoreFt(m.score)}))};
    }catch(err){console.warn("[matches]",id,String(err).slice(0,120))}
  }));
  if(Object.keys(data).length){cache={at:Date.now(),data}}
  return cache.data;
}
export function detectTeams(text){
  const t=String(text||"");
  const out=[];
  for(const [canonical,aliases] of Object.entries(TEAM_ALIASES)){
    if(aliases.some(a=>t.toLowerCase().includes(a.toLowerCase())))out.push(canonical);
  }
  return out;
}
function matchDate(m){return Date.parse(`${m.date}T${m.time||"12:00"}:00Z`)}
export async function teamContext(text){
  const teams=detectTeams(text);
  if(!teams.length)return[];
  const data=await loadFootballData();
  const all=Object.values(data).flatMap(x=>x.matches||[]);
  const now=Date.now();
  return teams.slice(0,3).map(team=>{
    const ms=all.filter(m=>m.team1===team||m.team2===team).sort((a,b)=>matchDate(a)-matchDate(b));
    const previous=ms.filter(m=>matchDate(m)<=now&&m.ft).slice(-2);
    const next=ms.filter(m=>matchDate(m)>now).slice(0,2);
    return {team,previous,next};
  });
}
export async function matchesAround(date=new Date().toISOString().slice(0,10),days=3){
  const data=await loadFootballData();
  const center=Date.parse(`${date}T12:00:00Z`);
  const span=Math.max(1,Math.min(14,Number(days)||3))*86400000;
  return Object.values(data).flatMap(l=>l.matches||[])
    .filter(m=>Math.abs(matchDate(m)-center)<=span)
    .sort((a,b)=>matchDate(a)-matchDate(b));
}
export async function standings(leagueId){
  const data=await loadFootballData();
  const league=data[leagueId];
  if(!league)return[];
  const table=new Map();
  const row=t=>{
    if(!table.has(t))table.set(t,{team:t,p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0});
    return table.get(t);
  };
  for(const m of league.matches){
    if(!m.ft)continue;
    const [a,b]=m.ft,A=row(m.team1),B=row(m.team2);
    A.p++;B.p++;A.gf+=a;A.ga+=b;B.gf+=b;B.ga+=a;
    if(a>b){A.w++;B.l++;A.pts+=3}else if(a<b){B.w++;A.l++;B.pts+=3}else{A.d++;B.d++;A.pts++;B.pts++}
  }
  for(const r of table.values())r.gd=r.gf-r.ga;
  return [...table.values()].sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.team.localeCompare(b.team));
}
export function leagueOptions(){return Object.entries(LEAGUES).map(([id,x])=>({id,name:x.name}))}


export async function leaguePageData(leagueId){
  const data=await loadFootballData();
  const league=data[leagueId];
  if(!league)return null;
  const table=await standings(leagueId);
  const now=Date.now();
  const matches=[...(league.matches||[])].sort((a,b)=>matchDate(a)-matchDate(b));
  const recent=matches.filter(m=>matchDate(m)<=now&&m.ft).slice(-10).reverse();
  const upcoming=matches.filter(m=>matchDate(m)>now).slice(0,12);
  return {id:leagueId,name:league.name,title:league.title,table,recent,upcoming};
}
export async function matchByKey(key){
  const data=await loadFootballData();
  const all=Object.values(data).flatMap(x=>x.matches||[]);
  let raw=String(key||"");
  try{raw=decodeURIComponent(raw)}catch{}
  return all.find(m=>[m.league,m.date,m.team1,m.team2].join("|")===raw)||null;
}
export function matchKey(m){
  return encodeURIComponent([m.league,m.date,m.team1,m.team2].join("|"));
}
