import pg from "pg";
import crypto from "node:crypto";

const {Pool}=pg;
const DATABASE_URL=process.env.APP_DATABASE_URL||process.env.DATABASE_URL||"";
let pool=null;
let ready=false;
let vectorReady=false;
let lastError="";

function hashIndex(token,dims){
  const h=crypto.createHash("sha1").update(token).digest();
  return h.readUInt32BE(0)%dims;
}

export function localVector(text,dims=64){
  const s=String(text||"").toLowerCase();
  const tokens=[];
  const han=s.match(/[\u4e00-\u9fff]+/g)||[];
  for(const chunk of han){
    if(chunk.length<2)tokens.push(chunk);
    else for(let i=0;i<chunk.length-1;i++)tokens.push(chunk.slice(i,i+2));
  }
  tokens.push(...(s.match(/[a-z0-9]{3,}/g)||[]));
  const v=Array(dims).fill(0);
  for(const token of tokens){
    const idx=hashIndex(token,dims);
    v[idx]+=1;
  }
  const norm=Math.sqrt(v.reduce((n,x)=>n+x*x,0))||1;
  return v.map(x=>Number((x/norm).toFixed(6)));
}
function vectorLiteral(v){return `[${v.join(",")}]`}

export async function initStore(){
  if(!DATABASE_URL){
    lastError="APP_DATABASE_URL/DATABASE_URL 未配置";
    return {enabled:false,vector:false,error:lastError};
  }
  try{
    pool=new Pool({connectionString:DATABASE_URL,max:5,idleTimeoutMillis:30000});
    await pool.query("select 1");
    await pool.query(`
      create table if not exists lubai_stories(
        story_id text primary key,
        event_key text,
        title text not null,
        category text,
        published_at timestamptz,
        first_seen timestamptz not null default now(),
        last_seen timestamptz not null default now(),
        confirmations integer not null default 0,
        heat integer not null default 0,
        importance integer not null default 0,
        payload jsonb not null default '{}'::jsonb,
        search_text text not null default ''
      );
      create index if not exists lubai_stories_published_idx on lubai_stories(published_at desc);
      create index if not exists lubai_stories_event_idx on lubai_stories(event_key);
      create table if not exists lubai_story_versions(
        id bigserial primary key,
        story_id text not null,
        published_at timestamptz,
        title text not null,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        unique(story_id,published_at,title)
      );
      create index if not exists lubai_story_versions_story_idx on lubai_story_versions(story_id,created_at desc);
      create table if not exists lubai_snapshots(
        snapshot_date date primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table if not exists lubai_editor_overrides(
        action_key text primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
    `);
    ready=true;
    try{
      await pool.query("create extension if not exists vector");
      await pool.query("alter table lubai_stories add column if not exists search_vector vector(64)");
      try{
        await pool.query("create index if not exists lubai_stories_vector_idx on lubai_stories using hnsw (search_vector vector_cosine_ops)");
      }catch{}
      vectorReady=true;
    }catch(err){
      vectorReady=false;
      console.warn("[store] pgvector unavailable:",String(err).slice(0,180));
    }
    return {enabled:true,vector:vectorReady};
  }catch(err){
    lastError=String(err);
    ready=false;
    console.error("[store]",lastError);
    return {enabled:false,vector:false,error:lastError};
  }
}

export function storeStatus(){
  return {enabled:ready,vector:vectorReady,error:lastError||null};
}

