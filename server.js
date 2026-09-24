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

function metaForEntry(entry){
  return bootstrap?.sourceByFeedId?.[entry.feed?.id]||{
    name:entry.feed?.title||"未知来源",
    tier:"国际媒体",
    group:"media"
  };
}
function makeItem(entry,title,meta){
  return {
    id:idFor(entry.id||`${entry.title}|${entry.published_at}`),
    minifluxId:entry.id,
    title,
    source:meta.name,
    tier:meta.tier,
    group:meta.group,
    publishedAt:entry.published_at||entry.created_at||new Date().toISOString(),
    category:category(title)
  };
}
function publishProcessed(processed,extraMetrics={}){
  const clustered=clusterLatest(processed)
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
    .slice(0,MAX_VISIBLE);

  state.latest=clustered;
  state.metrics={
    ...(state.metrics||{}),
    rawEntries:extraMetrics.rawEntries??state.metrics?.rawEntries??0,
    visibleEvents:clustered.length,
    translatedNow:extraMetrics.translatedNow??0,
    hiddenForeign:extraMetrics.hiddenForeign??0,
    translationCache:Object.keys(state.translations||{}).length,
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

    // 第一阶段：中文标题立即发布，不等待翻译服务。
    for(const entry of entries){
      const meta=metaForEntry(entry);
      const normalized=normalizeTerms(entry.title||"");
      if(chineseRatio(normalized)>=0.48){
        processed.push(makeItem(entry,normalized,meta));
      }else{
        foreign.push({entry,meta});
      }
    }

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow:0,
      hiddenForeign:foreign.length,
      phase:"中文标题已就绪"
    });

    // 第二阶段：只翻译最新少量外文标题，避免首次同步拖垮免费实例。
    let translatedNow=0;
    let hiddenForeign=Math.max(0,foreign.length-FOREIGN_TRANSLATE_LIMIT);
    for(const {entry,meta} of foreign.slice(0,FOREIGN_TRANSLATE_LIMIT)){
      const before=Object.keys(state.translations).length;
      const title=await toChineseTitle(entry.title,state.translations);
      if(Object.keys(state.translations).length>before)translatedNow++;
      if(!title){
        hiddenForeign++;
        continue;
      }
      processed.push(makeItem(entry,title,meta));

      // 每翻译 4 条就增量发布一次，用户不用等完整批次。
      if(translatedNow>0 && translatedNow%4===0){
        publishProcessed(processed,{
          rawEntries:entries.length,
          translatedNow,
          hiddenForeign,
          phase:"外文标题增量翻译中"
        });
      }
    }

    publishProcessed(processed,{
      rawEntries:entries.length,
      translatedNow,
      hiddenForeign,
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
  let items=state.latest||[];
  if(tier!=="全部")items=items.filter((x)=>x.tier===tier);
  if(cat!=="全部")items=items.filter((x)=>x.category===cat);
  if(q)items=items.filter((x)=>`${x.title} ${x.source}`.includes(q));
  if(hours>0)items=items.filter((x)=>Date.now()-Date.parse(x.publishedAt)<=hours*3600_000);
  return items;
}

app.get("/",(req,res)=>{
  const items=filteredItems(req);
  const q=String(req.query.q||"");
  const tier=String(req.query.tier||"全部");
  const cat=String(req.query.category||"全部");
  const hours=Number(req.query.hours||0);
  const tiers=["全部","官方","转会专家","国际媒体","中文媒体"];
  const cats=["全部","转会","球星","伤停","比赛","国家队","争议","趣闻","教练","综合"];

  const rows=items.map((x)=>`
    <article class="item">
      <div class="meta">
        <span>${escHtml(x.source)}</span>
        <span>${escHtml(x.tier)}</span>
        <span>${escHtml(x.category)}</span>
        ${x.confirmations>1?`<span>${x.confirmations}源交叉</span>`:""}
        <span>${escHtml(agoText(x.publishedAt))}</span>
      </div>
      <div class="title">${escHtml(x.title)}</div>
    </article>`).join("");

  const page=`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="30">
<title>Football Wire｜全球足球中文快讯</title>
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
button{background:var(--green);color:#052014;font-weight:800}
.status{padding:12px 0;color:var(--muted);font-size:12px}
.list{display:flex;flex-direction:column;gap:8px}
.item{border:1px solid var(--line);border-radius:13px;background:var(--panel);padding:13px 14px}
.meta{display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:10.5px;margin-bottom:6px}
.meta span{border:1px solid #345546;border-radius:999px;padding:3px 6px}
.title{font-size:17px;line-height:1.5;font-weight:800}
.empty{padding:60px 20px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
@media(max-width:700px){h1{font-size:30px}.title{font-size:16px}form{position:static}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>Football Wire</h1>
<div class="sub">全球足球中文标题流 · 服务器直接渲染 · 每30秒自动刷新</div>
</header>
<form method="get" action="/">
<input name="q" value="${escHtml(q)}" placeholder="搜索球员、球队、教练">
<select name="tier">${tiers.map(v=>`<option ${v===tier?"selected":""}>${v}</option>`).join("")}</select>
<select name="category">${cats.map(v=>`<option ${v===cat?"selected":""}>${v}</option>`).join("")}</select>
<select name="hours">
<option value="0" ${hours? "":"selected"}>全部时间</option>
<option value="1" ${hours===1?"selected":""}>最近1小时</option>
</select>
<button type="submit">筛选</button>
</form>
<div class="status">当前 ${items.length} 条 · 后台共 ${(state.latest||[]).length} 个事件 · ${escHtml(state.metrics?.phase||"同步中")}</div>
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

  let items=state.latest||[];
  if(tier!=="全部")items=items.filter((x)=>x.tier===tier);
  if(cat!=="全部")items=items.filter((x)=>x.category===cat);
  if(q)items=items.filter((x)=>`${x.title} ${x.source}`.includes(q));
  if(hours>0)items=items.filter((x)=>Date.now()-Date.parse(x.publishedAt)<=hours*3600_000);

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
