#!/usr/bin/env node
// Create (or find) the Render web service for the game server, then deploy it.
// The API key comes from ~/.config/hns/render.env and is never printed.
//
//   node tools/render-deploy.mjs            create if needed, then deploy
//   node tools/render-deploy.mjs status     just report

import { api } from './render-api.mjs';

const NAME = 'hide-and-seek-arena-server';
const REPO = 'https://github.com/twalkerallenii-spec/hide-and-seek-arena';

const owners = await api('GET', '/owners');
if (owners.status !== 200) {
  console.error('auth failed', owners.status, owners.raw);
  process.exit(1);
}
const ownerId = owners.json[0].owner.id;
console.log('owner:', owners.json[0].owner.name);

const list = await api('GET', '/services?limit=50');
let svc = (list.json || []).map(x => x.service || x).find(s => s && s.name === NAME);

if (process.argv[2] === 'status') {
  if (!svc) { console.log('no service yet'); process.exit(0); }
  const info = await api('GET', `/services/${svc.id}`);
  const d = await api('GET', `/services/${svc.id}/deploys?limit=3`);
  console.log('url:', info.json?.serviceDetails?.url);
  for (const row of (d.json || [])) {
    const dep = row.deploy || row;
    console.log(`  ${dep.status.padEnd(12)} ${dep.id}  ${dep.createdAt || ''}`);
  }
  process.exit(0);
}

if (svc) {
  console.log('service exists:', svc.id);
} else {
  console.log('creating service…');
  const created = await api('POST', '/services', {
    type: 'web_service',
    name: NAME,
    ownerId,
    repo: REPO,
    branch: 'main',
    autoDeploy: 'yes',
    rootDir: 'server',
    serviceDetails: {
      env: 'node',
      runtime: 'node',
      plan: 'free',
      region: 'oregon',
      healthCheckPath: '/health',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'node index.js',
      },
    },
    envVars: [
      { key: 'NODE_VERSION', value: '18.20.4' },
      { key: 'ALLOWED_ORIGINS', value: 'https://twalkerallenii-spec.github.io' },
      { key: 'MAX_ROOMS', value: '24' },
    ],
  });
  if (created.status !== 201) {
    console.error('create failed:', created.status);
    console.error(created.raw);
    process.exit(1);
  }
  svc = created.json.service || created.json;
  console.log('created:', svc.id);
}

const dep = await api('POST', `/services/${svc.id}/deploys`, {});
console.log('deploy:', dep.status, dep.json?.id || dep.raw.slice(0, 160));

const info = await api('GET', `/services/${svc.id}`);
const url = info.json?.serviceDetails?.url;
console.log('\nSERVICE  ' + svc.id);
console.log('URL      ' + (url || '(pending)'));
if (url) console.log('WS       ' + url.replace('https://', 'wss://') + '/ws');
