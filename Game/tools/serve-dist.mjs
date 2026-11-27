// Minimal static server for the production build (dist/), used by local
// browser verification. Usage: node tools/serve-dist.mjs [listenPort]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const listenOn = Number(process.argv[2] ?? 4173);
const types = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path === '' ? 'index.html' : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    const body = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
  }
}).listen(listenOn, '127.0.0.1', () => console.log(`serving dist on ${listenOn}`));
