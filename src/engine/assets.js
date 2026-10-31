import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Blender 导出的模型（tools/blender/*.py 生成 assets/models/*.glb）
// 约定：材质 paint = 可换色车漆；emit_* = 发光件；名字以 screen_/sign_/ribbon/cloth 开头的面运行时贴文字。
export const MODEL_LIST = [
  'car_sedan', 'car_taxi', 'car_van', 'car_pickup', 'car_bus', 'car_ledtruck', 'car_coffee', 'car_scooter',
  'st_lamp', 'st_signal', 'st_busstop', 'st_vending', 'st_pole', 'st_rail', 'st_planter', 'st_bench', 'st_bin',
  'st_bollard', 'st_hydrant', 'st_cone',
  'pr_wreath_w', 'pr_wreath_p', 'pr_basket', 'pr_banner', 'pr_picket', 'pr_fireworks',
  'bd_ac', 'bd_vsign', 'bd_tank', 'bd_stair', 'bd_condenser', 'bd_dish', 'bd_antenna',
  'lm_t0', 'lm_hwl', 'lm_arena',
  'shop_conv', 'shop_cafe', 'shop_chicken', 'shop_pcbang', 'shop_phone',
  'tr_maple0', 'tr_maple2', 'tr_maple4', 'acc_cap', 'acc_beanie', 'acc_backpack', 'acc_crossbag', 'acc_hair', 'acc_hair_long',
];
const store = {};
const EMIT = { emit_head: 3, emit_tail: 2.5, emit_amber: 2, emit_warm: 1.6 };
const TEXT_SURFACE = /^(screen|sign_|ribbon|cloth)/;

export async function loadModels(list = MODEL_LIST, onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(list.map(async name => {
    try {
      const g = await loader.loadAsync(`assets/models/${name}.glb`);
      prepare(g.scene);
      if (name.startsWith('shop_')) shopGlow(g.scene);
      store[name] = g.scene;
    } catch (e) {
      console.warn('模型加载失败，改用程序化模型：', name, e);
    }
    onProgress?.(++done / list.length);
  }));
}

function prepare(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (TEXT_SURFACE.test(o.name) || m.name.startsWith('facade')) flipV(o.geometry);
    if (EMIT[m.name] !== undefined) m.emissiveIntensity = EMIT[m.name];
    if (m.name === 'glass') { m.envMapIntensity = 1.4; }
    if (m.name.startsWith('leaf_')) leafMaterial(m);
    if (m.name.startsWith('glass_clear')) { m.transparent = true; m.opacity = 0.16; m.depthWrite = false; m.roughness = 0.03; m.metalness = 0; m.envMapIntensity = 1.6; o.renderOrder = 2; }
    if (m.name.startsWith('emit_shop') || m.name.startsWith('emit_cold') || m.name.startsWith('emit_screen') || m.name.startsWith('emit_rgb')) m.emissiveIntensity = 1.4;
  });
}

// 叶片卡片：透明裁切、双面、顶点着色器里随风轻摆（越高摆得越多，每棵树相位不同）
export const wind = { value: 0 };
function leafMaterial(m) {
  if (m.userData.leaf) return;
  m.userData.leaf = true;
  m.transparent = false; m.alphaTest = 0.45; m.side = THREE.DoubleSide; m.depthWrite = true;
  m.roughness = 0.8; m.metalness = 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float hgt = max(0.0, position.y - 1.5);
      transformed.x += sin(uWind * 1.3 + ph + position.y * 0.6) * 0.035 * hgt;
      transformed.z += cos(uWind * 1.1 + ph * 1.7 + position.x * 0.8) * 0.03 * hgt;`);
  };
  m.customProgramCacheKey = () => 'leafwind';
}

// 店铺内景没有真实灯光：给内饰材质加一层随昼夜变化的自发光（颜色取自底色 / 贴图 / 顶点 AO），夜里像开着灯
const glowDone = new Set();
function shopGlow(root) {
  root.traverse(o => {
    const m = o.isMesh && o.material;
    if (!m || glowDone.has(m) || m.name.startsWith('emit_') || m.name.startsWith('glass') || m.name === 'frame' || m.name === 'chrome') return;
    glowDone.add(m);
    m.emissive = m.color.clone().multiply(new THREE.Color(1, 0.93, 0.82)); m.emissiveMap = m.map || null; m.emissiveIntensity = 0.55;
    m.userData.shopGlow = true;
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    m.customProgramCacheKey = () => 'shopglow';
    m.needsUpdate = true;
  });
}

// glTF 的 V 轴和 CanvasTexture（flipY）相反：翻一次，文字才不会倒过来
function flipV(geo) {
  const uv = geo.attributes.uv;
  if (!uv || geo.userData.flipped) return;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true; geo.userData.flipped = true;
}

export const hasModel = name => !!store[name];

// 克隆（几何体和材质共享，很省内存）；需要单独改的材质用 recolor 换成副本
export function model(name) {
  const src = store[name];
  return src ? src.clone(true) : null;
}

const paintCache = new Map();
export function recolor(obj, color, matName = 'paint') {
  if (color === undefined || color === null) return;
  const hex = new THREE.Color(color).getHex();
  obj.traverse(o => {
    if (!o.isMesh || o.material.name !== matName) return;
    const key = matName + ':' + hex + ':' + o.material.uuid;
    let m = paintCache.get(key);
    if (!m) { m = o.material.clone(); m.color.setHex(hex); paintCache.set(key, m); }
    o.material = m;
  });
}

// 按名字前缀找部件
export function named(obj, prefix) {
  const out = [];
  obj.traverse(o => { if (o.name.startsWith(prefix)) out.push(o); });
  return out;
}

// 大量重复的静态物体（路灯、电线杆、护栏、花坛）：每个部件一个 InstancedMesh
export function instanced(name, matrices, parent, skip) {
  const src = store[name];
  if (!src || !matrices.length) return [];
  src.updateMatrixWorld(true);
  const out = [];
  src.traverse(o => {
    if (!o.isMesh || (skip && skip(o))) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const im = new THREE.InstancedMesh(g, o.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true; im.name = o.name;
    parent.add(im); out.push(im);
  });
  return out;
}

// 模型里的发光材质交给城市的昼夜系统（夜里更亮）
export function registerNight(obj, city) {
  if (!city) return;
  const set = city._nightSet || (city._nightSet = new Set(city.nightMats));
  obj.traverse(o => {
    const m = o.material;
    if (o.isMesh && m && m.name && (m.name.startsWith('emit_') || m.userData.shopGlow) && !set.has(m)) { set.add(m); m.userData.night = true; city.nightMats.push(m); }
  });
}

// 模型各部件的几何体（已变换到模型坐标系），用于手动合并（比如竖排招牌的文字面要按图集改 UV）
export function partGeos(name) {
  const src = store[name];
  if (!src) return [];
  src.updateMatrixWorld(true);
  const out = [];
  src.traverse(o => { if (o.isMesh) out.push({ name: o.name, material: o.material, geometry: o.geometry.clone().applyMatrix4(o.matrixWorld) }); });
  return out;
}
