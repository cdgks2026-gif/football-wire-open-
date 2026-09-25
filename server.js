import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadSources, GROUP_META } from "./src/sources.js";
import { bootstrapSources, getRecentEntries, refreshCategory, minifluxHealth } from "./src/miniflux.js";
import { toChineseTitle, normalizeTerms, chineseRatio } from "./src/translator.js";
import { clusterLatest, category } from "./src/events.js";

const app=express();
const PORT=Number(process.env.PORT||8088);
const DATA_FILE=process.env.DATA_FILE||path.join(process.cwd(),"data","state.json");
const MAX_VISIBLE=Number(process.env.MAX_VISIBLE||250);
const ENTRY_DAYS=Number(process.env.ENTRY_DAYS||5);
const ENTRY_LIMIT=Number(process.env.ENTRY_LIMIT||240);
const FOREIGN_TRANSLATE_LIMIT=Number(process.env.FOREIGN_TRANSLATE_LIMIT||24);

fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});

function loadState(){
  try{return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"))}
  catch{return{translations:{},lastRefresh:{},latest:[],metrics:{}}}
}
let state=loadState(),bootstrap=null,syncing=false;

function saveState(){
  const tmp=`${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(state,null,2));
  fs.renameSync(tmp,DATA_FILE);
}
function idFor(v){return crypto.createHash("sha1").update(String(v)).digest("hex").slice(0,16)}

const JUNK_TITLE_RULES=[
  // 中文：比分/赛果预测、博彩、盘口、赔率、投注技巧、所谓专家推荐。
  /(?:比分|赛果|胜负|比赛|赛事|足球).{0,6}(?:预测|推荐)/i,
  /(?:预测|推荐).{0,6}(?:比分|赛果|胜负|结果)/i,
  /(?:中国足球彩票|足球彩票|体育彩票|体彩|彩票|竞彩|足彩|博彩|投注|下注|盘口|赔率|让球|大小球|串关|稳胆|红单|心水|投注技巧|投注建议|比分推荐|专家推荐|开奖|中奖|投注额|奖池)/i,
  /(?:AI|人工智能).{0,6}(?:预测|推荐)/i,
  /(?:预测首发|首发预测|预计首发|模拟首发)/i,

  // 英文：预测、投注、赔率、推荐单、预测首发。
  /\b(?:score|match|football|soccer)\s+predictions?\b/i,
  /\bpredicted\s+(?:score|result|line-?up|xi)\b/i,
  /\b(?:betting\s+tips?|best\s+bets?|betting\s+predictions?|odds|moneyline|parlay|over\s*\/\s*under)\b/i,
  /\b(?:tips?\s+and\s+predictions?|prediction\s+and\s+odds)\b/i,

  // 西/葡/意/法/德常见博彩与预测词。
  /\b(?:pron[oó]stic(?:o|os|i)|apuestas?|apostas?|palpites?|scommesse|pronostics?|paris?\s+sportifs?|wett(?:en|tipps?)|quoten)\b/i
];

function junkTitleReason(title){
  const t=String(title||"").replace(/\s+/g," ").trim();
  if(!t)return "空标题";
  for(const rule of JUNK_TITLE_RULES){
    if(rule.test(t))return rule.source;
  }
  return "";
}

const NON_FOOTBALL_RULES=[
  /(?:篮球|NBA|CBA|WNBA|EuroLeague|欧篮|男篮|女篮)/i,
  /(?:网球|ATP|WTA|温网|美网|法网|澳网|tennis)/i,
  /(?:F1|Formula\s*1|一级方程式|MotoGP|赛车)/i,
  /(?:棒球|MLB|baseball)/i,
  /(?:美式橄榄球|NFL|rugby|橄榄球)/i,
  /(?:板球|cricket)/i,
  /(?:高尔夫|golf)/i,
  /(?:斯诺克|snooker)/i,
  /(?:排球|volleyball)/i,
  /(?:羽毛球|badminton)/i,
  /(?:乒乓球|table\s*tennis)/i,
  /(?:冰球|NHL|hockey)/i,
  /(?:电竞|电子竞技|League\s+of\s+Legends|Valorant|Dota\s*2|CS2)/i
];

const FOOTBALL_ANCHORS=[
  /(?:足球|英超|西甲|意甲|德甲|法甲|欧冠|欧联|欧协联|世界杯|欧洲杯|欧国联|美洲杯|世俱杯|足总杯|联赛杯|国王杯|意大利杯|德国杯)/i,
  /(?:转会|加盟|租借|续约|签约|报价|体检|主帅|教练|门将|后卫|中场|前锋|进球|助攻|红牌|黄牌|点球|越位|VAR|伤停|复出|首发|替补|阵容|国家队|俱乐部)/i,
  /\b(?:football|soccer|premier\s+league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|champions\s+league|europa\s+league|world\s+cup|uefa|fifa|goal|transfer|manager|coach|striker|midfielder|defender|goalkeeper)\b/i,
  /(?:曼联|曼城|利物浦|阿森纳|切尔西|热刺|皇家马德里|皇马|巴塞罗那|巴萨|马德里竞技|马竞|拜仁|多特蒙德|巴黎圣日耳曼|巴黎|国际米兰|国米|AC米兰|尤文图斯|那不勒斯)/i,
  /(?:姆巴佩|亚马尔|哈兰德|梅西|C罗|罗纳尔多|贝林厄姆|维尼修斯|萨拉赫|凯恩|帕尔默|赖斯|拉什福德|梅努|图赫尔|瓜迪奥拉|阿尔特塔|斯洛特|德泽尔比)/i
];

function isExplicitFootballSource(meta){
  const n=String(meta?.name||"");
  return /懂球帝|足球|罗马诺|奥恩斯坦|迪马济奥|普莱滕贝格|莫雷托|雅各布斯|国际足联|欧足联|豪门官方|五大联赛官方|路透社足球|天空体育足球|广播公司足球/.test(n);
}

function footballOnlyReason(title,meta){
  const t=String(title||"").replace(/\s+/g," ").trim();
  if(!t)return "空标题";
  for(const rule of NON_FOOTBALL_RULES){
    if(rule.test(t))return "非足球:"+rule.source;
  }
  if(isExplicitFootballSource(meta))return "";
  if(FOOTBALL_ANCHORS.some((rule)=>rule.test(t)))return "";
  return "缺少足球锚点";
}


const SOURCE_REPUTATION_RULES=[
  [/Reuters|路透/i,100],
  [/BBC|英国广播公司/i,97],
  [/The Athletic|竞技体育网/i,96],
  [/Sky Sports|天空体育/i,95],
  [/The Guardian|卫报/i,93],
  [/FIFA|国际足联|UEFA|欧足联/i,99],
  [/David Ornstein|奥恩斯坦/i,97],
  [/Fabrizio Romano|罗马诺/i,96],
  [/L.?Équipe|队报/i,92],
  [/Kicker/i,91],
  [/RMC Sport/i,89],
  [/Gazzetta/i,88],
  [/Marca/i,88],
  [/AS\.com|Diario AS|\bAS\b/i,85],
  [/Mundo Deportivo/i,84],
  [/SPORT\.es|Sport/i,82],
  [/Di Marzio|迪马济奥/i,91],
  [/Plettenberg|普莱滕贝格/i,90],
  [/Moretto|莫雷托/i,89],
  [/Ben Jacobs|雅各布斯/i,85],
  [/懂球帝/i,78],
  [/腾讯|Tencent/i,74],
  [/新浪|Sina/i,72],
  [/虎扑|Hupu/i,70],
  [/搜狐|Sohu/i,65]
];


function canonicalSourceName(name){
  const n=String(name||"").trim();
  if(!n)return "";
  const rules=[
    [/^懂球帝(?:[·｜|\s].*)?$/i,"懂球帝"],
    [/^虎扑(?:足球)?$/i,"虎扑"],
    [/Reuters|路透/i,"Reuters"],
    [/BBC(?: Sport| Football)?|英国广播公司/i,"BBC"],
    [/Sky Sports|天空体育/i,"Sky Sports"],
    [/The Athletic|竞技体育网/i,"The Athletic"],
    [/The Guardian|卫报/i,"The Guardian"],
    [/Fabrizio Romano|罗马诺/i,"Fabrizio Romano"],
    [/David Ornstein|奥恩斯坦/i,"David Ornstein"],
    [/Gianluca Di Marzio|Di Marzio|迪马济奥/i,"Gianluca Di Marzio"],
    [/Florian Plettenberg|Plettenberg|普莱滕贝格/i,"Florian Plettenberg"],
    [/Matteo Moretto|Moretto|莫雷托/i,"Matteo Moretto"],
    [/Ben Jacobs|雅各布斯/i,"Ben Jacobs"],
    [/L.?Équipe|队报/i,"L'Équipe"],
    [/RMC Sport/i,"RMC Sport"],
    [/Kicker/i,"Kicker"],
    [/La Gazzetta|Gazzetta/i,"La Gazzetta dello Sport"],
    [/Mundo Deportivo/i,"Mundo Deportivo"],
    [/Diario AS|AS\.com|^AS$/i,"AS"],
    [/Marca/i,"Marca"],
    [/SPORT\.es|^Sport$/i,"SPORT"],
    [/FIFA|国际足联/i,"FIFA"],
    [/UEFA|欧足联/i,"UEFA"]
  ];
  for(const [rule,label] of rules){
    if(rule.test(n))return label;
  }
  return n
    .replace(/\s+(Football|Soccer|Sport|Sports)$/i,"")
    .replace(/(?:·|｜|\|)\s*(头条|国际|英超|西甲|意甲|德甲|法甲|足球).*$/i,"")
    .trim();
}

function sourceReputation(name,tier){
  const n=String(name||"");
  for(const [rule,score] of SOURCE_REPUTATION_RULES){
    if(rule.test(n))return score;
  }
  if(tier==="官方")return 98;
  if(tier==="转会专家")return 88;
  if(tier==="国际媒体")return 78;
  if(tier==="中文媒体")return 68;
  return 55;
}

function extractPublisher(rawTitle,meta){
  const raw=String(rawTitle||"").replace(/\s+/g," ").trim();
  if(meta?.type==="gnews"){
    const m=raw.match(/\s+[-–—]\s+([^–—-]{2,80})$/);
    if(m){
      const publisher=m[1].trim();
      const body=raw.slice(0,m.index).trim();
      if(body && publisher && !/^(football|soccer|news|sport)$/i.test(publisher)){
        return {title:body,source:publisher,verified:true};
      }
    }
    return {title:raw,source:meta.name,verified:false};
  }
  return {title:raw,source:meta.name,verified:true};
}

function importanceScore(item){
  let score=0;
  const bestSourceScore=item.sourceDetails?.[0]?.score||item.sourceScore||0;
  if(bestSourceScore>=95)score+=3;
  else if(bestSourceScore>=88)score+=2;
  else if(bestSourceScore>=78)score+=1;
  if(item.tier==="官方")score+=5;
  if(item.tier==="转会专家")score+=4;
  if(item.tier==="国际媒体")score+=2;
  if((item.confirmations||0)>=2)score+=3;
  const t=item.title||"";
  if(/官宣|官方确认|Here we go|达成协议|加盟|转会|续约|解约|下课|任命/.test(t))score+=3;
  if(/伤停|手术|重伤|赛季报销|复出|禁赛|红牌|处罚/.test(t))score+=2;
  if(/世界杯|欧冠|英超|西甲|意甲|德甲|法甲|国家队/.test(t))score+=1;
  return score;
}

function metaForEntry(entry){
  return bootstrap?.sourceByFeedId?.[entry.feed?.id]||{
    name:entry.feed?.title||"未知来源",
    tier:"国际媒体",
    group:"media"
  };
}
function makeItem(entry,title,meta,sourceInfo){
  const rawSource=sourceInfo?.source||meta.name;
  const source=canonicalSourceName(rawSource);
  return {
    id:idFor(entry.id||`${entry.title}|${entry.published_at}`),
    minifluxId:entry.id,
    title,
    source,
    sourceVerified:sourceInfo?.verified!==false,
    sourceScore:sourceReputation(source,meta.tier),
    tier:meta.tier,
    group:meta.group,
    publishedAt:entry.published_at||entry.created_at||new Date().toISOString(),
    category:category(title)
  };
}
function publishProcessed(processed,extraMetrics={}){
  const allClusters=clusterLatest(processed);
  const clustered=allClusters
    .filter((x)=>(x.confirmations||0)>=2)
    .sort((a,b)=>{
      const ta=Date.parse(a.publishedAt),tb=Date.parse(b.publishedAt);
      if(tb!==ta)return tb-ta;
      return (b.sourceDetails?.[0]?.score||0)-(a.sourceDetails?.[0]?.score||0);
    })
    .slice(0,MAX_VISIBLE);
  const unconfirmedFiltered=Math.max(0,allClusters.length-clustered.length);

  state.latest=clustered.map((x)=>({...x,importance:importanceScore(x)}));
  state.metrics={
    ...(state.metrics||{}),
    rawEntries:extraMetrics.rawEntries??state.metrics?.rawEntries??0,
    visibleEvents:clustered.length,
    translatedNow:extraMetrics.translatedNow??0,
    hiddenForeign:extraMetrics.hiddenForeign??0,
    translationCache:Object.keys(state.translations||{}).length,
    junkFiltered:extraMetrics.junkFiltered??state.metrics?.junkFiltered??0,
    nonFootballFiltered:extraMetrics.nonFootballFiltered??state.metrics?.nonFootballFiltered??0,
    unconfirmedFiltered,
    confirmationRule:"至少2个独立出处",
    phase:extraMetrics.phase||"ready",
    syncedAt:new Date().toISOString()
  };
  saveState();
  console.log("[sync]",JSON.stringify(state.metrics));
}

async function setup(){
  const sources=loadSources();
  bootstrap=await bootstrapSources(sources);
  console.log(`[setup] ${sources.length} 个来源已配置；新建 ${bootstrap.created.length} 个订阅`);
  await refreshDue(true);
  setTimeout(()=>syncEntries(),5000);
}

async function refreshDue(force=false){
  if(!bootstrap)return;
  const now=Date.now();
  for(const [group,meta] of Object.entries(GROUP_META)){
    const c=bootstrap.categories[group];
    if(!c)continue;
    const last=Number(state.lastRefresh[group]||0);
    if(!force && now-last<meta.refreshSeconds*1000)continue;
    try{
      await refreshCategory(c.id);
      state.lastRefresh[group]=now;
    }catch(err){
      console.error("[refresh]",group,String(err));
    }
  }
  saveState();
}

async function syncEntries(){
  if(syncing||!bootstrap)return;
  syncing=true;
  try{
    const entries=await getRecentEntries(ENTRY_DAYS,ENTRY_LIMIT);
    const processed=[];
    const foreign=[];
    let junkFiltered=0;
    let nonFootballFiltered=0;

    // 第一阶段：只保留足球；再过滤预测、博彩、赔率等低质量内容。
    for(const entry of entries){
      const meta=metaForEntry(entry);
      const sourceInfo=extractPublisher(entry.title||"",meta);
      const normalized=normalizeTerms(sourceInfo.title);
      if(footballOnlyReason(normalized,meta)){
        nonFootballFiltered++;
        continue;
      }
      if(junkTitleReason(normalized)){
        junkFiltered++;
        continue;
      }
      if(chineseRatio(normalized)>=0.48){
        processed.push(makeItem(entry,normalized,meta,sourceInfo));
      }else{
        foreign.push({entry,meta,sourceInfo});
      }
    }

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow:0,
      hiddenForeign:foreign.length,
      junkFiltered,
      nonFootballFiltered,
      phase:"中文标题已就绪"
    });

    // 第二阶段：只翻译最新少量外文标题，避免首次同步拖垮免费实例。
    let translatedNow=0;
    let hiddenForeign=Math.max(0,foreign.length-FOREIGN_TRANSLATE_LIMIT);
    for(const {entry,meta,sourceInfo} of foreign.slice(0,FOREIGN_TRANSLATE_LIMIT)){
      const before=Object.keys(state.translations).length;
      const title=await toChineseTitle(sourceInfo.title,state.translations);
      if(Object.keys(state.translations).length>before)translatedNow++;
      if(!title){
        hiddenForeign++;
        continue;
      }
      if(footballOnlyReason(title,meta)){
        nonFootballFiltered++;
        continue;
      }
      if(junkTitleReason(title)){
        junkFiltered++;
        continue;
      }
      processed.push(makeItem(entry,title,meta,sourceInfo));

      // 每翻译 4 条就增量发布一次，用户不用等完整批次。
      if(translatedNow>0 && translatedNow%4===0){
        publishProcessed(processed,{
          rawEntries:entries.length,
          translatedNow,
          hiddenForeign,
          junkFiltered,
          nonFootballFiltered,
          phase:"外文标题增量翻译中"
        });
      }
    }

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow,
      hiddenForeign,
      junkFiltered,
      nonFootballFiltered,
      phase:"完成"
    });
  }catch(err){
    console.error("[sync]",String(err));
    state.metrics={
      ...(state.metrics||{}),
      phase:"同步失败",
      lastError:String(err),
      syncedAt:new Date().toISOString()
    };
    saveState();
  }finally{
    syncing=false;
  }
}


function escHtml(value){
  return String(value??"").replace(/[&<>"']/g,(ch)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
}
function agoText(value){
  const t=Date.parse(value||"");
  if(!Number.isFinite(t))return "";
  const m=Math.max(0,Math.round((Date.now()-t)/60000));
  if(m<60)return `${m}分钟前`;
  const h=Math.round(m/60);
  if(h<24)return `${h}小时前`;
  return `${Math.round(h/24)}天前`;
}
function filteredItems(req){
  const q=String(req.query.q||"").trim();
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  let items=state.latest||[];
  if(tier!=="全部")items=items.filter((x)=>x.tier===tier);
  if(cat!=="全部")items=items.filter((x)=>x.category===cat);
  if(q)items=items.filter((x)=>`${x.title} ${(x.sources||[]).join(" ")} ${x.source}`.includes(q));
  if(hours>0)items=items.filter((x)=>Date.now()-Date.parse(x.publishedAt)<=hours*3600_000);
  if(important)items=items.filter((x)=>(x.importance||0)>=4);
  return items;
}

app.get("/",(req,res)=>{
  const items=filteredItems(req);
  const q=String(req.query.q||"");
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  const tiers=["全部","官方","转会专家","国际媒体","中文媒体"];
  const cats=["全部","转会","球星","伤停","比赛","国家队","争议","趣闻","教练","综合"];

  const rows=items.map((x)=>{
    const sourceDetails=(x.sourceDetails||[]).slice(0,4);
    const sourceLine=sourceDetails.map((src,i)=>`${i+1}. ${escHtml(src.name)}`).join(" · ");
    return `
    <article class="item">
      <div class="meta">
        <span>${escHtml(x.category)}</span>
        <span>${x.confirmations}个独立出处确认</span>
        <span>${escHtml(agoText(x.publishedAt))}</span>
      </div>
      <div class="title">${escHtml(x.title)}</div>
      <div class="sources"><b>出处：</b>${sourceLine}</div>
    </article>`;
  }).join("");

  const page=`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="30">
<title>露白足球｜全球足球中文快讯</title>
<style>
*{box-sizing:border-box}
:root{--bg:#06100c;--panel:#0c1813;--line:#233b31;--text:#f3f8f5;--muted:#91a59c;--green:#63e7a1}
body{margin:0;background:#06100c;color:var(--text);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{width:min(980px,calc(100% - 24px));margin:auto;padding-bottom:36px}
header{padding:24px 0 14px}
h1{margin:0;font-size:36px;letter-spacing:-1px}
.sub{margin-top:8px;color:var(--muted);font-size:13px;line-height:1.6}
form{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:#06100cf2;padding:10px 0;border-bottom:1px solid #14251e;z-index:5}
input,select,button{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:9px 10px;font:inherit}
input{flex:1;min-width:180px}
.important{display:flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:8px 10px;font-size:13px;white-space:nowrap}
.important input{min-width:0;flex:none}
button{background:var(--green);color:#052014;font-weight:800}
.status{padding:12px 0;color:var(--muted);font-size:12px}
.list{display:flex;flex-direction:column;gap:8px}
.item{border:1px solid var(--line);border-radius:13px;background:var(--panel);padding:13px 14px}
.meta{display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:10.5px;margin-bottom:6px}
.meta span{border:1px solid #345546;border-radius:999px;padding:3px 6px}
.title{font-size:17px;line-height:1.5;font-weight:800}
.sources{margin-top:8px;color:#b9c8c1;font-size:12px;line-height:1.6}
.sources b{color:var(--green)}
.empty{padding:60px 20px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
@media(max-width:700px){h1{font-size:30px}.title{font-size:16px}form{position:static}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>露白足球</h1>
<div class="sub">纯足球 · 至少2个独立媒体交叉确认 · 出处按知名度排序 · 每30秒自动刷新</div>
</header>
<form method="get" action="/">
<input name="q" value="${escHtml(q)}" placeholder="搜索球员、球队、教练">
<select name="tier">${tiers.map(v=>`<option ${v===tier?"selected":""}>${v}</option>`).join("")}</select>
<select name="category">${cats.map(v=>`<option ${v===cat?"selected":""}>${v}</option>`).join("")}</select>
<select name="hours">
<option value="0" ${hours? "":"selected"}>全部时间</option>
<option value="1" ${hours===1?"selected":""}>最近1小时</option>
<option value="3" ${hours===3?"selected":""}>最近3小时</option>
<option value="6" ${hours===6?"selected":""}>最近6小时</option>
<option value="24" ${hours===24?"selected":""}>最近24小时</option>
</select>
<label class="important"><input type="checkbox" name="important" value="1" ${important?"checked":""}> 只看重要新闻</label>
<button type="submit">筛选</button>
</form>
<div class="status">当前 ${items.length} 条 · 仅显示≥2个独立出处确认 · 未获双源确认已隐藏 ${state.metrics?.unconfirmedFiltered||0} 条 · 非足球 ${state.metrics?.nonFootballFiltered||0} 条 · 垃圾信息 ${state.metrics?.junkFiltered||0} 条 · ${escHtml(state.metrics?.phase||"同步中")}</div>
<main class="list">${rows||'<div class="empty">当前筛选暂无新闻。</div>'}</main>
</div>
</body>
</html>`;
  res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma","no-cache");
  res.set("Expires","0");
  res.type("html").send(page);
});

app.use(express.static("public",{etag:false,maxAge:0,setHeaders:(res)=>res.set("Cache-Control","no-store")}));


app.get("/api/news",(req,res)=>{
  const q=String(req.query.q||"").trim();
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";

  let items=state.latest||[];
  if(tier!=="全部")items=items.filter((x)=>x.tier===tier);
  if(cat!=="全部")items=items.filter((x)=>x.category===cat);
  if(q)items=items.filter((x)=>`${x.title} ${x.source}`.includes(q));
  if(hours>0)items=items.filter((x)=>Date.now()-Date.parse(x.publishedAt)<=hours*3600_000);
  if(important)items=items.filter((x)=>(x.importance||0)>=4);

  res.set("Cache-Control","no-store");
  res.json({
    items,
    count:items.length,
    metrics:state.metrics||{},
    serverTime:new Date().toISOString()
  });
});

app.get("/api/status",async(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({
    ok:true,
    miniflux:await minifluxHealth(),
    sourceCount:bootstrap?Object.keys(bootstrap.sourceByFeedId).length:0,
    newsCount:(state.latest||[]).length,
    metrics:state.metrics||{}
  });
});

app.post("/api/refresh",async(_req,res)=>{
  await refreshDue(true);
  setTimeout(()=>syncEntries(),5000);
  res.status(202).json({ok:true});
});

app.listen(PORT,()=>console.log(`[web] http://localhost:${PORT}`));
setup().catch((err)=>console.error("[setup fatal]",err));
setInterval(()=>refreshDue(false),15000).unref();
setInterval(()=>syncEntries(),30000).unref();
