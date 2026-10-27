import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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
