import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadSources, GROUP_META } from "./src/sources.js";
import { bootstrapSources, getRecentEntries, refreshCategory, minifluxHealth } from "./src/miniflux.js";
import { toChineseTitle } from "./src/translator.js";
import { clusterLatest, category } from "./src/events.js";

const app=express();
const PORT=Number(process.env.PORT||8088);
const DATA_FILE=process.env.DATA_FILE||path.join(process.cwd(),"data","state.json");
const MAX_VISIBLE=Number(process.env.MAX_VISIBLE||250);
const ENTRY_DAYS=Number(process.env.ENTRY_DAYS||5);

fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});
function loadState(){try{return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"))}catch{return{translations:{},lastRefresh:{},latest:[],metrics:{}}}}
let state=loadState(),bootstrap=null,syncing=false;
function saveState(){const tmp=`${DATA_FILE}.tmp`;fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,DATA_FILE)}
function idFor(v){return crypto.createHash("sha1").update(String(v)).digest("hex").slice(0,16)}

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
    const c=bootstrap.categories[group];if(!c)continue;
    const last=Number(state.lastRefresh[group]||0);
    if(!force && now-last<meta.refreshSeconds*1000)continue;
    try{await refreshCategory(c.id);state.lastRefresh[group]=now}catch(err){console.error("[refresh]",group,String(err))}
  }
  saveState();
}
async function syncEntries(){
  if(syncing||!bootstrap)return;
  syncing=true;
  try{
    const entries=await getRecentEntries(ENTRY_DAYS,600);
    const processed=[];
    let translatedNow=0,hiddenForeign=0;
    for(const entry of entries){
      const meta=bootstrap.sourceByFeedId[entry.feed?.id]||{name:entry.feed?.title||"未知来源",tier:"国际媒体",group:"media"};
      const before=Object.keys(state.translations).length;
      const title=await toChineseTitle(entry.title,state.translations);
      if(Object.keys(state.translations).length>before)translatedNow++;
      if(!title){hiddenForeign++;continue}
      processed.push({
        id:idFor(entry.id||`${entry.title}|${entry.published_at}`),
        minifluxId:entry.id,title,source:meta.name,tier:meta.tier,group:meta.group,
        publishedAt:entry.published_at||entry.created_at||new Date().toISOString(),
        category:category(title)
      });
    }
    const clustered=clusterLatest(processed).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,MAX_VISIBLE);
    state.latest=clustered;
    state.metrics={rawEntries:entries.length,visibleEvents:clustered.length,translatedNow,hiddenForeign,translationCache:Object.keys(state.translations).length,syncedAt:new Date().toISOString()};
    saveState();
  }catch(err){console.error("[sync]",String(err))}finally{syncing=false}
}

app.use(express.static("public",{etag:true,maxAge:"1m"}));
app.get("/api/news",(req,res)=>{
  const q=String(req.query.q||"").trim(),tier=String(req.query.tier||"全部"),cat=String(req.query.category||"全部"),hours=Number(req.query.hours||0);
  let items=state.latest||[];
  if(tier!=="全部")items=items.filter((x)=>x.tier===tier);
  if(cat!=="全部")items=items.filter((x)=>x.category===cat);
  if(q)items=items.filter((x)=>`${x.title} ${x.source}`.includes(q));
  if(hours>0)items=items.filter((x)=>Date.now()-Date.parse(x.publishedAt)<=hours*3600_000);
  res.json({items,count:items.length,metrics:state.metrics||{},serverTime:new Date().toISOString()});
});
app.get("/api/status",async(_req,res)=>res.json({ok:true,miniflux:await minifluxHealth(),sourceCount:bootstrap?Object.keys(bootstrap.sourceByFeedId).length:0,metrics:state.metrics||{}}));
app.post("/api/refresh",async(_req,res)=>{await refreshDue(true);setTimeout(()=>syncEntries(),5000);res.status(202).json({ok:true})});

app.listen(PORT,()=>console.log(`[web] http://localhost:${PORT}`));
setup().catch((err)=>console.error("[setup fatal]",err));
setInterval(()=>refreshDue(false),15000).unref();
setInterval(()=>syncEntries(),30000).unref();
