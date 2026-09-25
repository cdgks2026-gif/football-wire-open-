import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadSources, GROUP_META } from "./src/sources.js";
import { bootstrapSources, getRecentEntriesByCategory, getRecentEntriesByFeed, refreshCategory, minifluxHealth } from "./src/miniflux.js";
import { toChineseTitle, normalizeTerms, chineseRatio } from "./src/translator.js";
import { clusterLatest, category, eventKey } from "./src/events.js";
import { extractReadableArticle, compactArticleCache } from "./src/article.js";
import { aiEnabled, aiStatus, newAiBudget, judgeWithBudget } from "./src/ai.js";
import { initStore, storeStatus, persistStories, getStory as getStoredStory, searchStories, saveSnapshot, getSnapshot, listSnapshots, saveOverride, loadOverrides } from "./src/store.js";
import { assignStoryIds, applyEditorial, ensureEditor, editStory } from "./src/editor.js";
import { teamContext, matchesAround, standings, leagueOptions } from "./src/matches.js";
import { notifyNewImportant } from "./src/notify.js";
import { registerFeatureRoutes } from "./src/features.js";
import { maybeSendDailyDigest } from "./src/digest.js";

const app=express();
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false}));
const PORT=Number(process.env.PORT||8088);
const sseClients=new Set();
let sseSeen=new Set();
const DATA_FILE=process.env.DATA_FILE||path.join(process.cwd(),"data","state.json");
const MAX_VISIBLE=Number(process.env.MAX_VISIBLE||250);
const ENTRY_DAYS=Number(process.env.ENTRY_DAYS||5);
const ENTRY_LIMIT=Number(process.env.ENTRY_LIMIT||240);
const FOREIGN_TRANSLATE_LIMIT=Number(process.env.FOREIGN_TRANSLATE_LIMIT||24);
const ARTICLE_ENRICH_LIMIT=Number(process.env.ARTICLE_ENRICH_LIMIT||18);

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
function broadcastStories(items=[]){
  const fresh=items.filter(x=>!sseSeen.has(x.storyId||x.id)).slice(0,20);
  for(const item of fresh){
    const data=JSON.stringify({type:"story",item:{storyId:item.storyId,id:item.id,title:item.title,category:item.category,publishedAt:item.publishedAt,importance:item.importance,heat:item.heat}});
    for(const res of sseClients){try{res.write("data: "+data+"\n\n")}catch{}}
  }
  for(const item of items)sseSeen.add(item.storyId||item.id);
  if(sseSeen.size>800)sseSeen=new Set([...sseSeen].slice(-500));
}

function localDateKey(value=new Date()){
  try{
    const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:process.env.APP_TIMEZONE||"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"});
    return fmt.format(value);
  }catch{return new Date(value).toISOString().slice(0,10)}
}
function storySummary(x){
  return {
    storyId:x.storyId,id:x.id,title:x.title,category:x.category,publishedAt:x.publishedAt,
    firstSeenAt:x.firstSeenAt,lastSeenAt:x.lastSeenAt,confirmations:x.confirmations||0,
    heat:x.heat||0,importance:x.importance||0,sources:x.sources||[],sourceDetails:x.sourceDetails||[],
    tiers:x.tiers||[],eventKey:x.eventKey||"",aiEventKey:x.aiEventKey||"",url:x.url||"",
    exclusive:Boolean(x.exclusive),isMatchReport:Boolean(x.isMatchReport),members:x.members||[]
  };
}
function rememberStories(items=[]){
  state.stories=state.stories||{};
  for(const item of items){
    if(!item.storyId)continue;
    const old=state.stories[item.storyId]||{history:[]};
    const history=Array.isArray(old.history)?old.history:[];
    const last=history[history.length-1];
    if(!last||last.title!==item.title||String(last.publishedAt)!==String(item.publishedAt)){
      history.push({title:item.title,publishedAt:item.publishedAt,category:item.category,confirmations:item.confirmations||0,heat:item.heat||0,sources:item.sources||[],recordedAt:new Date().toISOString()});
    }
    state.stories[item.storyId]={...storySummary(item),history:history.slice(-80)};
  }
  const entries=Object.entries(state.stories).sort((a,b)=>Date.parse(b[1].lastSeenAt||b[1].publishedAt||0)-Date.parse(a[1].lastSeenAt||a[1].publishedAt||0)).slice(0,3000);
  state.stories=Object.fromEntries(entries);
}
function snapshotLocal(items=[]){
  state.snapshots=state.snapshots||{};
  const date=localDateKey();
  state.snapshots[date]=items.slice(0,80).map(storySummary);
  const keys=Object.keys(state.snapshots).sort().reverse().slice(0,120);
  state.snapshots=Object.fromEntries(keys.map(k=>[k,state.snapshots[k]]));
  return date;
}
function adminAllowed(req){
  const configured=String(process.env.ADMIN_TOKEN||"");
  if(!configured)return false;
  const supplied=String(req.query.token||req.body?.token||req.headers["x-admin-token"]||"");
  if(!supplied||supplied.length!==configured.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(configured))}catch{return false}
}


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


const COMMERCIAL_STRONG_RULES=[
  /(?:官方商城|官方商店|立即购买|加入购物车|商品编号|产品编号|库存|清仓|现货|发货|配送|售价[:：]?\s*[¥￥$€£]?\d)/i,
  /\b(?:add to cart|in stock|out of stock|product id|product code|shipping|your price|clearance|shop now|buy now)\b/i,
  /(?:US\$|S\$|HK\$|£|€|¥|￥)\s*\d+(?:\.\d+)?/i,
  /(?:phantom football|signature football|signed football|football - size\s*\d|football size\s*\d|official licensed product|official merchandise)/i,
  /(?:幻影足球|签名足球|签字足球|官方授权商品|官方周边|五号足球|5号足球|足球\s*[（(]?\s*5号\s*[）)]?)/i
];

const COMMERCIAL_HINT_RULES=[
  /(?:商城|商店|购买|售价|价格|折扣|优惠|球衣|训练服|周边|纪念品|签名足球|门票|票务|季票|会员|礼品卡)/i,
  /\b(?:shop|store|buy|price|sale|discount|jersey|shirt|kit|merchandise|tickets?|ticketing|membership|season ticket|gift card)\b/i
];


const PRODUCT_TITLE_RULES=[
  /(?:Chelsea|切尔西).{0,30}(?:Phantom|幻影).{0,12}(?:Football|足球)/i,
  /(?:Arsenal|阿森纳|Liverpool|利物浦|Manchester United|曼联|Manchester City|曼城|Real Madrid|皇马|Barcelona|巴萨|Bayern|拜仁|PSG|巴黎).{0,30}(?:Signature|Signed|Phantom|签名|签字|幻影).{0,12}(?:Football|足球)/i,
  /(?:Home|Away|Third|主场|客场|第三).{0,12}(?:Jersey|Shirt|Kit|球衣).{0,12}(?:20\d{2}|\d{2}\/\d{2})/i
];

