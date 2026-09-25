import crypto from "node:crypto";

const PROVIDER=(process.env.AI_PROVIDER||"").trim().toLowerCase()
  || (process.env.GROQ_API_KEY?"groq":process.env.OPENROUTER_API_KEY?"openrouter":"groq");
const DEFAULTS={
  groq:{base:"https://api.groq.com/openai/v1",model:"qwen/qwen3.8-27b"},
  openrouter:{base:"https://openrouter.ai/api/v1",model:"openrouter/free"}
};
const KEY=process.env.AI_API_KEY
  || (PROVIDER==="openrouter"?process.env.OPENROUTER_API_KEY:process.env.GROQ_API_KEY)
  || process.env.GROQ_API_KEY
  || process.env.OPENROUTER_API_KEY
  || "";
const BASE_URL=(process.env.AI_BASE_URL||DEFAULTS[PROVIDER]?.base||DEFAULTS.groq.base).replace(/\/$/,"");
const DEFAULT_MODEL=process.env.AI_MODEL
  || (PROVIDER==="openrouter"?process.env.OPENROUTER_MODEL:process.env.GROQ_MODEL)
  || DEFAULTS[PROVIDER]?.model
  || DEFAULTS.groq.model;
const SYNC_LIMIT=Number(process.env.AI_SYNC_LIMIT||10);
const DAILY_LIMIT=Number(process.env.AI_DAILY_LIMIT||180);
const TIMEOUT_MS=Number(process.env.AI_TIMEOUT_MS||9000);

function keyFor(value){
  return crypto.createHash("sha1").update(String(value||"")).digest("hex");
}

function dayKey(){
  return new Date().toISOString().slice(0,10);
}

function cleanJson(text){
  const raw=String(text||"").trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{}
  const m=raw.match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{return JSON.parse(m[0])}catch{return null}
}

function normalizeResult(obj){
  if(!obj||typeof obj!=="object")return null;
  const categories=new Set(["官方","转会","伤停","比赛","国家队","争议","趣闻","教练","球星","综合"]);
  return {
    isFootballNews:Boolean(obj.isFootballNews),
    isSpecificEvent:Boolean(obj.isSpecificEvent),
    isCommercial:Boolean(obj.isCommercial),
    category:categories.has(obj.category)?obj.category:"综合",
    eventKey:String(obj.eventKey||"").trim().slice(0,140),
    tags:Array.isArray(obj.tags)?obj.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[],
    confidence:Math.max(0,Math.min(1,Number(obj.confidence)||0))
  };
}

function requestHeaders(){
  const headers={
    "Authorization":`Bearer ${KEY}`,
    "Content-Type":"application/json"
  };
  if(PROVIDER==="openrouter"){
    headers["HTTP-Referer"]=process.env.PUBLIC_URL||"https://football-wire-production.up.railway.app";
    headers["X-Title"]="LuBai Football";
  }
  return headers;
}

export function aiEnabled(){
  return Boolean(KEY);
}

export function aiLimits(){
  return {provider:PROVIDER,model:DEFAULT_MODEL,syncLimit:SYNC_LIMIT,dailyLimit:DAILY_LIMIT};
}

export function ensureAiState(state){
  state.ai=state.ai||{};
  state.ai.cache=state.ai.cache||{};
  const today=dayKey();
  if(state.ai.day!==today){
    state.ai.day=today;
    state.ai.callsToday=0;
    state.ai.failuresToday=0;
  }
  return state.ai;
}

export function aiCacheKey({title="",body=""}){
  return keyFor(`${title}\n${String(body).slice(0,2200)}`);
}

export function aiCached(state,input){
  const ai=ensureAiState(state);
  return ai.cache[aiCacheKey(input)]||null;
}

export async function judgeNews(state,{title="",body="",source=""}){
  const ai=ensureAiState(state);
  const cacheKey=aiCacheKey({title,body});
  if(ai.cache[cacheKey])return {...ai.cache[cacheKey],cached:true};
  if(!aiEnabled())return {skipped:true,reason:"no-api-key"};
  if((ai.callsToday||0)>=DAILY_LIMIT)return {skipped:true,reason:"daily-limit"};

  const prompt=[
    "你是足球新闻聚合器的内容分类器。只判断输入内容，不补充外部事实。",
    "任务：判断它是不是具体足球新闻事件、是不是商业广告/商品页，并给事件生成稳定语义键。",
    "eventKey要求：用简体中文，格式尽量是“主体|动作/事件|对象”，同一事件不同标题应尽量得到相同eventKey；不要写媒体名、发布时间、‘据报道’等来源措辞。",
    "商业广告包括商城商品、球衣销售、门票售卖、会员促销、折扣、购物页。",
    "栏目页、导航页、只有‘国际足球/英超/足球新闻’等空泛内容，不算具体新闻事件。",
    "category只能是：官方、转会、伤停、比赛、国家队、争议、趣闻、教练、球星、综合。",
    "tags返回0-8个简短标签，优先球队、球员、赛事、动作，例如：热刺、姆巴佩、英超、伤停。",
    "只返回一个JSON对象，不要解释，不要Markdown代码块。",
    '{"isFootballNews":true,"isSpecificEvent":true,"isCommercial":false,"category":"转会","eventKey":"球员|加盟|俱乐部","tags":["球员","俱乐部","转会"],"confidence":0.95}',
    "",
    `来源线索：${source||"未知"}`,
    `标题：${title}`,
    `正文/摘要：${String(body||"").slice(0,2200)}`
  ].join("\n");

  ai.callsToday=(ai.callsToday||0)+1;
  ai.lastProvider=PROVIDER;
  ai.lastModel=DEFAULT_MODEL;
  ai.lastCallAt=new Date().toISOString();

  try{
    const bodyPayload={
      model:DEFAULT_MODEL,
      messages:[
        {role:"system",content:"Return compact valid JSON only. Do not include chain-of-thought or explanations."},
        {role:"user",content:prompt}
      ],
      temperature:0.1,
      max_tokens:320
    };
    if(PROVIDER==="groq")bodyPayload.response_format={type:"json_object"};

    const res=await fetch(`${BASE_URL}/chat/completions`,{
      method:"POST",
      headers:requestHeaders(),
      body:JSON.stringify(bodyPayload),
      signal:AbortSignal.timeout(TIMEOUT_MS)
    });
    if(!res.ok){
      ai.failuresToday=(ai.failuresToday||0)+1;
      ai.lastError=`HTTP ${res.status}`;
      return {skipped:true,reason:`http-${res.status}`};
    }
    const data=await res.json();
    const parsed=normalizeResult(cleanJson(data?.choices?.[0]?.message?.content));
    if(!parsed){
      ai.failuresToday=(ai.failuresToday||0)+1;
      ai.lastError="invalid-json";
      return {skipped:true,reason:"invalid-json"};
    }
    const saved={...parsed,at:new Date().toISOString(),provider:PROVIDER,model:DEFAULT_MODEL};
    ai.cache[cacheKey]=saved;

    const entries=Object.entries(ai.cache);
    if(entries.length>1200){
      entries.sort((a,b)=>Date.parse(b[1]?.at||0)-Date.parse(a[1]?.at||0));
      ai.cache=Object.fromEntries(entries.slice(0,1200));
    }
    return saved;
  }catch(err){
    ai.failuresToday=(ai.failuresToday||0)+1;
    ai.lastError=String(err?.name||err||"ai-error").slice(0,160);
    return {skipped:true,reason:ai.lastError};
  }
}

