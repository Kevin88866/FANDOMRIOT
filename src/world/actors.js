import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { model as glbModel } from '../engine/assets.js';

// 人物：20 个 Mixamo 写实角色（assets/models/chars，由 tools/blender/chars_lod.py 生成），
// 路人用减面版（_lod），玩家用完整版。动画是在 Y Bot 上导出的 Mixamo 动画（assets/thirdparty/anims）。
// 不同角色的骨骼朝向不一样，动画不能直接套用，这里做"世界空间重定向"：逐帧采样源骨架每根骨骼相对
// 静止姿势（都是 T-pose）的世界旋转变化，施加到目标角色对应骨骼的静止姿势上，再换算回局部旋转。
export const CHARACTERS = ['brian', 'claire', 'elizabeth', 'jody', 'josh', 'kate', 'kaya', 'leonard', 'louise', 'megan',
  'michelle', 'olivia', 'racer', 'remy', 'shannon', 'sophie', 'sporty_granny', 'swat_guy', 'the_boss', 'timmy'];
// 写实的日常人物（路人和可选形象只用这些；卡通风格的几个只给特定角色用）
export const REAL = ['brian', 'elizabeth', 'jody', 'josh', 'kate', 'leonard', 'louise', 'megan', 'remy', 'shannon', 'sophie'];
export const CHAR_LABEL = { brian: '布莱恩', claire: '克莱尔', elizabeth: '伊丽莎白', jody: '乔迪', josh: '乔什', kate: '凯特', kaya: '卡娅', leonard: '伦纳德', louise: '露易丝', megan: '梅根',
  michelle: '米歇尔', olivia: '奥利维亚', racer: '赛车手', remy: '雷米', shannon: '香农', sophie: '苏菲', sporty_granny: '运动奶奶', swat_guy: '特警', the_boss: '老板', timmy: '提米' };
// 旧代码里的角色名 → 新角色
const ALIAS = { soldier: 'swat_guy', xbot: 'leonard' };
// 游戏里的动作名 → Mixamo 动画文件
const ANIMS = {
  idle: 'idle_standing', idle2: 'idle_weight_shift', breathe: 'idle_breathing', walk: 'walk_01', walk2: 'walk_02', walk3: 'walk_04', walk_text: 'walk_texting',
  run: 'run_intention', jump: 'jump_in_place', runjump: 'running_jump', land: 'landing', fall: 'falling_idle',
  agree: 'clapping', cheer: 'cheering', fist: 'fist_pump', headshake: 'shake_head_annoyed', angry: 'yelling', point: 'angry_point',
  sambadance: 'dance_salsa', dance: 'dance_hiphop_shimmy', enter: 'enter_car', exit: 'exit_car', drive: 'driving', hit: 'hit_by_car',
  text: 'texting_standing', phone: 'phone_talk_male', wave: 'wave', look: 'look_around', throw: 'throw', thumbs: 'thumbs_up', holding: 'holding_idle',
};
const FPS = 30;
export const Models = {};        // 角色名 → 减面版 gltf
const Full = {};                 // 角色名 → 完整版 gltf
const Raw = {};                  // 动作名 → { clip, scene }
const cache = {};
const loader = new GLTFLoader();
const norm = o => { if (o.name) o.name = o.name.replace(/^mixamorig\d*:?/, 'mixamorig'); };

function prepareChar(g) {
  g.scene.traverse(o => {
    norm(o);
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; const m = o.material; if (m) { m.envMapIntensity = 0.5; m.metalness = 0; m.roughness = Math.max(m.roughness ?? 1, 0.78);   // FBX 转出来的材质太亮太滑，像塑料 if (m.transparent && m.map) { m.alphaTest = 0.4; m.transparent = false; m.depthWrite = true; } } }
  });
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g.scene), h = box.max.y - box.min.y;
  g.unit = h > 2.4 || h < 0.6 ? 1.72 / h : 1;   // 正常身高的角色保留真实身高（小孩矮、大人高）
  return g;
}

