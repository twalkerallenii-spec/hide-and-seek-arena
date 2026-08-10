#!/usr/bin/env node
// Creates the GitHub repo (if missing) and enables GitHub Pages.
//
// The token is read from git's own credential helper and used only to make the
// two API calls below — it is never printed, logged, or written anywhere.

import { spawn } from 'node:child_process';
import https from 'node:https';

const OWNER = process.argv[2] || 'twalkerallenii-spec';
const REPO = process.argv[3] || 'hide-and-seek-arena';
const DESC = 'Twelve first-person 3D arenas in the browser. Every texture, mesh and sound generated at runtime.';

function gitCredential() {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['credential', 'fill'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => {
      const m = {};
      for (const line of out.split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) m[line.slice(0, i)] = line.slice(i + 1);
      }
      if (!m.password) reject(new Error('no stored credential for github.com'));
      else resolve(m.password);
    });
    p.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}

function api(token, method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path, method,
      headers: {
        'authorization': 'Bearer ' + token,
        'accept': 'application/vnd.github+json',
        'user-agent': 'hide-and-seek-setup',
        'x-github-api-version': '2022-11-28',
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch { }
        resolve({ status: res.statusCode, json, raw: b.slice(0, 400) });
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const token = await gitCredential();

  const who = await api(token, 'GET', '/user');
  if (who.status !== 200) {
    console.error('auth failed:', who.status, who.raw);
    process.exit(1);
  }
  console.log('authenticated as', who.json.login);

  const exists = await api(token, 'GET', `/repos/${OWNER}/${REPO}`);
  if (exists.status === 200) {
    console.log('repo already exists:', exists.json.html_url);
  } else {
    const isOrg = OWNER.toLowerCase() !== who.json.login.toLowerCase();
    const created = await api(token, 'POST', isOrg ? `/orgs/${OWNER}/repos` : '/user/repos', {
      name: REPO,
      description: DESC,
      homepage: `https://${OWNER}.github.io/${REPO}/`,
      private: false,
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    });
    if (created.status === 201) console.log('repo created:', created.json.html_url);
    else { console.error('create failed:', created.status, created.raw); process.exit(1); }
  }

  // Topics help the repo get found; harmless if it fails.
  await api(token, 'PUT', `/repos/${OWNER}/${REPO}/topics`, {
    names: ['threejs', 'webgl', 'game', 'procedural-generation', 'first-person', 'javascript', 'browser-game'],
  });

  const pages = await api(token, 'POST', `/repos/${OWNER}/${REPO}/pages`, {
    source: { branch: 'main', path: '/' },
  });
  if (pages.status === 201) console.log('pages enabled:', pages.json.html_url);
  else if (pages.status === 409) {
    const cur = await api(token, 'GET', `/repos/${OWNER}/${REPO}/pages`);
    console.log('pages already enabled:', cur.json?.html_url || '(unknown)');
  } else {
    console.log('pages setup returned', pages.status, '-', pages.raw.slice(0, 160));
  }
  console.log('done');
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
