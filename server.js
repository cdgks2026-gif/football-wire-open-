import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gzipSync } from 'node:zlib';
import { createHash, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf' };
const assets = new Map();
for (const name of fs.readdirSync(publicRoot)) {
  const file = path.join(publicRoot, name);
  if (fs.statSync(file).isFile()) assets.set('/' + name, { file, size: fs.statSync(file).size });
}

let rulebook, json;
try {
  json = brotliDecompressSync(Buffer.from(process.env.RULEBOOK_DATA_BROTLI_BASE64 || '', 'base64'), { maxOutputLength: 2 * 1024 * 1024 });
  rulebook = JSON.parse(json.toString('utf8'));
  for (const key of ['rules', 'boards', 'roles', 'faq', 'reference', 'glossary']) if (!Array.isArray(rulebook[key])) throw new Error('Invalid rulebook');
} catch {
  console.error('Rulebook runtime data is missing or invalid');
  process.exit(1);
}
const compressedJson = gzipSync(json);
const localAssetDir = process.env.NODE_ENV !== 'production' ? process.env.RULEBOOK_LOCAL_ASSET_DIR : null;
const pool = localAssetDir ? null : new pg.Pool({ connectionString: process.env.RULEBOOK_ASSET_DATABASE_URL || process.env.APP_DATABASE_URL, max: 3, connectionTimeoutMillis: 8000 });
const storedAssets = new Map();
let tableReady;
const allowedUploads = new Map([['season-one-manual.pdf', 'application/pdf'], ['manual-brand.png', 'image/png']]);

async function ensureTable() {
  if (!tableReady) tableReady = pool.query('CREATE TABLE IF NOT EXISTS cm_rulebook_assets (name TEXT PRIMARY KEY, content BYTEA NOT NULL, content_type TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())').catch(error => { tableReady = null; throw error; });
  return tableReady;
}

async function readStoredAsset(name) {
  if (storedAssets.has(name)) return storedAssets.get(name);
  let content;
  if (localAssetDir) {
    try { content = await fs.promises.readFile(path.join(localAssetDir, name)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  } else {
    await ensureTable();
    const result = await pool.query('SELECT content FROM cm_rulebook_assets WHERE name = $1', [name]);
    if (!result.rows.length) return null;
    content = result.rows[0].content;
  }
  const asset = { content, size: content.length };
  storedAssets.set(name, asset);
  return asset;
}

function authorized(req) {
  const expected = process.env.RULEBOOK_ASSET_UPLOAD_TOKEN;
  const supplied = req.headers.authorization || '';
  if (!expected) return false;
  const a = Buffer.from(supplied), b = Buffer.from('Bearer ' + expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function uploadAsset(req, res, name) {
  if (!allowedUploads.has(name)) return reply(req, res, 404, 'Not found');
  if (!authorized(req)) { req.resume(); return reply(req, res, 401, 'Unauthorized'); }
  const maximum = 12 * 1024 * 1024;
  if (Number(req.headers['content-length']) > maximum) { req.resume(); return reply(req, res, 413, 'Asset too large'); }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) { req.resume(); return reply(req, res, 413, 'Asset too large'); }
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  const valid = name.endsWith('.pdf') ? content.subarray(0, 5).equals(Buffer.from('%PDF-')) : content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!valid) return reply(req, res, 400, 'Invalid asset format');
  if (localAssetDir) {
    await fs.promises.mkdir(localAssetDir, { recursive: true });
    await fs.promises.writeFile(path.join(localAssetDir, name), content);
  } else {
    await ensureTable();
    await pool.query('INSERT INTO cm_rulebook_assets(name, content, content_type) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content, content_type = EXCLUDED.content_type, updated_at = NOW()', [name, content, allowedUploads.get(name)]);
  }
  storedAssets.set(name, { content, size });
  reply(req, res, 201, JSON.stringify({ name, bytes: size, sha256: createHash('sha256').update(content).digest('hex') }), 'application/json; charset=utf-8');
}

function reply(req, res, status, value, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(value);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendAsset(req, res, pathname, asset) {
  res.setHeader('Content-Type', mime[path.extname(pathname)] || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  if (pathname.endsWith('.pdf')) res.setHeader('Content-Disposition', 'inline');
  if (pathname.endsWith('.html')) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  let start = 0, end = asset.size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader('Content-Range', `bytes */${asset.size}`);
      return reply(req, res, 416, 'Invalid range');
    }
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), asset.size - 1);
    } else start = Math.max(0, asset.size - Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= asset.size || end < start) {
      res.setHeader('Content-Range', `bytes */${asset.size}`);
      return reply(req, res, 416, 'Invalid range');
    }
    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${asset.size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  res.writeHead(status);
  if (req.method === 'HEAD') return res.end();
  if (asset.content) return res.end(asset.content.subarray(start, end + 1));
  const stream = fs.createReadStream(asset.file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return reply(req, res, 400, 'Invalid path'); }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(segment => segment === '..')) return reply(req, res, 400, 'Invalid path');
  try {
    if (req.method === 'PUT' && pathname.startsWith('/__rulebook/assets/')) return await uploadAsset(req, res, pathname.slice('/__rulebook/assets/'.length));
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return reply(req, res, 405, 'Method not allowed'); }
    if (pathname === '/healthz' || pathname === '/api/status') return reply(req, res, 200, JSON.stringify({ ok: true, app: 'chengdu-capital-master-rulebook', version: '1.0.0' }), 'application/json; charset=utf-8');
    if (pathname === '/api/rulebook') {
      res.setHeader('Vary', 'Accept-Encoding');
      if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.setHeader('Content-Encoding', 'gzip'); return reply(req, res, 200, compressedJson, 'application/json; charset=utf-8'); }
      return reply(req, res, 200, json, 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return reply(req, res, 410, JSON.stringify({ error: '网站已更新为狼人杀规则库，请返回首页查阅。' }), 'application/json; charset=utf-8');
    if (pathname === '/') pathname = '/index.html';
    const storedName = pathname.slice(1);
    const asset = allowedUploads.has(storedName) ? await readStoredAsset(storedName) : assets.get(pathname);
    if (!asset) {
      if (!path.extname(pathname) || pathname.startsWith('/story/') || pathname.startsWith('/tianyuan/')) { res.writeHead(302, { Location: '/' }); return res.end(); }
      return reply(req, res, 404, 'Not found');
    }
    return sendAsset(req, res, pathname, asset);
  } catch (error) {
    console.error('Rulebook asset storage failed:', error?.code || error?.name || 'unknown');
    return reply(req, res, 503, 'Asset storage is temporarily unavailable');
  }
});

const port = Number(process.env.PORT || 8088);
server.listen(port, '0.0.0.0', () => console.log(`Chengdu rulebook listening on ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { if (pool) await pool.end(); process.exit(0); }));
