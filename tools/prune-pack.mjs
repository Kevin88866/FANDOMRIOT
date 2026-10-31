// 打包后瘦身：只保留游戏实际用到的第三方素材（动画、音效、用到的贴图和 HDR、许可说明），
// 其余下载的原始素材（Mixamo 原始人物、没用上的模型 / 贴图 / 字体……）不进安装包。
// 用法：node tools/prune-pack.mjs dist/FandomRiot-win32-x64/resources/app
import fs from 'node:fs';
import path from 'node:path';

const app = process.argv[2];
if (!app || !fs.existsSync(path.join(app, 'assets'))) { console.error('用法：node tools/prune-pack.mjs <app 目录>'); process.exit(1); }

// 源码里出现的所有 assets/thirdparty/... 路径和 pbrMat('目录/前缀')
const keep = new Set(['assets/thirdparty/CREDITS.md', 'assets/thirdparty/credits.json']);
const keepDirs = ['assets/thirdparty/anims/'];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(app, 'src')).filter(f => f.endsWith('.js'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/assets\/thirdparty\/[\w./-]+\.(ogg|mp3|wav|hdr|exr|jpg|png|glb|ttf|otf|woff2?)/g)) keep.add(m[0]);
  for (const m of s.matchAll(/pbrMat\('([\w-]+)\/([\w-]+)'/g)) keepDirs.push(`assets/thirdparty/textures/${m[1]}/`);
}
// 用到的 Blender 模型：MODEL_LIST + 人物
const list = fs.readFileSync(path.join(app, 'src/engine/assets.js'), 'utf8').match(/MODEL_LIST = \[([\s\S]*?)\]/)[1];
const models = new Set([...list.matchAll(/'([\w]+)'/g)].map(m => m[1]));

let removed = 0, bytes = 0;
const rm = f => { bytes += fs.statSync(f).size; fs.rmSync(f); removed++; };
for (const f of walk(path.join(app, 'assets/thirdparty'))) {
  const rel = path.relative(app, f).split(path.sep).join('/');
  if (keep.has(rel) || keepDirs.some(d => rel.startsWith(d))) continue;
  rm(f);
}
for (const f of fs.readdirSync(path.join(app, 'assets/models'))) {
  const p = path.join(app, 'assets/models', f);
  if (f.endsWith('.glb') && !models.has(f.slice(0, -4))) rm(p);
}
// 删掉空目录
const prune = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(d, e.name)); if (!fs.readdirSync(d).length) fs.rmdirSync(d); };
prune(path.join(app, 'assets/thirdparty'));
console.log(`已移除 ${removed} 个未使用的素材文件（${(bytes / 1048576).toFixed(0)} MB）`);
