'use strict';
// Dedicated static learning site. Previous website files and services are not mounted.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const port=Number(process.env.PORT)||8080;
const root=path.resolve('/app/site');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/data.json':'data.json'};
http.createServer((req,res)=>{
 const pathname=String(req.url||'/').split('?')[0];
 const head={'Cache-Control':'no-store, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
 if(pathname==='/healthz'){
  res.writeHead(200,{...head,'Content-Type':'text/plain; charset=utf-8'});
  res.end('ok');return;
 }
 const name=files[pathname];
 if(!name){
  res.writeHead(410,{...head,'Content-Type':'text/plain; charset=utf-8'});
  res.end('Content removed');return;
 }
 const file=path.join(root,name);
 fs.readFile(file,(err,bytes)=>{
  if(err){res.writeHead(503,{...head,'Content-Type':'text/plain; charset=utf-8'});res.end('Temporarily unavailable');return;}
  res.writeHead(200,{...head,'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  if(req.method==='HEAD')res.end();else res.end(bytes);
 });
}).listen(port,'0.0.0.0');
