'use strict';
// Standalone Football Dynasty game. Legacy chess application is not served.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const port=Number(process.env.PORT)||8080;
const root=path.resolve('/app/site');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const files={'/':'football.html','/index.html':'football.html','/game':'football.html','/game/':'football.html',
 '/football.html':'football.html','/football.css':'football.css','/football.js':'football.js',
 '/football-data.js':'football-data.js','/football-world.js':'football-world.js'};
http.createServer((req,res)=>{
 const pathname=String(req.url||'/').split('?')[0];
 const head={'Cache-Control':'no-store, max-age=0, must-revalidate',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
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
