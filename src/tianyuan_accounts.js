import pg from "pg";
import crypto from "node:crypto";

const {Pool}=pg;
const DATABASE_URL=process.env.APP_DATABASE_URL||process.env.DATABASE_URL||"";
const ADMIN_USERNAME=String(process.env.TANYUAN_ADMIN_USERNAME||"").trim();
const ADMIN_PASSWORD=String(process.env.TANYUAN_ADMIN_PASSWORD||"");
const SESSION_DAYS=30;
const CHARACTERS=new Set(["farmer","cook","angler","gardener"]);
let pool=null;
let ready=false;

function normalizeUsername(v){
  return String(v||"").trim().toLowerCase();
}
function validUsername(v){
  return /^[a-z0-9_\u4e00-\u9fff]{3,24}$/i.test(v);
}
function validPassword(v){
  return typeof v==="string"&&v.length>=6&&v.length<=72;
}
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password,stored){
  try{
    const [,salt,expected]=String(stored||"").split("$");
    if(!salt||!expected)return false;
    const actual=crypto.scryptSync(password,salt,64);
    const exp=Buffer.from(expected,"hex");
    return exp.length===actual.length&&crypto.timingSafeEqual(exp,actual);
  }catch{return false}
}
function tokenHash(token){return crypto.createHash("sha256").update(token).digest("hex")}
function publicUser(row){
  return {id:String(row.id),username:row.username,displayName:row.display_name||row.username,character:row.character||"farmer",role:row.role||"player",createdAt:row.created_at};
}
async function createSession(userId){
  const token=crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "insert into tianyuan_sessions(token_hash,user_id,expires_at) values($1,$2,now()+($3||' days')::interval)",
    [tokenHash(token),userId,String(SESSION_DAYS)]
  );
  return token;
}
async function auth(req){
  if(!ready||!pool)return null;
  const header=String(req.headers.authorization||"");
  const token=header.startsWith("Bearer ")?header.slice(7).trim():"";
  if(!token)return null;
  const r=await pool.query(`
    select u.* from tianyuan_sessions s
    join tianyuan_users u on u.id=s.user_id
    where s.token_hash=$1 and s.expires_at>now()
  `,[tokenHash(token)]);
  return r.rows[0]||null;
}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.ip||"").split(",")[0].trim()}
const attempts=new Map();
function loginLimited(req){
  const key=clientIp(req),now=Date.now();
  const arr=(attempts.get(key)||[]).filter(t=>now-t<60_000);
  attempts.set(key,arr);
  return arr.length>=12;
}
function recordAttempt(req){const key=clientIp(req),arr=attempts.get(key)||[];arr.push(Date.now());attempts.set(key,arr.slice(-20))}

export async function initTianyuanAccounts(){
  if(!DATABASE_URL)return {enabled:false,error:"database-not-configured"};
  try{
    pool=new Pool({connectionString:DATABASE_URL,max:3,idleTimeoutMillis:30000});
    await pool.query(`
      create table if not exists tianyuan_users(
        id bigserial primary key,
        username text unique not null,
        password_hash text not null,
        display_name text not null,
        character text not null default 'farmer',
        role text not null default 'player',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table if not exists tianyuan_sessions(
        token_hash text primary key,
        user_id bigint not null references tianyuan_users(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create index if not exists tianyuan_sessions_user_idx on tianyuan_sessions(user_id);
      create index if not exists tianyuan_sessions_exp_idx on tianyuan_sessions(expires_at);
      create table if not exists tianyuan_saves(
        user_id bigint primary key references tianyuan_users(id) on delete cascade,
        payload jsonb not null default '{}'::jsonb,
        revision bigint not null default 1,
        updated_at timestamptz not null default now()
      );
    `);
    await pool.query("delete from tianyuan_sessions where expires_at<=now()");
    if(ADMIN_USERNAME&&ADMIN_PASSWORD&&validPassword(ADMIN_PASSWORD)){
      const uname=normalizeUsername(ADMIN_USERNAME);
      const ph=hashPassword(ADMIN_PASSWORD);
      await pool.query(`
        insert into tianyuan_users(username,password_hash,display_name,character,role)
        values($1,$2,$3,'farmer','admin')
        on conflict(username) do update set password_hash=excluded.password_hash,role='admin',updated_at=now()
      `,[uname,ph,ADMIN_USERNAME]);
    }
    ready=true;
    return {enabled:true};
  }catch(err){
    console.error("[tianyuan accounts]",String(err));
    ready=false;
    return {enabled:false,error:String(err)};
  }
}

