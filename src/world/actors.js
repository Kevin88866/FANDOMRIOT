import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { model as glbModel } from '../engine/assets.js';

// 三个 Mixamo 角色骨骼同名，但导出时各自的坐标轴和骨骼朝向不同，动画不能直接套用。
// 这里做"世界空间重定向"：逐帧采样源模型每根骨骼的世界旋转相对静止姿势的变化量，
// 再施加到目标模型对应骨骼的静止姿势上，最后换算回局部旋转。加载时一次性算好并缓存。
const SRC = { michelle: 'assets/models/Michelle.glb', soldier: 'assets/models/Soldier.glb', xbot: 'assets/models/Xbot.glb' };
const PREFER = { idle: 'xbot', walk: 'xbot', run: 'xbot' };   // 基础移动动画用 Xbot 的（最标准）
const FPS = 30;
const FACING = { soldier: Math.PI };   // Soldier 模型默认朝 -Z，转过来和其他人一致
export const Models = {};
const Raw = {};          // 动画名 → { clip, from }
const cache = {};        // `${kind}:${name}` → 重定向后的动画

export async function loadActors(onProgress) {
  const loader = new GLTFLoader();
  let i = 0;
  for (const [k, url] of Object.entries(SRC)) {
    const g = await loader.loadAsync(url);
    Models[k] = g;
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene), h = box.max.y - box.min.y;
    g.unit = h > 0.1 ? 1.72 / h : 1;
    for (const c of g.animations) {
      // 只保留旋转轨道：不同模型缩放不一致，位移会漂移；Xbot 独有的眼睛骨骼也去掉
      c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') && !t.name.includes('Eye'));
      const key = c.name.toLowerCase();
      if (key === 'tpose') { g.tpose = c; continue; }
      if (!Raw[key] || PREFER[key] === k) Raw[key] = { clip: c, from: k };
    }
    onProgress?.(++i / 3);
  }
}

export function hasClip(name) { return !!Raw[name]; }

// 参考姿势统一用 T-pose：模型自带 TPose 动画就用它，否则（Xbot）静止姿势本身就是 T-pose。
// 在一个临时副本上摆好姿势，记录每根骨骼相对模型根的世界旋转。
const refCache = {};
function refPose(kind) {
  if (refCache[kind]) return refCache[kind];
  const sc = SkeletonUtils.clone(Models[kind].scene), tp = Models[kind].tpose;
  sc.rotation.y = FACING[kind] || 0;
  if (tp) { const m = new THREE.AnimationMixer(sc); m.clipAction(tp).play(); m.setTime(0); }
  sc.updateMatrixWorld(true);
  const rest = new Map();
  sc.traverse(o => { if (o.isBone) rest.set(o.name, o.getWorldQuaternion(new THREE.Quaternion())); });
  return (refCache[kind] = rest);
}

function bonesOf(scene) { scene.updateMatrixWorld(true); const b = []; scene.traverse(o => { if (o.isBone) b.push(o); }); return b; }

function retarget(kind, raw) {
  const src = SkeletonUtils.clone(Models[raw.from].scene), tgt = SkeletonUtils.clone(Models[kind].scene);
  src.rotation.y = FACING[raw.from] || 0; tgt.rotation.y = FACING[kind] || 0;
  const S = { bones: bonesOf(src), rest: refPose(raw.from) }, T = { bones: bonesOf(tgt), rest: refPose(kind) };
  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(raw.clip).play();
  const n = Math.max(2, Math.round(raw.clip.duration * FPS) + 1);
  const out = new Map(T.bones.filter(b => S.rest.has(b.name)).map(b => [b.name, new Float32Array(n * 4)]));
  const times = new Float32Array(n);
  const ws = new THREE.Quaternion(), w = new THREE.Quaternion(), pw = new THREE.Quaternion(), local = new THREE.Quaternion();
  const srcByName = new Map(S.bones.map(b => [b.name, b]));
  for (let f = 0; f < n; f++) {
    const t = Math.min(raw.clip.duration, f / FPS); times[f] = t;
    mixer.setTime(t); src.updateMatrixWorld(true);
    const world = new Map();
    for (const b of T.bones) {
      const sb = srcByName.get(b.name);
      // 父骨骼本帧的世界旋转（非骨骼父节点用其静止世界旋转）
      if (b.parent && b.parent.isBone) pw.copy(world.get(b.parent.name)); else b.parent.getWorldQuaternion(pw);
      if (sb) {
        sb.getWorldQuaternion(ws);
        // W_t = W_s(t) · W_s(rest)⁻¹ · W_t(rest)
        w.copy(ws).multiply(S.rest.get(b.name).clone().invert()).multiply(T.rest.get(b.name));
        local.copy(pw).invert().multiply(w);
        local.toArray(out.get(b.name), f * 4);
      } else {
        w.copy(pw).multiply(b.quaternion);
      }
      world.set(b.name, w.clone());
    }
  }
  const tracks = [...out].map(([name, v]) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v));
  return new THREE.AnimationClip(raw.clip.name, raw.clip.duration, tracks);
}