export function newAiBudget(){
  return {remaining:SYNC_LIMIT,used:0,rescued:0,rejected:0};
}

export async function judgeWithBudget(state,input,budget){
  const cached=aiCached(state,input);
  if(cached)return {...cached,cached:true};
  if(!budget || budget.remaining<=0)return {skipped:true,reason:"sync-limit"};
  budget.remaining--;
  budget.used++;
  return judgeNews(state,input);
}

export function aiStatus(state){
  const ai=ensureAiState(state);
  let host="";
  try{host=new URL(BASE_URL).host}catch{}
  return {
    enabled:aiEnabled(),
    provider:PROVIDER,
    endpointHost:host,
    model:DEFAULT_MODEL,
    callsToday:ai.callsToday||0,
    failuresToday:ai.failuresToday||0,
    dailyLimit:DAILY_LIMIT,
    syncLimit:SYNC_LIMIT,
    cacheSize:Object.keys(ai.cache||{}).length,
    lastCallAt:ai.lastCallAt||null,
    lastError:ai.lastError||null
  };
}


export async function summarizeDailyBrief(state,items=[]){
  const ai=ensureAiState(state);
  const top=items.slice(0,12).map((x,i)=>`${i+1}. [${x.category||"综合"}] ${x.title}（${x.confirmations||0}源）`);
  const fallback={
    ai:false,
    title:"过去24小时足球简报",
    summary:top.slice(0,5).map(x=>x.replace(/^\d+\.\s*/,"")).join("；"),
    bullets:top.slice(0,8).map(x=>x.replace(/^\d+\.\s*/,""))
  };
  if(!aiEnabled()||!top.length)return fallback;
  const cacheKey=keyFor("daily-brief\n"+top.join("\n"));
  ai.briefCache=ai.briefCache||{};
  if(ai.briefCache[cacheKey])return ai.briefCache[cacheKey];
  if((ai.callsToday||0)>=DAILY_LIMIT)return fallback;
  ai.callsToday=(ai.callsToday||0)+1;
  try{
    const prompt=[
      "你是足球新闻编辑。根据下面已经筛选和聚类的新闻，生成一份简体中文24小时简报。",
      "禁止补充输入之外的事实，不判断新闻真假，不猜测未来。",
      "输出JSON：title、summary、bullets。summary 80-180字；bullets 4-8条，每条不超过45字。",
      ...top
    ].join("\n");
    const payload={
      model:DEFAULT_MODEL,
      messages:[
        {role:"system",content:"Return valid JSON only. No markdown."},
        {role:"user",content:prompt}
      ],
      temperature:0.2,
      max_tokens:650
    };
    if(PROVIDER==="groq")payload.response_format={type:"json_object"};
    const res=await fetch(`${BASE_URL}/chat/completions`,{
      method:"POST",headers:requestHeaders(),body:JSON.stringify(payload),signal:AbortSignal.timeout(TIMEOUT_MS)
    });
    if(!res.ok)return fallback;
    const data=await res.json(),obj=cleanJson(data?.choices?.[0]?.message?.content);
    if(!obj||typeof obj!=="object")return fallback;
    const result={
      ai:true,
      title:String(obj.title||"过去24小时足球简报").slice(0,80),
      summary:String(obj.summary||fallback.summary).slice(0,500),
      bullets:Array.isArray(obj.bullets)?obj.bullets.map(x=>String(x).slice(0,120)).filter(Boolean).slice(0,8):fallback.bullets,
      provider:PROVIDER,model:DEFAULT_MODEL,at:new Date().toISOString()
    };
    ai.briefCache[cacheKey]=result;
    const entries=Object.entries(ai.briefCache);
    if(entries.length>40){
      entries.sort((a,b)=>Date.parse(b[1]?.at||0)-Date.parse(a[1]?.at||0));
      ai.briefCache=Object.fromEntries(entries.slice(0,40));
    }
    return result;
  }catch{return fallback}
}
