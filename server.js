'use strict';
const http = require('node:http');
const port = Number(process.env.PORT) || 8080;
http.createServer((req, res) => {
  const pathname = String(req.url || '/').split('?')[0];
  if (pathname === '/healthz') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    res.end('ok');
    return;
  }
  res.writeHead(410, {
    'Content-Type':'text/plain; charset=utf-8',
    'Cache-Control':'no-store, max-age=0, must-revalidate',
    'Pragma':'no-cache',
    'X-Content-Type-Options':'nosniff',
    'Clear-Site-Data':'"cache"'
  });
  res.end();
}).listen(port,'0.0.0.0');
