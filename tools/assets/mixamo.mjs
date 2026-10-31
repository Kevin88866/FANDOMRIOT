// Mixamo batch downloader. Attaches to the logged-in Chromium (browser.mjs, CDP :9333) and drives the
// same JSON API the Mixamo web app uses: search -> export -> monitor -> download.
//
//   node mixamo.mjs list Character|Motion [query] > out.json
//   node mixamo.mjs chars plan.json       plan: [{id, name}]              FBX binary, T-pose, with skin
//   node mixamo.mjs anims plan.json       plan: [{id, name, inplace?}]    on Y Bot, without skin
// Files land in ../../../_staging/mixamo/{chars,anims}/<name>.fbx; a manifest.json records product info.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const STAGE = path.resolve(here, '../../../_staging/mixamo');
// Playwright lives outside the repo (../../../_tools) so the game's package.json stays untouched.
const { chromium } = createRequire(path.resolve(here, '../../../_tools/package.json'))('playwright');
const API = 'https://www.mixamo.com/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Token comes from MIXAMO_TOKEN (read from any logged-in Mixamo tab), else from the CDP browser (browser.mjs).
let token = process.env.MIXAMO_TOKEN;
if (!token) {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('mixamo.com'));
  if (!page) throw new Error('no mixamo tab open');
  token = await page.evaluate(() => localStorage.getItem('access_token'));
}
if (!token) throw new Error('no access_token - not logged in?');
const H = { Authorization: `Bearer ${token}`, 'X-Api-Key': 'mixamo2', 'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json', Accept: 'application/json' };

async function api(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
    throw new Error(`${r.status} ${url} ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error(`gave up ${url}`);
}

async function list(type, query = '') {
  const out = [];
  for (let p = 1; ; p++) {
    const r = await api(`${API}/products?page=${p}&limit=96&order=&type=${type}&query=${encodeURIComponent(query)}`);
    out.push(...r.results.map((x) => ({ id: x.id, name: x.name, description: x.description, type: x.type })));
    if (p >= r.pagination.num_pages) break;
    await sleep(800);
  }
  return out;
}

async function exportAndDownload(characterId, body, dest) {
  await api(`${API}/animations/export`, { method: 'POST', body: JSON.stringify(body) });
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const m = await api(`${API}/characters/${characterId}/monitor`);
    if (m.status === 'completed') {
      const r = await fetch(m.job_result);
      if (!r.ok) throw new Error(`download ${r.status}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (m.status === 'failed') throw new Error(`export failed: ${JSON.stringify(m).slice(0, 200)}`);
  }
  throw new Error('export timed out');
}

async function runPlan(kind, plan) {
  const dir = path.join(STAGE, kind);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  let ybot;
  if (kind === 'anims') {
    ybot = (await list('Character', 'Y Bot')).find((c) => c.name === 'Y Bot');
    if (!ybot) throw new Error('Y Bot not found');
  }
  const failed = [];
  for (const item of plan) {
    const dest = path.join(dir, `${item.name}.fbx`);
    if (fs.existsSync(dest)) { console.log('skip', item.name); continue; }
    try {
      if (kind === 'chars') {
        await exportAndDownload(item.id, {
          character_id: item.id, product_name: item.name, type: 'Character', gms_hash: null,
          preferences: { format: 'fbx7_2019', mesh: 't-pose' },
        }, dest);
      } else {
        const prod = await api(`${API}/products/${item.id}?similar=0&character_id=${ybot.id}`);
        const g = prod.details.gms_hash;
        const gms = { 'model-id': g['model-id'], mirror: false, trim: g.trim, overdrive: 0, inplace: !!item.inplace,
          'arm-space': g['arm-space'] ?? 0, params: g.params.map((p) => p[1]).join(',') };
        await exportAndDownload(ybot.id, {
          character_id: ybot.id, product_name: prod.description || prod.name, type: 'Motion', gms_hash: [gms],
          preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
        }, dest);
        manifest[item.name] = { id: item.id, title: prod.name, description: prod.description };
      }
      if (kind === 'chars') manifest[item.name] = { id: item.id, title: item.title || item.name };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
      console.log('ok', item.name, (fs.statSync(dest).size / 1e6).toFixed(1), 'MB');
    } catch (e) {
      failed.push(item.name);
      console.log('FAIL', item.name, String(e).slice(0, 300));
    }
    await sleep(4000 + Math.random() * 3000); // be gentle
  }
  console.log('failed:', JSON.stringify(failed));
}

const [mode, arg, q] = process.argv.slice(2);
if (mode === 'list') console.log(JSON.stringify(await list(arg, q || ''), null, 1));
else await runPlan(mode, JSON.parse(fs.readFileSync(arg, 'utf8')));
// No browser.close(): that would shut the shared headed browser down.
process.exit(0);
