import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gzipSync } from 'node:zlib';
import { createHash, timingSafeEqual } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const assets = new Map();
for (const name of fs.readdirSync(publicRoot)) {
  const file = path.join(publicRoot, name);
  if (fs.statSync(file).isFile() && !name.startsWith('event-logo.part')) assets.set('/' + name, { file, size: fs.statSync(file).size });
}

// Rebuild the original event logo from text chunks so Git stores no re-rendered or generated branding.
const eventLogoParts = ['01','02','03','04','05','06'].map(n => fs.readFileSync(path.join(publicRoot, 'event-logo.part' + n), 'utf8').trim());
const eventLogoBase64 = eventLogoParts.join('');
const eventLogo = Buffer.from(eventLogoBase64, 'base64');
if (eventLogo.length !== 38658 || eventLogo.subarray(0, 4).toString('ascii') !== 'RIFF' || eventLogo.subarray(8, 12).toString('ascii') !== 'WEBP') {
  throw new Error('Invalid event logo asset');
}
assets.set('/event-logo.webp', { content: eventLogo, size: eventLogo.length });

let rulebook, json;
try {
  json = brotliDecompressSync(Buffer.from(process.env.RULEBOOK_DATA_BROTLI_BASE64 || '', 'base64'), { maxOutputLength: 2 * 1024 * 1024 });
  rulebook = JSON.parse(json.toString('utf8'));
  for (const key of ['rules', 'boards', 'roles', 'faq']) if (!Array.isArray(rulebook[key])) throw new Error('Invalid rulebook');
  const dedupe = items => {
    const seen = new Set();
    return items.filter(item => {
      const key = String(item.id || '') + '|' + String(item.title || '').trim() + '|' + String(item.summary || '').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  rulebook.rules = dedupe(rulebook.rules);
  rulebook.boards = dedupe(rulebook.boards.filter(item => item.official !== false));
  rulebook.roles = dedupe(rulebook.roles.filter(item => item.official === true));
  rulebook.faq = dedupe(rulebook.faq);

  // Remove traces of external reference libraries while preserving our own season-one manual page references.
  const EXTERNAL_REF_RE = /(逻辑\s*与\s*谎言|\bLAL\b|werewolves\.games|外部规则库|外部参考|参考来源)/i;
  const EXTERNAL_META_KEYS = new Set([
    'source','sources','reference','references','origin','origins','credit','credits',
    'sourceurl','source_url','external','externalref','external_ref','externalsource',
    'external_source','referenceurl','reference_url'
  ]);
  const cleanExternalRefs = value => {
    if (Array.isArray(value)) {
      return value
        .filter(item => !(typeof item === 'string' && EXTERNAL_REF_RE.test(item)))
        .map(cleanExternalRefs)
        .filter(item => item !== undefined && item !== null);
    }
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[-\s]/g, '');
      // Keep pages: these are page references to the official Chengdu season-one manual.
      if (key === 'pages') { out[key] = val; continue; }
      if (EXTERNAL_REF_RE.test(key)) continue;
      if (EXTERNAL_META_KEYS.has(normalizedKey)) continue;
      if (typeof val === 'string' && EXTERNAL_REF_RE.test(val)) continue;
      const cleaned = cleanExternalRefs(val);
      if (cleaned !== undefined && cleaned !== null) out[key] = cleaned;
    }
    return out;
  };
  const cleanCollection = items => items
    .filter(item => !EXTERNAL_REF_RE.test(String(item?.title || '')))
    .map(cleanExternalRefs);
  rulebook.rules = cleanCollection(rulebook.rules);
  rulebook.boards = cleanCollection(rulebook.boards);
  rulebook.roles = cleanCollection(rulebook.roles);
  rulebook.faq = cleanCollection(rulebook.faq);
  rulebook = cleanExternalRefs(rulebook);
  if (EXTERNAL_REF_RE.test(JSON.stringify(rulebook))) {
    throw new Error('External reference trace remains after cleanup');
  }

  // Chengdu event ruling: once the last god is eliminated, the game ends immediately.
  const LAST_HUNTER_SETTLEMENT = '若猎人是场上最后一名神职且夜间被狼人击杀，屠神条件即时达成，狼人直接获胜，不再结算猎人开枪。';
  const isLastHunterQuestion = item => {
    const text = JSON.stringify(item || {});
    return text.includes('猎人') && /(最后一神|最后一个神|最后神职|最后一名神职|屠神)/.test(text) && /(开枪|带人|发动技能)/.test(text);
  };
  rulebook.faq = rulebook.faq.filter(item => !isLastHunterQuestion(item));

  const hunter = rulebook.roles.find(item => String(item.title || '').trim() === '猎人');
  if (hunter) {
    if (!Array.isArray(hunter.items)) hunter.items = [];
    if (!hunter.items.includes(LAST_HUNTER_SETTLEMENT)) hunter.items.push(LAST_HUNTER_SETTLEMENT);
  }
  delete rulebook.reference;
  rulebook.glossary = [];
  json = Buffer.from(JSON.stringify(rulebook), 'utf8');
} catch {
  console.error('Rulebook runtime data is missing or invalid');
  process.exit(1);
}
const compressedJson = gzipSync(json);
console.log(`Rulebook loaded: ${rulebook.boards.length} boards, ${rulebook.roles.length} roles, ${rulebook.rules.length} rules, ${rulebook.faq.length} faq`);
const localAssetDir = process.env.NODE_ENV !== 'production' ? process.env.RULEBOOK_LOCAL_ASSET_DIR : null;
const s3 = localAssetDir ? null : new S3Client({
  endpoint: process.env.RULEBOOK_S3_ENDPOINT,
  region: process.env.RULEBOOK_S3_REGION || 'auto',
  credentials: { accessKeyId: process.env.RULEBOOK_S3_ACCESS_KEY_ID, secretAccessKey: process.env.RULEBOOK_S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  maxAttempts: 2
});
const bucket = process.env.RULEBOOK_S3_BUCKET;
const storedAssets = new Map();
const allowedUploads = new Map([['season-one-manual.pdf', 'application/pdf'], ['manual-brand.png', 'image/png']]);

async function readStoredAsset(name) {
  if (storedAssets.has(name)) return storedAssets.get(name);
  let content;
  if (localAssetDir) {
    try { content = await fs.promises.readFile(path.join(localAssetDir, name)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  } else {
    try {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: name }));
      content = Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if (error.name === 'NoSuchKey') return null;
      throw error;
    }
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
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: content, ContentType: allowedUploads.get(name), ContentLength: content.length }));
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
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { s3?.destroy(); process.exit(0); }));
