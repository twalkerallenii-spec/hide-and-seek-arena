#!/usr/bin/env node
// Thin Render.com API client. The key is read from ~/.config/hns/render.env and
// is never printed, logged, or written into the repo.
//
//   node tools/render-api.mjs whoami
//   node tools/render-api.mjs services
//   node tools/render-api.mjs owners

import https from 'node:https';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function key() {
  const envKey = process.env.RENDER_API_KEY;
  if (envKey) return envKey;
  const txt = readFileSync(join(homedir(), '.config/hns/render.env'), 'utf8');
  const m = txt.match(/RENDER_API_KEY=(.+)/);
  if (!m) throw new Error('RENDER_API_KEY not found');
  return m[1].trim();
}

export function api(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.render.com',
      path: '/v1' + path,
      method,
      headers: {
        authorization: 'Bearer ' + key(),
        accept: 'application/json',
        'user-agent': 'hide-and-seek-deploy',
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch { }
        resolve({ status: res.statusCode, json, raw: b.slice(0, 900) });
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'whoami';
  const map = { whoami: '/owners', owners: '/owners', services: '/services?limit=20' };
  const r = await api('GET', map[cmd] || cmd);
  console.log('HTTP', r.status);
  if (r.json) console.log(JSON.stringify(r.json, null, 1).slice(0, 2000));
  else console.log(r.raw || r.error);
}