export async function persistStories(stories=[]){
  if(!ready||!pool||!stories.length)return;
  const client=await pool.connect();
  try{
    await client.query("begin");
    for(const s of stories.slice(0,800)){
      const searchText=[s.title,s.eventKey,s.aiEventKey,s.category,...(s.sources||[])].filter(Boolean).join(" ");
      const payload=JSON.stringify(s);
      const firstSeen=s.firstSeenAt||s.publishedAt||new Date().toISOString();
      const lastSeen=s.lastSeenAt||s.publishedAt||new Date().toISOString();
      await client.query(`
        insert into lubai_stories(story_id,event_key,title,category,published_at,first_seen,last_seen,confirmations,heat,importance,payload,search_text)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
        on conflict(story_id) do update set
          event_key=excluded.event_key,title=excluded.title,category=excluded.category,
          published_at=excluded.published_at,last_seen=greatest(lubai_stories.last_seen,excluded.last_seen),
          confirmations=excluded.confirmations,heat=excluded.heat,importance=excluded.importance,
          payload=excluded.payload,search_text=excluded.search_text
      `,[s.storyId,s.eventKey||s.aiEventKey||"",s.title,s.category||"",s.publishedAt,firstSeen,lastSeen,s.confirmations||0,s.heat||0,s.importance||0,payload,searchText]);
      await client.query(`
        insert into lubai_story_versions(story_id,published_at,title,payload)
        values($1,$2,$3,$4::jsonb)
        on conflict(story_id,published_at,title) do nothing
      `,[s.storyId,s.publishedAt,s.title,payload]);
      if(vectorReady){
        const vec=vectorLiteral(localVector(searchText));
        await client.query("update lubai_stories set search_vector=$2::vector where story_id=$1",[s.storyId,vec]);
      }
    }
    await client.query("commit");
  }catch(err){
    await client.query("rollback").catch(()=>{});
    lastError=String(err);
    console.error("[store persist]",lastError);
  }finally{client.release()}
}

export async function getStory(storyId){
  if(!ready||!pool)return null;
  const [s,v]=await Promise.all([
    pool.query("select payload,first_seen,last_seen from lubai_stories where story_id=$1",[storyId]),
    pool.query("select title,published_at,payload,created_at from lubai_story_versions where story_id=$1 order by published_at asc,created_at asc limit 80",[storyId])
  ]);
  if(!s.rows[0])return null;
  return {
    ...s.rows[0].payload,
    firstSeenAt:s.rows[0].first_seen,
    lastSeenAt:s.rows[0].last_seen,
    versions:v.rows.map(x=>({...x.payload,title:x.title,publishedAt:x.published_at,recordedAt:x.created_at}))
  };
}

export async function searchStories(query,{limit=60,semantic=true}={}){
  if(!ready||!pool||!String(query||"").trim())return [];
  const q=String(query).trim();
  try{
    if(vectorReady&&semantic){
      const vec=vectorLiteral(localVector(q));
      const r=await pool.query(`
        select payload, 1-(search_vector <=> $1::vector) as similarity
        from lubai_stories
        where search_vector is not null
        order by search_vector <=> $1::vector, published_at desc
        limit $2
      `,[vec,Math.min(100,limit)]);
      return r.rows.map(x=>({...x.payload,similarity:Number(x.similarity||0)}));
    }
    const r=await pool.query(`
      select payload from lubai_stories
      where search_text ilike $1
      order by published_at desc limit $2
    `,[`%${q}%`,Math.min(100,limit)]);
    return r.rows.map(x=>x.payload);
  }catch(err){
    lastError=String(err);return[];
  }
}

export async function saveSnapshot(date,items){
  if(!ready||!pool)return;
  await pool.query(`
    insert into lubai_snapshots(snapshot_date,payload,updated_at)
    values($1,$2::jsonb,now())
    on conflict(snapshot_date) do update set payload=excluded.payload,updated_at=now()
  `,[date,JSON.stringify(items)]);
}

export async function getSnapshot(date){
  if(!ready||!pool)return null;
  const r=await pool.query("select payload,updated_at from lubai_snapshots where snapshot_date=$1",[date]);
  return r.rows[0]||null;
}

export async function listSnapshots(limit=90){
  if(!ready||!pool)return[];
  const r=await pool.query("select snapshot_date,updated_at,jsonb_array_length(payload) as count from lubai_snapshots order by snapshot_date desc limit $1",[limit]);
  return r.rows;
}

export async function saveOverride(actionKey,payload){
  if(!ready||!pool)return;
  await pool.query(`
    insert into lubai_editor_overrides(action_key,payload,updated_at)
    values($1,$2::jsonb,now())
    on conflict(action_key) do update set payload=excluded.payload,updated_at=now()
  `,[actionKey,JSON.stringify(payload||{})]);
}

export async function loadOverrides(){
  if(!ready||!pool)return{};
  const r=await pool.query("select action_key,payload from lubai_editor_overrides");
  return Object.fromEntries(r.rows.map(x=>[x.action_key,x.payload]));
}