export function registerTianyuanRoutes(app){
  app.post("/api/tianyuan/register",async(req,res)=>{
    if(!ready)return res.status(503).json({ok:false,error:"account-service-unavailable"});
    const username=normalizeUsername(req.body?.username);
    const password=String(req.body?.password||"");
    const character=CHARACTERS.has(req.body?.character)?req.body.character:"farmer";
    if(!validUsername(username))return res.status(400).json({ok:false,error:"username-invalid"});
    if(!validPassword(password))return res.status(400).json({ok:false,error:"password-invalid"});
    try{
      const hash=hashPassword(password);
      const r=await pool.query(
        "insert into tianyuan_users(username,password_hash,display_name,character,role) values($1,$2,$3,$4,'player') returning *",
        [username,hash,username,character]
      );
      const token=await createSession(r.rows[0].id);
      res.json({ok:true,token,user:publicUser(r.rows[0])});
    }catch(err){
      if(String(err?.code)==="23505")return res.status(409).json({ok:false,error:"username-exists"});
      console.error("[tianyuan register]",String(err));
      res.status(500).json({ok:false,error:"register-failed"});
    }
  });

  app.post("/api/tianyuan/login",async(req,res)=>{
    if(!ready)return res.status(503).json({ok:false,error:"account-service-unavailable"});
    if(loginLimited(req))return res.status(429).json({ok:false,error:"too-many-attempts"});
    const username=normalizeUsername(req.body?.username),password=String(req.body?.password||"");
    recordAttempt(req);
    const r=await pool.query("select * from tianyuan_users where username=$1",[username]);
    const user=r.rows[0];
    if(!user||!verifyPassword(password,user.password_hash))return res.status(401).json({ok:false,error:"invalid-credentials"});
    const token=await createSession(user.id);
    res.json({ok:true,token,user:publicUser(user)});
  });

  app.get("/api/tianyuan/me",async(req,res)=>{
    const user=await auth(req);
    if(!user)return res.status(401).json({ok:false,error:"unauthorized"});
    res.json({ok:true,user:publicUser(user)});
  });

  app.put("/api/tianyuan/profile",async(req,res)=>{
    const user=await auth(req);
    if(!user)return res.status(401).json({ok:false,error:"unauthorized"});
    const character=CHARACTERS.has(req.body?.character)?req.body.character:user.character;
    const displayName=String(req.body?.displayName||user.display_name||user.username).trim().slice(0,24)||user.username;
    const r=await pool.query("update tianyuan_users set character=$1,display_name=$2,updated_at=now() where id=$3 returning *",[character,displayName,user.id]);
    res.json({ok:true,user:publicUser(r.rows[0])});
  });

  app.get("/api/tianyuan/save",async(req,res)=>{
    const user=await auth(req);
    if(!user)return res.status(401).json({ok:false,error:"unauthorized"});
    const r=await pool.query("select payload,revision,updated_at from tianyuan_saves where user_id=$1",[user.id]);
    if(!r.rows[0])return res.json({ok:true,save:null});
    res.json({ok:true,save:{payload:r.rows[0].payload,revision:Number(r.rows[0].revision),updatedAt:r.rows[0].updated_at}});
  });

  app.put("/api/tianyuan/save",async(req,res)=>{
    const user=await auth(req);
    if(!user)return res.status(401).json({ok:false,error:"unauthorized"});
    const payload=req.body?.payload;
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return res.status(400).json({ok:false,error:"save-invalid"});
    if(Buffer.byteLength(JSON.stringify(payload),"utf8")>750000)return res.status(413).json({ok:false,error:"save-too-large"});
    const r=await pool.query(`
      insert into tianyuan_saves(user_id,payload,revision,updated_at)
      values($1,$2::jsonb,1,now())
      on conflict(user_id) do update set payload=excluded.payload,revision=tianyuan_saves.revision+1,updated_at=now()
      returning revision,updated_at
    `,[user.id,JSON.stringify(payload)]);
    res.json({ok:true,revision:Number(r.rows[0].revision),updatedAt:r.rows[0].updated_at});
  });

  app.post("/api/tianyuan/logout",async(req,res)=>{
    const header=String(req.headers.authorization||"");
    const token=header.startsWith("Bearer ")?header.slice(7).trim():"";
    if(token&&ready)await pool.query("delete from tianyuan_sessions where token_hash=$1",[tokenHash(token)]).catch(()=>{});
    res.json({ok:true});
  });
}
