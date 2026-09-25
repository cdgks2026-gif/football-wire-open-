import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadSources, GROUP_META } from "./src/sources.js";
import { bootstrapSources, getRecentEntriesByCategory, refreshCategory, minifluxHealth } from "./src/miniflux.js";
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

const GENERIC_HEADLINE_RULES=[
  /^(?:国际足球|国际足坛|国际足坛新闻|国际足球新闻|国内足球|中国足球|足球|足球新闻|足坛|足坛新闻)$/i,
  /^(?:英超|西甲|意甲|德甲|法甲|欧冠|欧联|欧协联|世界杯|欧洲杯|美洲杯|国家队)$/i,
  /^(?:转会|转会新闻|足球转会|比赛|赛事|体育|体育新闻|国际体育|更多|最新|头条)$/i,
  /^(?:football|soccer|football news|soccer news|international football|sports|sports news)$/i
];

const EVENT_SIGNAL_RULES=[
  /(?:官宣|宣布|确认|签约|加盟|离队|续约|租借|报价|谈判|协议|达成|拒绝|接触|体检|合同|薪资|转会费)/i,
  /(?:受伤|伤缺|缺席|复出|手术|停赛|禁赛|红牌|黄牌|处罚|调查|起诉|逮捕)/i,
  /(?:进球|助攻|绝杀|逆转|击败|战胜|战平|输给|首发|替补|名单|入选|召入|退出)/i,
  /(?:下课|解雇|任命|执教|采访|表示|回应|否认|承认|批评|透露|曝|消息称)/i,
  /(?:恋情|约会|结婚|分手|夜店|派对|度假|豪宅|豪车|更衣室|训练)/i,
  /\b(?:signs?|signed|joins?|joined|leaves?|left|renew(?:s|ed)?|loan|bid|deal|agreement|contract|transfer|medical)\b/i,
  /\b(?:injur(?:y|ed)|miss(?:es|ed)?|return(?:s|ed)?|suspend(?:ed|sion)?|ban(?:ned)?|red card|investigation)\b/i,
  /\b(?:scores?|scored|assist(?:s|ed)?|wins?|won|draws?|line-?up|squad|called up|withdraws?)\b/i,
  /\b(?:sacked|appointed|manager|coach|says?|said|claims?|reveals?|denies?|admits?)\b/i
];

function stripHtml(value){
  return String(value||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g," ")
    .trim();
}

function entryBodyText(entry){
  return stripHtml(entry?.content||entry?.summary||entry?.description||"").slice(0,3500);
}

function lowInformationReason(title,entry){
  const t=String(title||"").replace(/\s+/g," ").trim();
  if(!t)return "空标题";
  if(GENERIC_HEADLINE_RULES.some((rule)=>rule.test(t)))return "栏目/分类标题";
  const body=entryBodyText(entry);
  const combined=`${t} ${body}`;
  const hasEvent=EVENT_SIGNAL_RULES.some((rule)=>rule.test(combined));

  // 极短标题必须由正文提供明确事件信息，否则不是可展示新闻。
  const visibleLen=t.replace(/[^\u4e00-\u9fa5a-z0-9]/gi,"").length;
  if(visibleLen<7 && !hasEvent)return "短标题且正文无具体事件";

  // 正文存在时，标题与正文都没有任何事件动作，视为栏目页、导航页或低信息内容。
  if(body.length>=40 && !hasEvent)return "正文无具体新闻事件";
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
  [/懂球帝/i,83],
  [/腾讯|Tencent/i,74],
  [/新浪|Sina/i,72],
  [/虎扑|Hupu/i,81],
  [/搜狐|Sohu/i,65]
];