function productTitleReason(title){
  const t=String(title||"").replace(/\s+/g," ").trim();
  for(const rule of PRODUCT_TITLE_RULES){
    if(rule.test(t))return "商品标题";
  }
  return "";
}

function commercialReason(title,entry){
  const t=String(title||"").replace(/\s+/g," ").trim();
  const titleProduct=productTitleReason(t);
  if(titleProduct)return titleProduct;
  const body=entryBodyText(entry);
  const text=`${t} ${body}`;
  const url=String(entry?.url||entry?.link||"");

  if(/(?:^|[./-])(?:store|shop|tickets?|ticketing|merchandise|products?)(?:[./?-]|$)/i.test(url)){
    return "商业URL";
  }
  for(const rule of COMMERCIAL_STRONG_RULES){
    if(rule.test(text))return "商品/销售页";
  }
  let hints=0;
  for(const rule of COMMERCIAL_HINT_RULES){
    if(rule.test(text))hints++;
  }
  if(hints>=2)return "商业促销内容";
  return "";
}

const GENERIC_HEADLINE_RULES=[
  /^足球\|足球资讯\|懂球帝/i,
  /(?:懂球帝app\|足球专栏\|.*比赛详情)$/i,
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
  return stripHtml(entry?._articleText||entry?.content||entry?.summary||entry?.description||"").slice(0,5000);
}

