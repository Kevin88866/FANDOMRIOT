import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Blender 导出的模型（tools/blender/*.py 生成 assets/models/*.glb）
// 约定：材质 paint = 可换色车漆；emit_* = 发光件；名字以 screen_/sign_/ribbon/cloth 开头的面运行时贴文字。
export const MODEL_LIST = [
  'car_sedan', 'car_taxi', 'car_van', 'car_pickup', 'car_bus', 'car_ledtruck', 'car_coffee', 'car_scooter',
  'st_lamp', 'st_signal', 'st_busstop', 'st_vending', 'st_pole', 'st_rail', 'st_planter', 'st_bench', 'st_bin',
  'st_bollard', 'st_hydrant', 'st_cone',
  'pr_wreath_w', 'pr_wreath_p', 'pr_basket', 'pr_banner', 'pr_picket', 'pr_fireworks',
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
    if (TEXT_SURFACE.test(o.name)) flipV(o.geometry);
    const m = o.material;
    if (EMIT[m.name] !== undefined) m.emissiveIntensity = EMIT[m.name];
    if (m.name === 'glass') { m.envMapIntensity = 1.4; }
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
    if (o.isMesh && m && m.name && m.name.startsWith('emit_') && !set.has(m)) { set.add(m); m.userData.night = true; city.nightMats.push(m); }
  });
}