export async function loadActors(onProgress) {
  const names = Object.entries(ANIMS), total = names.length + CHARACTERS.length;
  let done = 0;
  await Promise.all(names.map(async ([id, file]) => {
    try {
      const g = await loader.loadAsync(`assets/thirdparty/anims/mixamo_${file}/${file}.glb`);
      g.scene.traverse(norm);
      const c = g.animations[0];
      if (c) { c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion')); c.name = id; Raw[id] = { clip: c, scene: g.scene }; }
    } catch (e) { console.warn('动画加载失败', file, e); }
    onProgress?.(++done / total);
  }));
  await Promise.all(CHARACTERS.map(async k => {
    try { Models[k] = prepareChar(await loader.loadAsync(`assets/models/chars/${k}_lod.glb`)); } catch (e) { console.warn('人物加载失败', k, e); }
    onProgress?.(++done / total);
  }));
}

// 玩家用完整版模型（更精细），用到时再加载
export async function loadFull(kind) {
  kind = ALIAS[kind] || kind;
  if (Full[kind] || !CHARACTERS.includes(kind)) return;
  try { Full[kind] = prepareChar(await loader.loadAsync(`assets/models/chars/${kind}.glb`)); } catch (e) { console.warn('完整模型加载失败', kind, e); }
}

export function hasClip(name) { return !!Raw[name]; }

// 静止姿势（T-pose）下每根骨骼的世界旋转
const refCache = new WeakMap();
function refPose(scene) {
  if (refCache.has(scene)) return refCache.get(scene);
  const sc = SkeletonUtils.clone(scene);
  sc.updateMatrixWorld(true);
  const rest = new Map();
  sc.traverse(o => { if (o.name?.startsWith('mixamorig')) rest.set(o.name, o.getWorldQuaternion(new THREE.Quaternion())); });
  refCache.set(scene, rest);
  return rest;
}
function bonesOf(scene) { scene.updateMatrixWorld(true); const b = []; scene.traverse(o => { if (o.name?.startsWith('mixamorig')) b.push(o); }); return b; }

function retarget(tgtScene, raw) {
  const src = SkeletonUtils.clone(raw.scene), tgt = SkeletonUtils.clone(tgtScene);
  const S = { bones: bonesOf(src), rest: refPose(raw.scene) }, T = { bones: bonesOf(tgt), rest: refPose(tgtScene) };
  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(raw.clip).play();
  const n = Math.max(2, Math.round(raw.clip.duration * FPS) + 1);
  const srcByName = new Map(S.bones.map(b => [b.name, b]));
  const out = new Map(T.bones.filter(b => srcByName.has(b.name) && S.rest.has(b.name)).map(b => [b.name, new Float32Array(n * 4)]));
  const times = new Float32Array(n);
  const ws = new THREE.Quaternion(), w = new THREE.Quaternion(), pw = new THREE.Quaternion(), local = new THREE.Quaternion();
  const world = new Map();
  for (let f = 0; f < n; f++) {
    const t = Math.min(raw.clip.duration, f / FPS); times[f] = t;
    mixer.setTime(t); src.updateMatrixWorld(true);
    world.clear();
    for (const b of T.bones) {
      const sb = srcByName.get(b.name);
      if (b.parent && world.has(b.parent.name)) pw.copy(world.get(b.parent.name)); else b.parent.getWorldQuaternion(pw);
      if (sb && out.has(b.name)) {
        sb.getWorldQuaternion(ws);
        // W_t = W_s(t) · W_s(rest)⁻¹ · W_t(rest)
        w.copy(ws).multiply(S.rest.get(b.name).clone().invert()).multiply(T.rest.get(b.name));
        local.copy(pw).invert().multiply(w);
        local.toArray(out.get(b.name), f * 4);
      } else w.copy(pw).multiply(b.quaternion);
      world.set(b.name, w.clone());
    }
  }
  const tracks = [...out].map(([name, v]) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v));
  return new THREE.AnimationClip(raw.clip.name, raw.clip.duration, tracks);
}