function lowInformationReason(title,entry,meta){
  const t=String(title||"").replace(/\s+/g," ").trim();
  if(!t)return "空标题";
  if(GENERIC_HEADLINE_RULES.some((rule)=>rule.test(t)))return "栏目/分类标题";
  const body=entryBodyText(entry);
  const combined=`${t} ${body}`;
  const hasEvent=EVENT_SIGNAL_RULES.some((rule)=>rule.test(combined));

  const visibleLen=t.replace(/[^\u4e00-\u9fa5a-z0-9]/gi,"").length;
  if(visibleLen<7 && !hasEvent)return "短标题且正文无具体事件";

  // 官方源已经经过来源白名单和商业页过滤：允许训练、采访、公告、幕后等非动作词新闻进入。
  if(meta?.tier==="官方"){
    if(visibleLen<10 && body.length<80)return "官方内容信息量不足";
    return "";
  }

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
  if(meta?.tier==="官方")return true;
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
    [/(?:懂球帝|dongqiudi\.com)/i,"懂球帝"],
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


const OFFICIAL_PUBLISHER_RULES=[
  /(?:chelseafc\.com|Chelsea|切尔西)(?:\s+FC|\s+Football Club)?$/i,
  /manutd\.com/i,
  /mancity\.com/i,
  /liverpoolfc\.com/i,
  /arsenal\.com/i,
  /realmadrid\.com/i,
  /fcbarcelona\.com/i,
  /fcbayern\.com/i,
  /psg\.fr/i,
  /fifa\.com/i,
  /uefa\.com/i,
  /premierleague\.com/i,
  /laliga\.com/i,
  /legaseriea\.it/i,
  /bundesliga\.com/i,
  /ligue1\.com/i,
  /Manchester United|Man Utd|曼联/i,
  /Manchester City|Man City|曼城/i,
  /Liverpool FC|Liverpool Football Club|利物浦/i,
  /Arsenal|阿森纳/i,
  /Real Madrid|皇家马德里|皇马/i,
  /FC Barcelona|Barcelona|巴塞罗那|巴萨/i,
  /FC Bayern|Bayern Munich|拜仁/i,
  /Paris Saint-Germain|PSG|巴黎圣日耳曼/i,
  /FIFA|国际足联/i,
  /UEFA|欧足联/i,
  /Premier League|英超官方/i,
  /LaLiga|西甲官方/i,
  /Serie A|Lega Serie A|意甲官方/i,
  /Bundesliga|德甲官方/i,
  /Ligue 1|法甲官方/i
];

function isOfficialPublisherName(name){
  const n=String(name||"").trim();
  return OFFICIAL_PUBLISHER_RULES.some((rule)=>rule.test(n));
}


const TRANSFER_EXPERT_RULES=[
  /Fabrizio Romano|法布里齐奥·罗马诺|罗马诺/i,
  /David Ornstein|大卫·奥恩斯坦|奥恩斯坦/i,
  /Gianluca Di Marzio|詹卢卡·迪马济奥|迪马济奥/i,
  /Florian Plettenberg|弗洛里安·普莱滕贝格|普莱滕贝格/i,
  /Matteo Moretto|马泰奥·莫雷托|莫雷托/i,
  /Ben Jacobs|本·雅各布斯|雅各布斯/i
];

function isTransferExpertItem(source,title){
  const text=`${source||""} ${title||""}`;
  return TRANSFER_EXPERT_RULES.some((rule)=>rule.test(text));
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
  if(isOfficialNews(item) || best>=98) band=4;
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
  if(isOfficialNews(item))score+=5;
  if(item.tier==="转会专家" || isTransferExpertItem(item.source,item.title))score+=4;
  if(item.tier==="国际媒体")score+=2;
  if((item.confirmations||0)>=2)score+=3;
  const t=item.title||"";
  if(/官宣|官方确认|Here we go|达成协议|加盟|转会|续约|解约|下课|任命/.test(t))score+=3;
  if(/伤停|手术|重伤|赛季报销|复出|禁赛|红牌|处罚/.test(t))score+=2;
  if(/世界杯|欧冠|英超|西甲|意甲|德甲|法甲|国家队/.test(t))score+=1;
  return score;
}


function isMatchReport(item){
  const title=String(item?.title||"");
  const text=`${title} ${item?.contentExcerpt||""}`;

  if(/(?:^|[【[])(?:战报|全场|半场|完场|赛果)(?:】|\]|[:：\s])/i.test(text))return true;
  if(/(?:比分为|最终比分|全场比分|半场比分)/i.test(text))return true;

  const score=/\b\d{1,2}\s*[-:：]\s*\d{1,2}\b/.test(title);
  if(!score)return false;

  // 避免把价格区间、合同年份、尺码等数字误当比分。
  if(/(?:€|£|\$|美元|欧元|英镑|万|百万|亿|赛季|合同|年龄|岁|尺码|size).{0,12}\d{1,2}\s*[-:：]\s*\d{1,2}/i.test(title))return false;

  return /(?:战胜|击败|战平|不敌|取胜|绝平|绝杀|逆转|负于|淘汰|vs\.?|\bv\b|beat|defeat|draw|win|loss|欧冠|欧联|英超|西甲|意甲|德甲|法甲|欧国联|世界杯|欧洲杯|美洲杯)/i.test(title);
}

function parseHupuPublishedAt(html){
  const patterns=[
    /"publishTime"\s*:\s*"?([0-9]{10,13})"?/i,
    /"publish_time"\s*:\s*"?([0-9]{10,13})"?/i,
    /"createTime"\s*:\s*"?([0-9]{10,13})"?/i,
    /"createdAt"\s*:\s*"?([0-9]{10,13})"?/i,
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\s*发布/i,
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


async function fetchDongqiudiHistory(days=30){
  const cacheKey=`dqdHistory:${days}`;
  const cached=state?.directCache?.[cacheKey];
  if(cached?.at && Date.now()-cached.at<10*60_000 && Array.isArray(cached.items)){
    return cached.items;
  }

  const cutoff=Date.now()-days*86400000;
  const categoryIds=[1,120,3,5,4,6,55,37,56];

  const fetchCategory=async(categoryId)=>{
    const items=[];
    const seen=new Set();
    let url=`https://api.dongqiudi.com/app/tabs/iphone/${categoryId}.json`;

    for(let page=0;page<10 && url;page++){
      try{
        const res=await fetch(url,{
          headers:{
            "user-agent":"Dongqiudi/8.0 (iPhone; iOS 18.0)",
            "accept":"application/json"
          },
          signal:AbortSignal.timeout(4500)
        });
        if(!res.ok)break;
        const data=await res.json();
        const articles=Array.isArray(data?.articles)?data.articles:[];
        let oldest=Date.now();

        for(const a of articles){
          const title=normalizeTerms(a?.title||"").trim();
          if(!title)continue;
          const rawTime=a?.published_at||a?.show_time||a?.created_at||0;
          let ms=0;
          if(typeof rawTime==="number" || /^\d{10,13}$/.test(String(rawTime))){
            ms=Number(rawTime);
            if(ms<1e12)ms*=1000;
          }else{
            ms=Date.parse(rawTime||"");
          }
          if(!Number.isFinite(ms)||ms<=0)continue;
          oldest=Math.min(oldest,ms);
          if(ms<cutoff)continue;

          const articleId=a?.id||a?.aid||`${categoryId}-${ms}-${title}`;
          const key=String(articleId);
          if(seen.has(key))continue;
          seen.add(key);
          items.push({
            id:`dqd-direct-${key}`,
            title,
            content:title,
            published_at:new Date(ms).toISOString(),
            created_at:new Date(ms).toISOString(),
            _meta:{name:"懂球帝",tier:"中文媒体",group:"cn",type:"direct-history",historyOnly:true},
            _timeReliable:true,
            url:a?.id?`https://www.dongqiudi.com/articles/${a.id}.html`:""
          });
        }

        if(articles.length && oldest<cutoff)break;
        const next=data?.next;
        if(!next)break;
        url=String(next).startsWith("http")?String(next):`https://api.dongqiudi.com${next}`;
      }catch(err){
        console.error("[dqd history]",categoryId,page,String(err));
        break;
      }
    }
    return items;
  };

  const batches=await Promise.all(categoryIds.map(fetchCategory));
  const merged=[];
  const seenAll=new Set();
  for(const item of batches.flat()){
    if(seenAll.has(item.id))continue;
    seenAll.add(item.id);
    merged.push(item);
  }
  merged.sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));

  state.directCache=state.directCache||{};
  state.directCache[cacheKey]={at:Date.now(),items:merged};
  return merged;
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
        const detailUrl=item.url.replace(/^https:\/\/m\.hupu\.com\/bbs\/(\d+)(?:\.html)?$/i,"https://bbs.hupu.com/$1.html");
        const r=await fetch(detailUrl,{headers:{"user-agent":"Mozilla/5.0"}});
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
  // 官方源已经经过白名单域名 + 商业页过滤；GNews偶尔不给发布方后缀，不能因此把真官方新闻判成未验证。
  const verifiedSource=meta.tier==="官方" ? true : sourceInfo?.verified!==false;
  let effectiveTier=meta.tier;
  if(meta.tier==="转会专家" && !isTransferExpertItem(source,title)){
    effectiveTier="国际媒体";
  }
  return {
    id:idFor(entry.id||`${entry.title}|${entry.published_at}`),
    minifluxId:entry.id,
    title,
    source,
    sourceVerified:verifiedSource,
    sourceScore:sourceReputation(source,effectiveTier),
    exclusive:explicitExclusive(entry.title||"")||explicitExclusive(title),
    timeReliable:entry?._timeReliable!==false,
    tier:effectiveTier,
    group:meta.group,
    publishedAt:entry.published_at||entry.created_at||new Date().toISOString(),
    category:entry?._ai?.category||category(title),
    contentExcerpt:entryBodyText(entry).slice(0,600),
    url:entry?._articleUrl||entry?.url||entry?.link||"",
    articleExtracted:Boolean(entry?._articleText),
    aiEventKey:String(entry?._ai?.eventKey||""),
    aiCategory:String(entry?._ai?.category||""),
    aiReviewed:Boolean(entry?._ai)
  };
}

function exclusiveHeadlineTokens(title){
  const clean=String(title||"")
    .replace(/[【[]?流言板[】\]]?/g," ")
    .replace(/官方确认|官宣|突发|重磅|最新|消息|报道|记者|据悉/g," ")
    .toLowerCase();
  const out=[];
  const han=clean.match(/[\u4e00-\u9fa5]+/g)||[];
  for(const chunk of han){
    if(chunk.length===2)out.push(chunk);
    else for(let i=0;i<chunk.length-1;i++)out.push(chunk.slice(i,i+2));
  }
  const latin=clean.match(/[a-z0-9]{3,}/g)||[];
  out.push(...latin);
  return out;
}

function exclusiveHeadlineSimilarity(a,b){
  const A=new Set(exclusiveHeadlineTokens(a)),B=new Set(exclusiveHeadlineTokens(b));
  if(!A.size||!B.size)return 0;
  let same=0;
  for(const x of A)if(B.has(x))same++;
  if(same<4)return 0;
  return same/Math.min(A.size,B.size);
}

function buildExclusiveHistory(items){
  const hupu=items.filter((x)=>x.source==="虎扑");
  const dqd=items.filter((x)=>x.source==="懂球帝");
  const usedDqd=new Set();
  const matched=[];
  for(const h of hupu){
    const ht=Date.parse(h.publishedAt);
    let best=null,bestScore=0,bestIndex=-1;
    for(let i=0;i<dqd.length;i++){
      if(usedDqd.has(i))continue;
      const d=dqd[i];
      const dt=Date.parse(d.publishedAt);
      if(!Number.isFinite(ht)||!Number.isFinite(dt))continue;
      if(Math.abs(ht-dt)>72*3600_000)continue;
      const score=exclusiveHeadlineSimilarity(h.title,d.title);
      if(score>bestScore){
        bestScore=score;best=d;bestIndex=i;
      }
    }
    if(!best || bestScore<0.44)continue;
    usedDqd.add(bestIndex);
    const hTime=Date.parse(h.publishedAt),dTime=Date.parse(best.publishedAt);
    if(hTime===dTime)continue;
    const first=hTime<dTime?h:best;
    const second=hTime<dTime?best:h;
    const candidate={
      ...first,
      title:first.title,
      publishedAt:first.publishedAt,
      exclusive:true,
      platformExclusiveSource:first.source,
      platformExclusiveAt:first.publishedAt,
      confirmations:2,
      sources:["懂球帝","虎扑"],
      sourceDetails:[
        {name:first.source,score:first.sourceScore||0,firstPublishedAt:first.publishedAt,timeReliable:true},
        {name:second.source,score:second.sourceScore||0,firstPublishedAt:second.publishedAt,timeReliable:true}
      ],
      hupuDongqiudiMatched:true,
      exclusiveSimilarity:bestScore,
      category:category(first.title)
    };
    if(!isMatchReport(candidate))matched.push(candidate);
  }
  return matched.sort((a,b)=>Date.parse(b.platformExclusiveAt)-Date.parse(a.platformExclusiveAt));
}

function publishProcessed(processed,extraMetrics={}){
  let allClusters=assignStoryIds(clusterLatest(processed).map((x)=>{
    const exclusive=Boolean(x.platformExclusiveSource);
    const base={...x,exclusive,isMatchReport:isMatchReport(x)};
    const credibility=credibilityFor(base);
    const heat=heatScore(base);
    const decorated={
      ...base,
      credibilityScore:credibility.score,
      credibilityLabel:credibility.label,
      heat,
      importance:importanceScore(base)
    };
    return {...decorated,_rankScore:rankScore(decorated)};
  }));

  allClusters=applyEditorial(allClusters,state).map((x)=>{
    const credibility=credibilityFor(x);
    const heat=heatScore(x);
    const item={...x,credibilityScore:credibility.score,credibilityLabel:credibility.label,heat,importance:importanceScore(x)};
    return {...item,_rankScore:rankScore(item)};
  });

  const eligible=allClusters.filter((x)=>{
    if(x.isMatchReport)return false;
    const confirmations=x.confirmations||0;
    const best=x.sourceDetails?.[0]?.score||x.sourceScore||0;
    if(confirmations>=2)return true;
    if(confirmations===1 && best>=92)return true;
    if(confirmations===1 && directPlatformSource(x))return true;
    return false;
  });

  const editor=ensureEditor(state);
  const rankedEligible=[...eligible].sort((a,b)=>{
    const pa=editor.pinned[a.storyId]?1:0,pb=editor.pinned[b.storyId]?1:0;
    if(pa!==pb)return pb-pa;
    const rs=(b._rankScore||rankScore(b))-(a._rankScore||rankScore(a));
    if(rs!==0)return rs;
    return Date.parse(b.publishedAt)-Date.parse(a.publishedAt);
  });

  const clustered=rankedEligible.slice(0,MAX_VISIBLE);
  const reportLatest=allClusters
    .filter((x)=>x.isMatchReport)
    .filter((x)=>{
      const best=x.sourceDetails?.[0]?.score||x.sourceScore||0;
      return (x.confirmations||0)>=2 || best>=92 || directPlatformSource(x) || (x.tiers||[]).includes("官方");
    })
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
    .slice(0,180);

  const unconfirmedFiltered=Math.max(0,allClusters.length-eligible.length);
  const exclusiveVisible=(state.exclusiveLatest||[]).length;
  const platformDirectVisible=clustered.filter((x)=>(x.confirmations||0)===1 && directPlatformSource(x)).length;

  state.latest=clustered;
  state.allEligible=rankedEligible.slice(0,800);
  state.reportLatest=reportLatest;

  rememberStories([...allClusters,...(state.exclusiveLatest||[])]);
  const snapshotDate=snapshotLocal(clustered);
  const snapshotItems=state.snapshots?.[snapshotDate]||[];

  void persistStories([...allClusters,...(state.exclusiveLatest||[])].filter(x=>x.storyId)).catch((err)=>console.error("[store persist async]",String(err)));
  void saveSnapshot(snapshotDate,snapshotItems).catch((err)=>console.error("[snapshot db]",String(err)));
  broadcastStories(clustered);
  void notifyNewImportant(state,clustered).then((result)=>{
    state.metrics={...(state.metrics||{}),notifications:result};
    saveState();
  }).catch(()=>{});
  void maybeSendDailyDigest(state,clustered).then((result)=>{
    state.metrics={...(state.metrics||{}),digest:result};
    saveState();
  }).catch(()=>{});

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
    commercialFiltered:extraMetrics.commercialFiltered??state.metrics?.commercialFiltered??0,
    rawByGroup:extraMetrics.rawByGroup??state.metrics?.rawByGroup??{},
    rawBySource:extraMetrics.rawBySource??state.metrics?.rawBySource??{},
    articleExtraction:extraMetrics.articleExtraction??state.metrics?.articleExtraction??{},
    ai:aiStatus(state),
    aiBudget:extraMetrics.aiBudget??state.metrics?.aiBudget??{},
    filterStatsBySource:extraMetrics.filterStatsBySource??state.metrics?.filterStatsBySource??{},
    commercialSamples:extraMetrics.commercialSamples??state.metrics?.commercialSamples??[],
    store:storeStatus(),
    snapshotDate,
    unconfirmedFiltered,
    exclusiveVisible,
    platformDirectVisible,
    reportVisible:(state.reportLatest||[]).length,
    channelCounts,
    exclusiveDiagnostics:state.exclusiveDiagnostics||{},
    confirmationRule:"主新闻：多源、顶级权威单源、懂球帝/虎扑直发均可进入；战报独立隔离；虎扑与懂球帝同事件按最早发布时间判独家",
    phase:extraMetrics.phase||"ready",
    syncedAt:new Date().toISOString()
  };
  saveState();
  console.log("[sync]",JSON.stringify(state.metrics));
}

