'use strict';
// Standalone Football Dynasty game. Legacy chess application is not served.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const port=Number(process.env.PORT)||8080;
const root=path.resolve('/app/site');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
// Live in-memory cache: checked at boot and once per day. Persistent fallback is
// the curated, reproducible snapshot baked into the Railway image.
const vm=require('node:vm');
let snapshot={},lastCheck=null,lastError=null,sourceStatus="启动后自动检索",refreshRunning=null,lastAttempt=0,changedCount=0;
try{
 const context={window:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,"football-values.js"),"utf8"),context,{timeout:4000});
 snapshot=context.window.FOOTBALL_TM_VALUES||{};
}catch(error){lastError="初始身价数据库读取失败："+error.message;}
const CHECK_INTERVAL=24*60*60*1000;
const MIN_REFRESH_GAP=60*60*1000;
async function refreshMarket(){
 if(refreshRunning)return refreshRunning;
 if(Date.now()-lastAttempt<MIN_REFRESH_GAP)return Promise.resolve();
 lastAttempt=Date.now();
 refreshRunning=import("./scripts/market-refresh.mjs").then(mod=>
  mod.refreshMarketValues("/app",snapshot)).then(data=>{
   snapshot=data.values;lastCheck=data.checkedAt;lastError=null;
   sourceStatus=data.sourceStatus;
   changedCount=data.changedCount||0;
   console.log("[TM-AUTO]",sourceStatus,"matched",snapshot.coverage||0,
    "changed",changedCount,"latest historical date",snapshot.datasetCutoff);
 }).catch(error=>{
   lastCheck=new Date().toISOString();
   lastError=String(error.message||error).slice(0,280);
   sourceStatus="检索失败，继续使用原有核实数据";
   console.warn("[TM-AUTO] source unavailable; keeping valid cached data:",lastError);
 }).finally(()=>{refreshRunning=null;});
 return refreshRunning;
}
const startup=setTimeout(()=>void refreshMarket(),1500);startup.unref?.();
const daily=setInterval(()=>void refreshMarket(),CHECK_INTERVAL);daily.unref?.();
function marketPayload(){
 return JSON.stringify({ok:true,values:snapshot,status:sourceStatus,
  checkedAt:lastCheck,changedCount,checkIntervalHours:24,lastError,
  note:"Transfermarkt历史快照非实时API；无核实数据的球员保持待核实"});
}
const files={'/':'football.html','/index.html':'football.html','/game':'football.html','/game/':'football.html',
 '/football.html':'football.html','/football.css':'football.css','/football.js':'football.js',
 '/football-data.js':'football-data.js','/football-world.js':'football-world.js','/football-clubs.js':'football-clubs.js','/football-values.js':'football-values.js','/football-positions.js':'football-positions.js','/football-lineup.js':'football-lineup.js'};
http.createServer((req,res)=>{
 const pathname=String(req.url||'/').split('?')[0];
 const head={'Cache-Control':'no-store, max-age=0, must-revalidate',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
 if(pathname==="/api/market-values"&&["GET","HEAD"].includes(req.method)){
  const body=marketPayload();
  res.writeHead(200,{...head,"Content-Type":"application/json; charset=utf-8"});
  res.end(req.method==="HEAD"?"":body);return;
 }
 if(pathname==="/api/market-refresh"&&req.method==="POST"){
  // Public trigger is throttled to once/hour across requests; no upstream
  // credentials or arbitrary URL supplied by the caller.
  void refreshMarket().then(()=>{
   res.writeHead(200,{...head,"Content-Type":"application/json; charset=utf-8"});
   res.end(marketPayload());
  });return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){
   res.writeHead(405,{...head,'Allow':'GET, HEAD'});res.end('Method not allowed');return;
 }
 if(pathname==='/healthz'){
  res.writeHead(200,{...head,'Content-Type':'text/plain; charset=utf-8'});
  res.end(req.method==='HEAD'?'':'ok');return;
 }
 const name=files[pathname];
 if(!name){res.writeHead(404,{...head,'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?'':'Not found');return;}
 fs.readFile(path.join(root,name),(err,bytes)=>{
  if(err){res.writeHead(503,{...head,'Content-Type':'text/plain; charset=utf-8'});res.end('Temporarily unavailable');return;}
  res.writeHead(200,{...head,'Content-Type':mime[path.extname(name)]||'application/octet-stream'});
  if(req.method==='HEAD')res.end();else res.end(bytes);
 });
}).listen(port,'0.0.0.0');