export function clipFor(kind, name, full = false) {
  const id = kind + (full ? '!' : ':') + name;
  if (cache[id]) return cache[id];
  const raw = Raw[name], src = (full && Full[kind]) || Models[kind];
  if (!raw || !src) return null;
  return (cache[id] = retarget(src.scene, raw));
}

export class Actor {
  constructor(kind = 'michelle', { scale = 1, full = false } = {}) {
    kind = ALIAS[kind] || kind;
    if (!Models[kind]) kind = Object.keys(Models)[0];
    this.full = full && !!Full[kind];
    const src = this.full ? Full[kind] : Models[kind];
    // 外面套一层 Group：模型自带的根节点旋转不会被游戏逻辑覆盖
    this.model = SkeletonUtils.clone(src.scene);
    this.model.scale.multiplyScalar(scale * (src.unit || 1));
    this.root = new THREE.Group(); this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null; this.currentName = null;
    this.kind = kind;
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });
    this.pose = null;          // 动画之后叠加的姿势调整（滑板站姿、空中收腿）
  }

  play(name, fade = 0.25, speed = 1, once = false) {
    const clip = clipFor(this.kind, name, this.full); if (!clip) return false;
    let a = this.actions[name];
    if (!a) a = this.actions[name] = this.mixer.clipAction(clip);
    a.timeScale = speed;
    if (this.current === a && !once) return true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.current = a; this.currentName = name;
    return true;
  }
  duration(name) { return clipFor(this.kind, name, this.full)?.duration || 1; }

  // 在角色朝向坐标系里绕某个轴转动一根骨骼（世界空间叠加，和骨骼自身轴向无关）
  turnBone(name, axis, angle) {
    const b = this.bones[name]; if (!b) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())), angle);
    const wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
    b.updateMatrixWorld(true);
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.pose) { this.root.updateMatrixWorld(true); this.pose(this); }
  }
}

const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), Yv = new THREE.Vector3(0, 1, 0);
// 滑板站姿：双脚一前一后并拢，双手向前扶车把
export function scooterPose(a) {
  a.turnBone('LeftUpLeg', Z, -0.12); a.turnBone('RightUpLeg', Z, 0.12);
  a.turnBone('LeftUpLeg', X, -0.22); a.turnBone('RightUpLeg', X, 0.18);
  a.turnBone('LeftArm', X, -0.9); a.turnBone('RightArm', X, -0.9);
  a.turnBone('LeftArm', Yv, -0.25); a.turnBone('RightArm', Yv, 0.25);
  a.turnBone('LeftForeArm', X, -0.35); a.turnBone('RightForeArm', X, -0.35);
}
// 空中收腿
export function airPose(a) {
  a.turnBone('LeftUpLeg', X, -0.55); a.turnBone('RightUpLeg', X, -0.45);
  a.turnBone('LeftLeg', X, 0.9); a.turnBone('RightLeg', X, 0.8);
}

// 路人颜色（旧接口，现在的写实角色不再整体染色）
export function randomTint() { return null; }

// 路人随机背个包，增加一点差异
function attach(actor, name, boneName, offset, color) {
  const acc = glbModel(name), bone = actor.bones[boneName.replace('mixamorig', '')];
  if (!acc || !bone) return null;
  actor.root.updateMatrixWorld(true);
  const p = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).add(offset);
  const local = bone.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  local.decompose(acc.position, acc.quaternion, acc.scale);
  if (color) acc.traverse(o => { if (o.isMesh && o.material.name === 'paint') { o.material = o.material.clone(); o.material.color.set(color); } });
  acc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  bone.add(acc);
  return acc;
}
export function dressActor(actor, r) {
  const bag = r();
  if (bag < 0.16) attach(actor, 'acc_backpack', 'mixamorigSpine2', new THREE.Vector3(0, -0.02, -0.12), ['#1d1f24', '#2b3a55', '#6b4c8a', '#a83232'][r() * 4 | 0]);
  else if (bag < 0.28) attach(actor, 'acc_crossbag', 'mixamorigSpine2', new THREE.Vector3(0, -0.05, 0), ['#7a5230', '#151515', '#c9b79c'][r() * 3 | 0]);
}