async function setup(){
  ensureEditor(state);
  const db=await initStore();
  state.metrics={...(state.metrics||{}),store:db};
  if(db.enabled){
    try{
      const saved=await loadOverrides();
      if(saved.editor&&typeof saved.editor==="object")state.editor={...ensureEditor(state),...saved.editor};
    }catch{}
  }
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


function articlePriority(entry,meta){
  if(!meta || meta.historyOnly)return -1;
  const url=String(entry?.url||entry?.link||"");
  if(!/^https?:\/\//i.test(url))return -1;
  if(/news\.google\.com/i.test(url))return -1;
  const title=normalizeTerms(extractPublisher(entry.title||"",meta).title||"");
  let score=0;
  if(meta.tier==="官方")score+=100;
  else if(meta.tier==="转会专家")score+=80;
  else if(meta.tier==="国际媒体")score+=50;
  if(productTitleReason(title) || COMMERCIAL_HINT_RULES.some((r)=>r.test(title)))score+=120;
  if(GENERIC_HEADLINE_RULES.some((r)=>r.test(title)))score+=100;
  if(title.length<18)score+=25;
  const age=Math.max(0,(Date.now()-Date.parse(entry.published_at||entry.created_at||0))/3600000);
  score+=Math.max(0,24-Math.min(24,age));
  return score;
}

async function enrichArticleBodies(entries){
  state.articleCache=state.articleCache||{};
  const candidates=entries
    .map((entry)=>({entry,meta:metaForEntry(entry)}))
    .map((x)=>({...x,priority:articlePriority(x.entry,x.meta)}))
    .filter((x)=>x.priority>=0)
    .sort((a,b)=>b.priority-a.priority);

  const unique=[];
  const seen=new Set();
  for(const x of candidates){
    const url=String(x.entry?.url||x.entry?.link||"");
    if(!url || seen.has(url))continue;
    seen.add(url);
    unique.push(x);
    if(unique.length>=ARTICLE_ENRICH_LIMIT)break;
  }

  let attempted=0,succeeded=0;
  const failures={};
  for(let i=0;i<unique.length;i+=4){
    const batch=unique.slice(i,i+4);
    const results=await Promise.all(batch.map(async({entry})=>{
      attempted++;
      const url=String(entry?.url||entry?.link||"");
      const result=await extractReadableArticle(url,state.articleCache,{timeout:5500});
      return {entry,result};
    }));
    for(const {entry,result} of results){
      if(result?.ok){
        succeeded++;
        entry._articleText=result.text;
        entry._articleUrl=result.finalUrl||entry.url;
        entry._articleTitle=result.title||"";
      }else{
        const reason=result?.reason||"unknown";
        failures[reason]=(failures[reason]||0)+1;
      }
    }
  }
  state.articleCache=compactArticleCache(state.articleCache,320);
  return {attempted,succeeded,failures,cacheSize:Object.keys(state.articleCache||{}).length};
}


async function aiReviewIfNeeded(entry,meta,title,{lowInfo="",footballReason="",commercialHint=false,budget}={}){
  if(!aiEnabled())return {reviewed:false,pass:false,reason:"disabled"};
  if(String(footballReason||"").startsWith("非足球:"))return {reviewed:false,pass:false,reason:"hard-non-football"};

  const shouldReview=Boolean(lowInfo || footballReason || commercialHint || !eventKey(title));
  if(!shouldReview)return {reviewed:false,pass:true,reason:"rules-pass"};

  const result=await judgeWithBudget(state,{
    title,
    body:entryBodyText(entry),
    source:meta?.name||""
  },budget);

  if(result?.skipped)return {reviewed:false,pass:false,reason:result.reason||"skipped"};

  const pass=result.confidence>=0.76
    && result.isFootballNews===true
    && result.isSpecificEvent===true
    && result.isCommercial!==true;

  if(pass){
    entry._ai={
      eventKey:result.eventKey||"",
      category:result.category||"综合",
      confidence:result.confidence
    };
  }
  return {reviewed:true,pass,result};
}

async function syncEntries(){
  if(syncing||!bootstrap)return;
  syncing=true;
  try{
    const feedLimit=(meta)=>{
      if(meta?.tier==="官方")return 80;
      if(meta?.tier==="转会专家")return 70;
      if(meta?.group==="cn")return 75;
      return 45;
    };
    const configuredFeeds=Object.entries(bootstrap?.sourceByFeedId||{})
      .filter(([,meta])=>!meta?.historyOnly);
    const groupedPromise=Promise.all(configuredFeeds.map(async([feedId,meta])=>{
      try{return await getRecentEntriesByFeed(Number(feedId),ENTRY_DAYS,feedLimit(meta))}
      catch(err){console.error("[entries feed]",feedId,meta?.name,String(err));return[]}
    }));
    const historyPromise=(async()=>{
      const feedIds=Object.entries(bootstrap?.sourceByFeedId||{})
        .filter(([,meta])=>meta?.historyOnly)
        .map(([id])=>Number(id));
      const [feedBatches,dqdDirect]=await Promise.all([
        Promise.all(feedIds.map(async(id)=>{
          try{return await getRecentEntriesByFeed(id,30,500)}
          catch(err){console.error("[exclusive history feed]",id,String(err));return[]}
        })),
        fetchDongqiudiHistory(30)
      ]);
      return [...feedBatches.flat(),...dqdDirect];
    })();
    const [grouped,historyEntries,directHupu]=await Promise.all([groupedPromise,historyPromise,fetchHupuDirect()]);
    const minifluxEntries=[];
    const seenEntries=new Set();
    for(const entry of grouped.flat()){
      const key=String(entry?.id||entry?.url||`${entry?.title}|${entry?.published_at}`);
      if(seenEntries.has(key))continue;
      seenEntries.add(key);
      minifluxEntries.push(entry);
    }
    const entries=[...minifluxEntries,...directHupu];
    const rawByGroup={};
    const rawBySource={};
    for(const entry of entries){
      const m=metaForEntry(entry);
      const key=m?.group||"unknown";
      rawByGroup[key]=(rawByGroup[key]||0)+1;
      const sourceName=m?.name||"unknown";
      rawBySource[sourceName]=(rawBySource[sourceName]||0)+1;
    }
    const articleExtraction=await enrichArticleBodies(entries);
    const processed=[];
    const foreign=[];
    const aiBudget=newAiBudget();
    const filterStatsBySource={};
    const stat=(name,key,title="")=>{
      const n=name||"unknown";
      filterStatsBySource[n]=filterStatsBySource[n]||{raw:0,accepted:0,foreign:0,commercial:0,lowInfo:0,nonFootball:0,junk:0,translateFail:0,samples:[]};
      filterStatsBySource[n][key]=(filterStatsBySource[n][key]||0)+1;
      if(title && filterStatsBySource[n].samples.length<4)filterStatsBySource[n].samples.push(title);
    };
    let junkFiltered=0;
    let nonFootballFiltered=0;
    let lowInformationFiltered=0;
    let commercialFiltered=0;
    const commercialSamples=[];

    // 第一阶段：只保留足球；再过滤预测、博彩、赔率等低质量内容。
    for(const entry of entries){
      const meta=metaForEntry(entry);
      if(!meta || meta.historyOnly)continue;
      stat(meta.name,"raw",String(entry.title||"").slice(0,160));
      const sourceInfo=extractPublisher(entry.title||"",meta);
      const normalized=normalizeTerms(sourceInfo.title);
      const junk=junkTitleReason(normalized);
      if(junk){
        junkFiltered++;
        stat(meta.name,"junk",normalized||entry.title||"");
        continue;
      }

      const commercial=commercialReason(normalized,entry);
      if(commercial){
        commercialFiltered++;
        stat(meta.name,"commercial",normalized||entry.title||"");
        if(commercialSamples.length<8)commercialSamples.push(normalized||entry.title||"");
        continue;
      }

      const lowInfo=lowInformationReason(normalized,entry,meta);
      const footballReason=footballOnlyReason(`${normalized} ${entryBodyText(entry)}`,meta);
      const commercialHint=COMMERCIAL_HINT_RULES.some((r)=>r.test(`${normalized} ${entryBodyText(entry)}`));
      let rescuedByAi=false;

      if(lowInfo || footballReason || commercialHint || !eventKey(normalized)){
        const review=await aiReviewIfNeeded(entry,meta,normalized,{
          lowInfo,
          footballReason,
          commercialHint,
          budget:aiBudget
        });

        if(review.reviewed){
          if(review.pass){
            rescuedByAi=true;
            aiBudget.rescued++;
          }else{
            aiBudget.rejected++;
            if(lowInfo){
              lowInformationFiltered++;
              stat(meta.name,"lowInfo",normalized||entry.title||"");
            }else if(footballReason){
              nonFootballFiltered++;
              stat(meta.name,"nonFootball",normalized||entry.title||"");
            }else if(commercialHint){
              commercialFiltered++;
              stat(meta.name,"commercial",normalized||entry.title||"");
            }
            continue;
          }
        }
      }

      if(!rescuedByAi){
        if(lowInfo){
          lowInformationFiltered++;
          stat(meta.name,"lowInfo",normalized||entry.title||"");
          continue;
        }
        if(footballReason){
          nonFootballFiltered++;
          stat(meta.name,"nonFootball",normalized||entry.title||"");
          continue;
        }
      }

      if(chineseRatio(normalized)>=0.48){
        processed.push(makeItem(entry,normalized,meta,sourceInfo));
        stat(meta.name,"accepted",normalized);
      }else{
        foreign.push({entry,meta,sourceInfo});
        stat(meta.name,"foreign",normalized);
      }
    }

    const exclusiveProcessed=[];
    const historySourceRaw={};
    for(const entry of historyEntries){
      const meta=metaForEntry(entry);
      if(!meta?.historyOnly)continue;
      historySourceRaw[meta.name]=(historySourceRaw[meta.name]||0)+1;
      const sourceInfo=extractPublisher(entry.title||"",meta);
      const normalized=normalizeTerms(sourceInfo.title);
      if(!normalized || GENERIC_HEADLINE_RULES.some((rule)=>rule.test(normalized)))continue;
      if(commercialReason(normalized,entry))continue;
      if(junkTitleReason(normalized))continue;
      if(chineseRatio(normalized)<0.30)continue;
      const item=makeItem(entry,normalized,meta,sourceInfo);
      if(!["懂球帝","虎扑"].includes(item.source))continue;
      exclusiveProcessed.push(item);
    }
    const exclusiveSourceProcessed={};
    for(const item of exclusiveProcessed){
      exclusiveSourceProcessed[item.source]=(exclusiveSourceProcessed[item.source]||0)+1;
    }
    const exclusiveMatches=buildExclusiveHistory(exclusiveProcessed);
    const hupuHist=exclusiveProcessed.filter((x)=>x.source==="虎扑");
    const dqdHist=exclusiveProcessed.filter((x)=>x.source==="懂球帝");
    const nearest=[];
    for(const h of hupuHist.slice(0,40)){
      let bestTitle="",bestScore=0;
      for(const d of dqdHist){
        const score=exclusiveHeadlineSimilarity(h.title,d.title);
        if(score>bestScore){bestScore=score;bestTitle=d.title;}
      }
      nearest.push({h:h.title,d:bestTitle,s:Number(bestScore.toFixed(3))});
    }
    nearest.sort((a,b)=>b.s-a.s);
    state.exclusiveDiagnostics={
      raw:historyEntries.length,
      rawByFeed:historySourceRaw,
      processed:exclusiveProcessed.length,
      processedBySource:exclusiveSourceProcessed,
      hupu:hupuHist.length,
      dqd:dqdHist.length,
      hupuSamples:hupuHist.slice(0,5).map((x)=>x.title),
      dqdSamples:dqdHist.slice(0,5).map((x)=>x.title),
      nearest:nearest.slice(0,5),
      dqdDirect:historyEntries.filter((x)=>x?._meta?.type==="direct-history").length,
      exclusivePairs:exclusiveMatches.length
    };
    state.exclusiveLatest=assignStoryIds(exclusiveMatches.slice(0,160));

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow:0,
      hiddenForeign:foreign.length,
      junkFiltered,
      nonFootballFiltered,
      lowInformationFiltered,
      commercialFiltered,
      rawByGroup,
      rawBySource,
      articleExtraction,
      filterStatsBySource,
      commercialSamples,
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
      const title=await toChineseTitle(sourceInfo.title,state.translations,{
        allowOriginal:meta?.tier==="官方" || meta?.tier==="转会专家"
      });
      if(Object.keys(state.translations).length>before)translatedNow++;
      if(!title){
        hiddenForeign++;
        stat(meta.name,"translateFail",sourceInfo.title||entry.title||"");
        continue;
      }
      const junk=junkTitleReason(title);
      if(junk){
        junkFiltered++;
        stat(meta.name,"junk",title||entry.title||"");
        continue;
      }

      const commercial=commercialReason(title,entry);
      if(commercial){
        commercialFiltered++;
        stat(meta.name,"commercial",title||entry.title||"");
        if(commercialSamples.length<8)commercialSamples.push(title||entry.title||"");
        continue;
      }

      const lowInfo=lowInformationReason(title,entry,meta);
      const footballReason=footballOnlyReason(`${title} ${entryBodyText(entry)}`,meta);
      const commercialHint=COMMERCIAL_HINT_RULES.some((r)=>r.test(`${title} ${entryBodyText(entry)}`));
      let rescuedByAi=false;

      if(lowInfo || footballReason || commercialHint || !eventKey(title)){
        const review=await aiReviewIfNeeded(entry,meta,title,{
          lowInfo,
          footballReason,
          commercialHint,
          budget:aiBudget
        });

        if(review.reviewed){
          if(review.pass){
            rescuedByAi=true;
            aiBudget.rescued++;
          }else{
            aiBudget.rejected++;
            if(lowInfo){
              lowInformationFiltered++;
              stat(meta.name,"lowInfo",title);
            }else if(footballReason){
              nonFootballFiltered++;
              stat(meta.name,"nonFootball",title);
            }else if(commercialHint){
              commercialFiltered++;
              stat(meta.name,"commercial",title);
            }
            continue;
          }
        }
      }

      if(!rescuedByAi){
        if(lowInfo){
          lowInformationFiltered++;
          stat(meta.name,"lowInfo",title);
          continue;
        }
        if(footballReason){
          nonFootballFiltered++;
          stat(meta.name,"nonFootball",title);
          continue;
        }
      }

      processed.push(makeItem(entry,title,meta,sourceInfo));
      stat(meta.name,"accepted",title);

      // 每翻译 4 条就增量发布一次，用户不用等完整批次。
      if(translatedNow>0 && translatedNow%4===0){
        publishProcessed(processed,{
          rawEntries:entries.length,
          translatedNow,
          hiddenForeign,
          junkFiltered,
          nonFootballFiltered,
          lowInformationFiltered,
          commercialFiltered,
          aiBudget,
          phase:"外文标题增量翻译中"
        });
      }
    }

    const acceptedBySource={};
    for(const item of processed){
      const key=item.source||"unknown";
      acceptedBySource[key]=(acceptedBySource[key]||0)+1;
    }
    state.sourceHealth={
      updatedAt:new Date().toISOString(),
      rawBySource,
      acceptedBySource
    };

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow,
      hiddenForeign,
      junkFiltered,
      nonFootballFiltered,
      lowInformationFiltered,
      commercialFiltered,
      rawByGroup,
      rawBySource,
      articleExtraction,
      filterStatsBySource,
      commercialSamples,
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


function isOfficialNews(item){
  const tiers=item?.tiers||[item?.tier].filter(Boolean);
  if(tiers.includes("官方") || item?.tier==="官方")return true;
  const t=String(item?.title||"");
  return /(?:^|[【[])(?:官方|官宣|官方确认|官方宣布)(?:[】\]:：\s]|$)/i.test(t)
    || /(?:官方宣布|官方确认|正式官宣|正式宣布)/i.test(t);
}

function hasNamedSource(item,name){
  return (item.sourceDetails||[]).some((x)=>x.name===name);
}

function channelMatches(item,section){
  const tiers=item.tiers||[item.tier].filter(Boolean);
  const best=item.sourceDetails?.[0]?.score||item.sourceScore||0;
  if(section==="main")return true;
  if(section==="official")return isOfficialNews(item);
  if(section==="exclusive")return item.exclusive===true;
  if(section==="verified")return (item.confirmations||0)>=2;
  if(section==="authority")return best>=92 || isOfficialNews(item);
  if(section==="expert")return tiers.includes("转会专家") || isTransferExpertItem(item.source,item.title);
  if(section==="dqd")return hasNamedSource(item,"懂球帝");
  if(section==="hupu")return hasNamedSource(item,"虎扑");
  if(section==="report")return item.isMatchReport===true;
  return true;
}

function channelCount(section){
  if(section==="main")return (state.latest||[]).length;
  if(section==="exclusive")return (state.exclusiveLatest||[]).length;
  if(section==="report")return (state.reportLatest||[]).length;
  return (state.allEligible||state.latest||[]).filter((x)=>channelMatches(x,section)).length;
}

function filteredItems(req){
  const q=String(req.query.q||"").trim();
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  const sort=String(req.query.sort||"smart");
  const section=String(req.query.section||"main");

  let items;
  if(section==="main"){
    items=state.latest||[];
  }else if(section==="exclusive"){
    items=state.exclusiveLatest||[];
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
  if(sort==="latest"){
    items=[...items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  }else if(sort==="hot"){
    items=[...items].sort((a,b)=>(b.heat||0)-(a.heat||0) || Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  }
  return items;
}

app.get("/",(req,res)=>{
  const items=filteredItems(req);
  const q=String(req.query.q||"");
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  const sort=String(req.query.sort||"smart");
  const section=String(req.query.section||"main");
  const tiers=["全部","官方","转会专家","国际媒体","中文媒体"];
  const cats=["全部","转会","球星","伤停","比赛","国家队","争议","趣闻","教练","综合"];
  const channelNav=CHANNELS.map((ch)=>`<a class="${section===ch.id?"active":""}" href="/?section=${encodeURIComponent(ch.id)}">${ch.label}<small>${channelCount(ch.id)}</small></a>`).join("");

  const rows=items.map((x)=>{
    const hot=x.heat>=58;
    const tiers=x.tiers||[x.tier].filter(Boolean);
    const badges=[];
    if(isOfficialNews(x))badges.push('<span class="official">官方</span>');
    if(isTransferExpertItem(x.source,x.title))badges.push('<span class="expert">转会专家</span>');
    if(x.exclusive)badges.push('<span class="exclusive">独家</span>');
    if((x.confirmations||0)>=2)badges.push('<span class="verified">多源核实</span>');
    else if((x.sourceDetails?.[0]?.score||x.sourceScore||0)>=92)badges.push('<span class="authority">权威单源</span>');
    else if(directPlatformSource(x))badges.push('<span class="platform">平台直发</span>');
    if(hot)badges.push('<span class="hot">热门</span>');
    return `
    <article class="item" data-title="${escHtml(x.title)}">
      <div class="meta">
        <span>${escHtml(x.category)}</span>
        ${badges.join("")}
        <span>${escHtml(agoText(x.publishedAt))}</span>
        ${x.storyId?`<a class="storylink" href="/story/${encodeURIComponent(x.storyId)}">故事</a>`:""}
      </div>
      <div class="title">${x.url?`<a href="${escHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escHtml(x.title)}</a>`:escHtml(x.title)}</div>
    </article>`;
  }).join("");

  const page=`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="30">
<title>露白足球｜开源足球新闻聚合器</title>
<meta name="description" content="露白足球：开源足球新闻聚合器，聚合懂球帝、虎扑、官方及国际媒体，支持多源核实、独家首发识别、战报分栏、正文过滤和可选AI语义增强。">
<meta name="keywords" content="足球新闻,懂球帝,虎扑,足球聚合器,开源足球,football news,news aggregator,RSSHub,Miniflux">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<link rel="canonical" href="https://football-wire-production.up.railway.app/">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#06100c">
<meta property="og:type" content="website">
<meta property="og:title" content="露白足球｜开源足球新闻聚合器">
<meta property="og:description" content="多源核实、独家识别、战报分栏、正文过滤与可选AI语义增强。">
<meta property="og:url" content="https://football-wire-production.up.railway.app/">
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
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
.toolbar a,.toolbar button,.toolbar select{font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--muted);text-decoration:none}
.toolbar button{cursor:pointer}
.storylink{color:var(--green)!important;text-decoration:none;border-color:#315b46!important}
.item.preferred{border-color:#4f9e72;box-shadow:0 0 0 1px #4f9e7233}
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
.title a{color:inherit;text-decoration:none}
.title a:hover{text-decoration:underline;text-underline-offset:3px}
.verified{border-color:#2f7656!important;color:#8cf0b8!important}
.official{border-color:#3979a8!important;color:#9fd3ff!important}
.authority{border-color:#446d90!important;color:#9bc7e8!important}
.expert{border-color:#75619a!important;color:#cbb8f2!important}
.platform{border-color:#5e685f!important;color:#c4d0c5!important}
.exclusive{border-color:#9b7732!important;color:#ffd77f!important}
.hot{border-color:#8b3b35!important;color:#ff9e91!important}
.empty{padding:60px 20px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
footer{padding:24px 0 8px;color:var(--muted);font-size:12px}
footer a{color:var(--muted);text-underline-offset:3px}
@media(max-width:700px){h1{font-size:30px}.title{font-size:16px}form{position:static}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>露白足球</h1>
<div class="sub">纯足球 · 多重分栏 · 官方/独家/多源可重叠 · 战报单独隔离${aiEnabled()?" · AI语义增强":""}</div>
<nav class="sections">${channelNav}</nav>
<div class="toolbar">
<a href="/search">历史/语义搜索</a>
<a href="/archive">每日归档</a>
<a href="/matches">赛程与积分榜</a>
<button type="button" id="managePrefs">个性化偏好</button>
<button type="button" id="addLike">+关注词</button>
<button type="button" id="addMute">+屏蔽词</button>
<span id="prefState"></span>
<button type="button" id="saveSearch">保存当前筛选</button>
<select id="savedSearches"><option value="">已保存筛选</option></select>
<button type="button" id="notifyToggle">开启浏览器通知</button>
</div>
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
<select name="sort">
<option value="smart" ${sort==="smart"?"selected":""}>智能排序</option>
<option value="latest" ${sort==="latest"?"selected":""}>最新优先</option>
<option value="hot" ${sort==="hot"?"selected":""}>热度优先</option>
</select>
<label class="important"><input type="checkbox" name="important" value="1" ${important?"checked":""}> 只看重要新闻</label>
<button type="submit">筛选</button>
</form>
<div class="status">当前栏目 ${items.length} 条 · 同一新闻可跨多个栏目重复出现 · 商城/促销已过滤 ${state.metrics?.commercialFiltered||0} 条 · 栏目/空泛内容已过滤 ${state.metrics?.lowInformationFiltered||0} 条 · 非足球 ${state.metrics?.nonFootballFiltered||0} 条 · 垃圾信息 ${state.metrics?.junkFiltered||0} 条 · ${escHtml(state.metrics?.phase||"同步中")} · 更新 ${escHtml(agoText(state.metrics?.syncedAt)||"刚刚")}</div>
<main class="list">${rows||'<div class="empty">当前筛选暂无新闻。</div>'}</main>
<footer>露白足球 Open · <a href="https://github.com/cdgks2026-gif/football-wire-open-" target="_blank" rel="noopener noreferrer">GitHub 开源代码</a></footer>
</div>
<script src="/app.js" defer></script>
</body>
</html>`;
  res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma","no-cache");
  res.set("Expires","0");
  res.type("html").send(page);
});

app.get("/robots.txt",(_req,res)=>{
  res.type("text/plain").send("User-agent: *\nAllow: /\nSitemap: https://football-wire-production.up.railway.app/sitemap.xml\n");
});

app.get("/sitemap.xml",(_req,res)=>{
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://football-wire-production.up.railway.app/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>https://football-wire-production.up.railway.app/?section=official</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>
  <url><loc>https://football-wire-production.up.railway.app/?section=exclusive</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>
  <url><loc>https://football-wire-production.up.railway.app/?section=verified</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>
  <url><loc>https://football-wire-production.up.railway.app/?section=report</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>
</urlset>`);
});

app.use(express.static("public",{etag:false,maxAge:0,setHeaders:(res)=>res.set("Cache-Control","no-store")}));


registerFeatureRoutes(app,{getState:()=>state,saveState,maxVisible:MAX_VISIBLE});
app.get("/api/stream",(req,res)=>{
  res.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});
  res.flushHeaders?.();
  res.write('data: {"type":"ready"}\n\n');
  sseClients.add(res);
  const timer=setInterval(()=>{try{res.write(": ping\n\n")}catch{}},25000);
  req.on("close",()=>{clearInterval(timer);sseClients.delete(res)});
});


app.get("/api/news",(req,res)=>{
  const q=String(req.query.q||"").trim();
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const important=String(req.query.important||"0")==="1";
  const sort=String(req.query.sort||"smart");
  const section=String(req.query.section||"main");

  let items;
  if(section==="main")items=state.latest||[];
  else if(section==="exclusive")items=state.exclusiveLatest||[];
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
  if(sort==="latest")items=[...items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  else if(sort==="hot")items=[...items].sort((a,b)=>(b.heat||0)-(a.heat||0) || Date.parse(b.publishedAt)-Date.parse(a.publishedAt));

  res.set("Cache-Control","no-store");
  res.json({
    items,
    count:items.length,
    metrics:state.metrics||{},
    serverTime:new Date().toISOString()
  });
});

app.get("/api/source-health",(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({
    updatedAt:state.sourceHealth?.updatedAt||null,
    rawBySource:state.sourceHealth?.rawBySource||{},
    acceptedBySource:state.sourceHealth?.acceptedBySource||{},
    articleExtraction:state.metrics?.articleExtraction||{}
  });
});

app.get("/api/ai-status",(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json(aiStatus(state));
});

app.get("/api/status",async(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({
    ok:true,
    miniflux:await minifluxHealth(),
    sourceCount:bootstrap?Object.keys(bootstrap.sourceByFeedId).length:0,
    newsCount:(state.latest||[]).length,
    metrics:state.metrics||{},
    ai:aiStatus(state)
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