function canonicalSourceName(name){
  const n=String(name||"").trim();
  if(!n)return "";
  const rules=[
    [/^懂球帝(?:[·｜|\s].*)?$/i,"懂球帝"],
    [/虎扑|Hupu/i,"虎扑"],
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


function explicitExclusive(title){
  const t=String(title||"");
  return /(?:^|[：:\s【[(])(?:独家|独家消息|独家报道|EXCLUSIVE|EXCL|SCOOP)(?:[：:\s】)\]]|$)/i.test(t);
}


function directPlatformSource(item){
  const names=(item.sourceDetails||[]).map((x)=>x.name);
  if(names.includes("懂球帝"))return "懂球帝";
  if(names.includes("虎扑"))return "虎扑";
  return "";
}

function credibilityFor(item){
  const details=item.sourceDetails||[];
  const best=details[0]?.score||item.sourceScore||0;
  const avg=details.length?details.reduce((a,b)=>a+(b.score||0),0)/details.length:best;

  if((item.confirmations||0)>=3 && best>=88) return {score:98,label:"已核实"};
  if((item.confirmations||0)>=2 && best>=92 && avg>=80) return {score:95,label:"已核实"};
  if((item.confirmations||0)>=2 && best>=85) return {score:91,label:"交叉确认"};
  if((item.confirmations||0)>=2) return {score:86,label:"交叉确认"};
  if((item.confirmations||0)===1 && best>=92) return {score:84,label:"权威单源"};
  if((item.confirmations||0)===1 && directPlatformSource(item)) return {score:82,label:"平台直发"};
  return {score:0,label:""};
}

function heatScore(item){
  let score=0;
  const hours=Math.max(0,(Date.now()-Date.parse(item.publishedAt||0))/3600000);
  score+=Math.max(0,30-Math.min(30,hours*2));
  score+=Math.min(30,(item.confirmations||0)*9);
  const best=item.sourceDetails?.[0]?.score||item.sourceScore||0;
  score+=Math.max(0,(best-65)*0.45);

  const t=item.title||"";
  if(/官宣|官方确认|达成协议|Here we go|签约|加盟|下课|任命|重伤|赛季报销|禁赛|决赛|夺冠|红牌|VAR|冲突/.test(t)) score+=12;
  if(/姆巴佩|亚马尔|哈兰德|梅西|C罗|贝林厄姆|维尼修斯|萨拉赫|曼联|曼城|利物浦|阿森纳|切尔西|热刺|皇马|皇家马德里|巴萨|巴塞罗那|拜仁|巴黎圣日耳曼/.test(t)) score+=7;
  if(item.exclusive)score+=6;
  return Math.round(score);
}

function rankScore(item){
  const confirmations=item.confirmations||0;
  const best=item.sourceDetails?.[0]?.score||item.sourceScore||0;
  const platform=directPlatformSource(item);

  // 硬优先级：官方/顶级权威 > 多源确认 > 权威单源 > 懂球帝/虎扑直发。
  let band=0;
  if(item.tier==="官方" || best>=98) band=4;
  else if(confirmations>=2) band=3;
  else if(best>=92) band=2;
  else if(platform) band=1;

  const platformTie=platform==="懂球帝"?2:platform==="虎扑"?1:0;
  return band*10000+(item.credibilityScore||0)*10+(item.heat||0)+platformTie;
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


function isMatchReport(item){
  const text=`${item?.title||""} ${item?.contentExcerpt||""}`;
  return /(?:^|[【[])(?:战报|全场|半场|完场|赛果)(?:】|\]|[:：\s])/i.test(text)
    || /\b\d{1,2}\s*[-:：]\s*\d{1,2}\b/.test(text)
    || /(?:比分为|最终比分|全场比分|半场比分)/i.test(text);
}

function parseHupuPublishedAt(html){
  const patterns=[
    /"publishTime"\s*:\s*"?([0-9]{10,13})"?/i,
    /"publish_time"\s*:\s*"?([0-9]{10,13})"?/i,
    /"createTime"\s*:\s*"?([0-9]{10,13})"?/i,
    /"createdAt"\s*:\s*"?([0-9]{10,13})"?/i,
    /datetime=["']([^"']{10,40})["']/i
  ];
  for(const p of patterns){
    const m=String(html||"").match(p);
    if(!m)continue;
    if(/^\d{10,13}$/.test(m[1])){
      let n=Number(m[1]);
      if(n<1e12)n*=1000;
      const d=new Date(n);
      if(Number.isFinite(d.getTime()))return d.toISOString();
    }else{
      const n=Date.parse(m[1]);
      if(Number.isFinite(n))return new Date(n).toISOString();
    }
  }
  return "";
}

async function fetchHupuDirect(){
  try{
    const res=await fetch("https://m.hupu.com/soccer",{headers:{"user-agent":"Mozilla/5.0"}});
    if(!res.ok)return[];
    const html=await res.text();
    const out=[];
    const seen=new Set();
    const re=/<a[^>]+href=["']([^"']*\/bbs\/\d+\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while((m=re.exec(html)) && out.length<60){
      let title=stripHtml(m[2])
        .replace(/\d{1,7}\s*置顶\s*$/,"")
        .replace(/\d{1,7}\s*$/,"")
        .trim();
      if(!title || title.length<6 || seen.has(title))continue;
      seen.add(title);
      const link=m[1].startsWith("http")?m[1]:`https://m.hupu.com${m[1]}`;
      out.push({
        id:`hupu-direct-${idFor(link)}`,
        title,
        content:title,
        published_at:new Date().toISOString(),
        created_at:new Date().toISOString(),
        _meta:{name:"虎扑",tier:"中文媒体",group:"cn",type:"direct"},
        _timeReliable:false,
        url:link
      });
    }

    state.hupuTimes=state.hupuTimes||{};
    const toResolve=out.filter((x)=>!state.hupuTimes[x.url]).slice(0,24);
    await Promise.all(toResolve.map(async(item)=>{
      try{
        const r=await fetch(item.url,{headers:{"user-agent":"Mozilla/5.0"}});
        if(!r.ok)return;
        const page=await r.text();
        const ts=parseHupuPublishedAt(page);
        if(ts)state.hupuTimes[item.url]=ts;
      }catch{}
    }));

    for(const item of out){
      const ts=state.hupuTimes[item.url];
      if(ts){
        item.published_at=ts;
        item.created_at=ts;
        item._timeReliable=true;
      }
    }
    return out;
  }catch(err){
    console.error("[hupu direct]",String(err));
    return[];
  }
}

function metaForEntry(entry){
  if(entry?._meta)return entry._meta;
  return bootstrap?.sourceByFeedId?.[entry.feed?.id]||null;
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
    exclusive:explicitExclusive(entry.title||"")||explicitExclusive(title),
    timeReliable:entry?._timeReliable!==false,
    tier:meta.tier,
    group:meta.group,
    publishedAt:entry.published_at||entry.created_at||new Date().toISOString(),
    category:category(title),
    contentExcerpt:entryBodyText(entry).slice(0,600)
  };
}
function publishProcessed(processed,extraMetrics={}){
  const allClusters=clusterLatest(processed).map((x)=>{
    const exclusive=Boolean(x.platformExclusiveSource);
    const base={...x,exclusive,isMatchReport:isMatchReport(x)};
    const credibility=credibilityFor(base);
    const heat=heatScore(base);
    return {
      ...base,
      credibilityScore:credibility.score,
      credibilityLabel:credibility.label,
      heat,
      importance:importanceScore(base)
    };
  });

  // 主新闻：多源可进；顶级权威单源可进；懂球帝/虎扑平台直发也直接进入。
  const eligible=allClusters.filter((x)=>{
    if(x.isMatchReport)return false;
    const confirmations=x.confirmations||0;
    const best=x.sourceDetails?.[0]?.score||x.sourceScore||0;
    if(confirmations>=2)return true;
    if(confirmations===1 && best>=92)return true;
    if(confirmations===1 && directPlatformSource(x))return true;
    return false;
  });

  const rankedEligible=[...eligible]
    .sort((a,b)=>{
      const rs=rankScore(b)-rankScore(a);
      if(rs!==0)return rs;
      return Date.parse(b.publishedAt)-Date.parse(a.publishedAt);
    });

  const clustered=rankedEligible.slice(0,MAX_VISIBLE);

  // 战报只进入战报栏，不进入全部/官方/独家/媒体等其他栏目。
  const reportLatest=allClusters
    .filter((x)=>x.isMatchReport)
    .filter((x)=>{
      const best=x.sourceDetails?.[0]?.score||x.sourceScore||0;
      return (x.confirmations||0)>=2 || best>=92 || directPlatformSource(x) || (x.tiers||[]).includes("官方");
    })
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
    .slice(0,180);

  const unconfirmedFiltered=Math.max(0,allClusters.length-eligible.length);
  const exclusiveVisible=clustered.filter((x)=>x.exclusive).length;
  const platformDirectVisible=clustered.filter((x)=>(x.confirmations||0)===1 && directPlatformSource(x)).length;

  state.latest=clustered;
  state.allEligible=rankedEligible.slice(0,800);
  state.reportLatest=reportLatest;
  const channelCounts=Object.fromEntries(CHANNELS.map((ch)=>[ch.id,channelCount(ch.id)]));
  state.metrics={
    ...(state.metrics||{}),
    rawEntries:extraMetrics.rawEntries??state.metrics?.rawEntries??0,
    visibleEvents:clustered.length,
    translatedNow:extraMetrics.translatedNow??0,
    hiddenForeign:extraMetrics.hiddenForeign??0,
    translationCache:Object.keys(state.translations||{}).length,
    junkFiltered:extraMetrics.junkFiltered??state.metrics?.junkFiltered??0,
    nonFootballFiltered:extraMetrics.nonFootballFiltered??state.metrics?.nonFootballFiltered??0,
    lowInformationFiltered:extraMetrics.lowInformationFiltered??state.metrics?.lowInformationFiltered??0,
    unconfirmedFiltered,
    exclusiveVisible,
    platformDirectVisible,
    reportVisible:(state.reportLatest||[]).length,
    channelCounts,
    confirmationRule:"主新闻：多源、顶级权威单源、懂球帝/虎扑直发均可进入；战报独立隔离；虎扑与懂球帝同事件按最早发布时间判独家",
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
    const categoryBudgets={cn:450,official:260,fast:320,media:520};
    const grouped=await Promise.all(Object.entries(categoryBudgets).map(async([group,limit])=>{
      const cat=bootstrap?.categories?.[group];
      if(!cat)return[];
      try{return await getRecentEntriesByCategory(cat.id,ENTRY_DAYS,limit)}
      catch(err){console.error("[entries]",group,String(err));return[]}
    }));
    const minifluxEntries=grouped.flat();
    const directHupu=await fetchHupuDirect();
    const entries=[...minifluxEntries,...directHupu];
    const processed=[];
    const foreign=[];
    let junkFiltered=0;
    let nonFootballFiltered=0;
    let lowInformationFiltered=0;

    // 第一阶段：只保留足球；再过滤预测、博彩、赔率等低质量内容。
    for(const entry of entries){
      const meta=metaForEntry(entry);
      if(!meta)continue;
      const sourceInfo=extractPublisher(entry.title||"",meta);
      const normalized=normalizeTerms(sourceInfo.title);
      const lowInfo=lowInformationReason(normalized,entry);
      if(lowInfo){
        lowInformationFiltered++;
        continue;
      }
      if(footballOnlyReason(`${normalized} ${entryBodyText(entry)}`,meta)){
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
      lowInformationFiltered,
      phase:"中文标题已就绪"
    });

    // 第二阶段：只翻译最新少量外文标题，避免首次同步拖垮免费实例。
    let translatedNow=0;
    let hiddenForeign=Math.max(0,foreign.length-FOREIGN_TRANSLATE_LIMIT);
    const prioritizedForeign=[...foreign].sort((a,b)=>{
      const weight=(x)=>{
        if(x.meta?.tier==="官方")return 1000;
        if(x.meta?.tier==="转会专家")return 900;
        const source=canonicalSourceName(x.sourceInfo?.source||x.meta?.name);
        return 500+sourceReputation(source,x.meta?.tier);
      };
      const diff=weight(b)-weight(a);
      if(diff!==0)return diff;
      return Date.parse(b.entry?.published_at||b.entry?.created_at||0)-Date.parse(a.entry?.published_at||a.entry?.created_at||0);
    });
    for(const {entry,meta,sourceInfo} of prioritizedForeign.slice(0,FOREIGN_TRANSLATE_LIMIT)){
      const before=Object.keys(state.translations).length;
      const title=await toChineseTitle(sourceInfo.title,state.translations);
      if(Object.keys(state.translations).length>before)translatedNow++;
      if(!title){
        hiddenForeign++;
        continue;
      }
      const lowInfo=lowInformationReason(title,entry);
      if(lowInfo){
        lowInformationFiltered++;
        continue;
      }
      if(footballOnlyReason(`${title} ${entryBodyText(entry)}`,meta)){
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
      lowInformationFiltered,
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

const CHANNELS=[
  {id:"main",label:"全部"},
  {id:"official",label:"官方"},
  {id:"exclusive",label:"独家"},
  {id:"verified",label:"多源核实"},
  {id:"authority",label:"权威媒体"},
  {id:"expert",label:"转会专家"},
  {id:"dqd",label:"懂球帝"},
  {id:"hupu",label:"虎扑"},
  {id:"report",label:"战报"}
];

function hasNamedSource(item,name){
  return (item.sourceDetails||[]).some((x)=>x.name===name);
}

function channelMatches(item,section){
  const tiers=item.tiers||[item.tier].filter(Boolean);
  const best=item.sourceDetails?.[0]?.score||item.sourceScore||0;
  if(section==="main")return true;
  if(section==="official")return tiers.includes("官方") || item.tier==="官方";
  if(section==="exclusive")return item.exclusive===true;
  if(section==="verified")return (item.confirmations||0)>=2;
  if(section==="authority")return best>=92 || tiers.includes("官方");
  if(section==="expert")return tiers.includes("转会专家");
  if(section==="dqd")return hasNamedSource(item,"懂球帝");
  if(section==="hupu")return hasNamedSource(item,"虎扑");
  if(section==="report")return item.isMatchReport===true;
  return true;
}

function channelCount(section){
  if(section==="main")return (state.latest||[]).length;
  if(section==="report")return (state.reportLatest||[]).length;
  return (state.allEligible||state.latest||[]).filter((x)=>channelMatches(x,section)).length;
}

function filteredItems(req){
  const q=String(req.query.q||"").trim();
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  const section=String(req.query.section||"main");

  let items;
  if(section==="main"){
    items=state.latest||[];
  }else if(section==="report"){
    items=state.reportLatest||[];
  }else{
    items=(state.allEligible||state.latest||[]).filter((x)=>channelMatches(x,section));
  }

  if(tier!=="全部")items=items.filter((x)=>{
    const tiers=x.tiers||[x.tier].filter(Boolean);
    return tiers.includes(tier);
  });
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
  const section=String(req.query.section||"main");
  const tiers=["全部","官方","转会专家","国际媒体","中文媒体"];
  const cats=["全部","转会","球星","伤停","比赛","国家队","争议","趣闻","教练","综合"];
  const channelNav=CHANNELS.map((ch)=>`<a class="${section===ch.id?"active":""}" href="/?section=${encodeURIComponent(ch.id)}">${ch.label}<small>${channelCount(ch.id)}</small></a>`).join("");

  const rows=items.map((x)=>{
    const hot=x.heat>=58;
    const tiers=x.tiers||[x.tier].filter(Boolean);
    const badges=[];
    if(tiers.includes("官方"))badges.push('<span class="official">官方</span>');
    if(x.exclusive)badges.push('<span class="exclusive">独家</span>');
    if((x.confirmations||0)>=2)badges.push('<span class="verified">多源核实</span>');
    else if((x.sourceDetails?.[0]?.score||x.sourceScore||0)>=92)badges.push('<span class="authority">权威单源</span>');
    else if(directPlatformSource(x))badges.push('<span class="platform">平台直发</span>');
    if(hot)badges.push('<span class="hot">热门</span>');
    return `
    <article class="item">
      <div class="meta">
        <span>${escHtml(x.category)}</span>
        ${badges.join("")}
        <span>${escHtml(agoText(x.publishedAt))}</span>
      </div>
      <div class="title">${escHtml(x.title)}</div>
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
.sections{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.sections a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:13px}
.sections a small{font-size:10px;opacity:.8}
.sections a.active{color:#052014;background:var(--green);border-color:var(--green);font-weight:800}
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
.verified{border-color:#2f7656!important;color:#8cf0b8!important}
.official{border-color:#3979a8!important;color:#9fd3ff!important}
.authority{border-color:#446d90!important;color:#9bc7e8!important}
.platform{border-color:#5e685f!important;color:#c4d0c5!important}
.exclusive{border-color:#9b7732!important;color:#ffd77f!important}
.hot{border-color:#8b3b35!important;color:#ff9e91!important}
.empty{padding:60px 20px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
@media(max-width:700px){h1{font-size:30px}.title{font-size:16px}form{position:static}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>露白足球</h1>
<div class="sub">纯足球 · 多重分栏 · 官方/独家/多源可重叠 · 战报单独隔离</div>
<nav class="sections">${channelNav}</nav>
</header>
<form method="get" action="/">
<input type="hidden" name="section" value="${escHtml(section)}">
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
<div class="status">当前栏目 ${items.length} 条 · 同一新闻可跨多个栏目重复出现 · 栏目/空泛内容已过滤 ${state.metrics?.lowInformationFiltered||0} 条 · 非足球 ${state.metrics?.nonFootballFiltered||0} 条 · 垃圾信息 ${state.metrics?.junkFiltered||0} 条 · ${escHtml(state.metrics?.phase||"同步中")}</div>
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
  const section=String(req.query.section||"main");

  let items;
  if(section==="main")items=state.latest||[];
  else if(section==="report")items=state.reportLatest||[];
  else items=(state.allEligible||state.latest||[]).filter((x)=>channelMatches(x,section));
  if(tier!=="全部")items=items.filter((x)=>{
    const tiers=x.tiers||[x.tier].filter(Boolean);
    return tiers.includes(tier);
  });
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
