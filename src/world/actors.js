import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// 三个 Mixamo 角色共用骨骼名，动画可以互相套用
const SRC = { michelle: 'assets/models/Michelle.glb', soldier: 'assets/models/Soldier.glb', xbot: 'assets/models/Xbot.glb' };
export const Models = {};
export const Clips = {};

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
      Clips[c.name.toLowerCase()] ||= c;   // 同名动画只取第一个（Soldier 的 idle 比 Xbot 的自然）
    }
    onProgress?.(++i / 3);
  }
}

const tmpColor = new THREE.Color();

export class Actor {
  constructor(kind = 'michelle', { tint = null, scale = 1 } = {}) {
    const src = Models[kind];
    // 外面套一层 Group：模型自带的根节点旋转不会被游戏逻辑覆盖
    this.model = SkeletonUtils.clone(src.scene);
    this.model.scale.multiplyScalar(scale * (src.unit || 1));
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
    const clip = Clips[name]; if (!clip) return;
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