export function clipFor(kind, name) {
  const id = kind + ':' + name;
  if (cache[id]) return cache[id];
  const raw = Raw[name]; if (!raw) return null;
  return (cache[id] = raw.from === kind ? raw.clip : retarget(kind, raw));
}

const tmpColor = new THREE.Color();

export class Actor {
  constructor(kind = 'michelle', { tint = null, scale = 1 } = {}) {
    const src = Models[kind];
    // 外面套一层 Group：模型自带的根节点旋转不会被游戏逻辑覆盖
    this.model = SkeletonUtils.clone(src.scene);
    this.model.scale.multiplyScalar(scale * (src.unit || 1));
    this.model.rotation.y = FACING[kind] || 0;
    this.root = new THREE.Group(); this.root.add(this.model);
    this.root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (tint) { o.material.color.copy(tint); }
        o.material.envMapIntensity = 0.6;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null;
    this.kind = kind;
  }

  play(name, fade = 0.25, speed = 1) {
    const clip = clipFor(this.kind, name); if (!clip) return;
    let a = this.actions[name];
    if (!a) a = this.actions[name] = this.mixer.clipAction(clip);
    a.timeScale = speed;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  update(dt) { this.mixer.update(dt); }
}

// 路人颜色（只轻微染色，避免皮肤怪异）
export function randomTint(r) {
  const h = r(), s = 0.15 + r() * 0.25, l = 0.75 + r() * 0.25;
  return tmpColor.setHSL(h, s, l).clone();
}

// ================= 路人换装 =================
// Xbot 人偶本身是一体的灰色模型。按每个顶点的主骨骼把身体分区（皮肤 / 上衣 / 前臂 / 裤子 / 小腿 / 鞋），
// 着色器里按区域上色，每个路人一套随机衣服；再随机挂帽子、双肩包、斜挎包（Blender 模型，绑在骨骼上）。
const region = name => {
  const n = name.replace(/^mixamorig:?/, '');
  if (/Hand|Head|Neck|Eye/.test(n)) return 3;      // 皮肤
  if (/ForeArm/.test(n)) return 1;                  // 前臂（长袖 = 上衣色，短袖 = 皮肤色）
  if (/Spine|Shoulder|Arm/.test(n)) return 0;       // 上衣
  if (/Hips|UpLeg/.test(n)) return 2;               // 裤子
  if (/Leg/.test(n)) return 4;                      // 小腿（短裤 = 皮肤色）
  if (/Foot|Toe/.test(n)) return 5;                 // 鞋
  return 0;
};
function maskGeometry(mesh) {
  const g = mesh.geometry;
  if (g.attributes.maskA) return;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const n = si.count, A = new Float32Array(n * 4), B = new Float32Array(n), acc = new Float32Array(6);
  const get = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i);
  for (let i = 0; i < n; i++) {
    acc.fill(0);
    for (let k = 0; k < 4; k++) { const w = get(sw, i, k); if (w > 0) acc[region(bones[get(si, i, k)]?.name || '')] += w; }
    let best = 0; for (let k = 1; k < 6; k++) if (acc[k] > acc[best]) best = k;
    if (best === 3 && /Head/.test(bones[get(si, i, 0)]?.name || '') && get(sw, i, 0) > 0.6) (g.userData.head ||= []).push(i);
    // 区域编码：A = (上衣, 前臂, 裤子, 小腿)，B = 鞋；都不是 = 皮肤
    if (best === 0) A[i * 4] = 1; else if (best === 1) A[i * 4 + 1] = 1; else if (best === 2) A[i * 4 + 2] = 1; else if (best === 4) A[i * 4 + 3] = 1; else if (best === 5) B[i] = 1;
  }
  g.setAttribute('maskA', new THREE.BufferAttribute(A, 4));
  g.setAttribute('maskB', new THREE.BufferAttribute(B, 1));
}
function outfitMaterial(base, o) {
  const m = base.clone();
  m.color.set(0xffffff); m.metalness = 0; m.roughness = 0.72; m.map = null; m.envMapIntensity = 0.5;
  m.onBeforeCompile = sh => {
    for (const k of ['shirt', 'sleeve', 'pants', 'shin', 'shoes', 'skin']) sh.uniforms['o_' + k] = { value: o[k] };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 maskA; attribute float maskB; varying vec4 vMaskA; varying float vMaskB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMaskA = maskA; vMaskB = maskB;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 o_shirt, o_sleeve, o_pants, o_shin, o_shoes, o_skin; varying vec4 vMaskA; varying float vMaskB;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float sk = clamp(1.0 - vMaskA.x - vMaskA.y - vMaskA.z - vMaskA.w - vMaskB, 0.0, 1.0);
          diffuseColor.rgb *= o_shirt * vMaskA.x + o_sleeve * vMaskA.y + o_pants * vMaskA.z + o_shin * vMaskA.w + o_shoes * vMaskB + o_skin * sk; }`);
  };
  m.customProgramCacheKey = () => 'outfit';
  return m;
}
const PAL = {
  shirt: ['#f2f2f2', '#1d1f24', '#2b3a55', '#8a8f96', '#c9b79c', '#a83232', '#3f6b4a', '#d4a017', '#6b4c8a', '#e98aa6', '#e2012d', '#ff6a13', '#27a4ff'],
  pants: ['#2c3e5c', '#1b1b1e', '#5a5f66', '#c2b59b', '#3d4a3a', '#4a6fa5', '#2b2b30'],
  shoes: ['#f4f4f4', '#151515', '#7a5230', '#c0c0c0', '#f4f4f4'],
  skin: ['#f1d3bd', '#e8bfa0', '#dcae8c', '#c99572'],
};
const pick = (r, a) => a[r() * a.length | 0];

function attachAt(actor, name, boneName, worldPos, color, scale) {
  let bone = null;
  actor.model.traverse(o => { if (o.isBone && o.name.replace(':', '') === boneName) bone = o; });
  if (!bone) return null;
  actor.root.updateMatrixWorld(true);
  const off = worldPos.clone().sub(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld));
  return attach(actor, name, boneName, off, color, scale);
}

function attach(actor, name, boneName, offset, color, scale = new THREE.Vector3(1, 1, 1)) {
  const acc = glbModel(name);
  if (!acc) return null;
  let bone = null;
  actor.model.traverse(o => { if (o.isBone && o.name.replace(':', '') === boneName) bone = o; });
  if (!bone) return null;
  actor.root.updateMatrixWorld(true);
  const p = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).add(offset);
  const local = bone.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(p, new THREE.Quaternion(), scale));
  local.decompose(acc.position, acc.quaternion, acc.scale);
  if (color) acc.traverse(o => { if (o.isMesh && o.material.name === 'paint') { o.material = o.material.clone(); o.material.color.set(color); } });
  acc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  bone.add(acc);
  return acc;
}

// 头部包围盒（世界坐标，角色刚创建时在原点）：头发、帽子按头的实际大小摆放
function headFit(actor) {
  let best = null;
  actor.root.updateMatrixWorld(true);
  actor.root.traverse(m => { if (m.isSkinnedMesh && m.geometry.userData.head && (!best || m.geometry.userData.head.length > best.geometry.userData.head.length)) best = m; });
  if (!best) return null;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const i of best.geometry.userData.head) box.expandByPoint(best.getVertexPosition(i, v).applyMatrix4(best.matrixWorld));   // 蒙皮后的真实位置
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  return { top: new THREE.Vector3(c.x, box.max.y, c.z), hx: size.x / 2, hz: size.z / 2 };
}

// 给路人随机换一套衣服 + 配件。只对 Xbot 换衣服；Michelle 只加包。
export function dressActor(actor, r) {
  if (actor.kind === 'xbot') {
    const shirt = pick(r, PAL.shirt), skin = pick(r, PAL.skin), pants = pick(r, PAL.pants);
    const o = {
      shirt: new THREE.Color(shirt), sleeve: new THREE.Color(r() < 0.55 ? shirt : skin), pants: new THREE.Color(pants),
      shin: new THREE.Color(r() < 0.15 ? skin : pants), shoes: new THREE.Color(pick(r, PAL.shoes)), skin: new THREE.Color(skin),
    };
    actor.root.traverse(m => { if (m.isSkinnedMesh) { maskGeometry(m); m.material = outfitMaterial(m.material, o); } });
    const hat = r(), hf = headFit(actor);
    if (hf) {   // 头发 / 帽子：按头的实际大小缩放，挂在头部骨骼上
      const kx = (hf.hx + 0.02) / 0.118, kz = (hf.hz + 0.02) / 0.13, k = (kx + kz) / 2;
      const at = (dy, dz = 0) => new THREE.Vector3(hf.top.x, hf.top.y + dy * k, hf.top.z + dz * k), sc = f => new THREE.Vector3(kx * f, k * f, kz * f);
      attachAt(actor, hat >= 0.38 && r() < 0.4 ? 'acc_hair_long' : 'acc_hair', 'mixamorigHead', at(0.006), hat < 0.38 ? '#141210' : pick(r, ['#141210', '#141210', '#2b1d14', '#4a3020', '#7a5232', '#b8925a']), sc(1.0));
      if (hat < 0.25) attachAt(actor, 'acc_cap', 'mixamorigHead', at(-0.06, 0.005), pick(r, ['#151515', '#f2f2f2', '#2b3a55', '#a83232', '#c9b79c']), sc(1.13));
      else if (hat < 0.38) attachAt(actor, 'acc_beanie', 'mixamorigHead', at(-0.045), pick(r, ['#a83232', '#2b2b30', '#d4a017', '#6b8fb5']), sc(1.13));
    }
  }
  const bag = r();
  if (bag < 0.22) attach(actor, 'acc_backpack', 'mixamorigSpine2', new THREE.Vector3(0, -0.02, -0.11), pick(r, ['#1d1f24', '#2b3a55', '#6b4c8a', '#a83232', '#3f6b4a']));
  else if (bag < 0.38) attach(actor, 'acc_crossbag', 'mixamorigSpine2', new THREE.Vector3(0, -0.05, 0), pick(r, ['#7a5230', '#151515', '#c9b79c']));
}
