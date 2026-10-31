import * as THREE from 'three';
import { Vehicle } from '../player/vehicle.js';
import { textTex } from '../engine/textures.js';
import { model as glbModel } from '../engine/assets.js';
import { Actor } from '../world/actors.js';

// 商店用的道具 3D 缩略图：用游戏里同一套模型，离屏渲染一次后缓存成图片。
const cache = new Map();

function detach(props, o) { props.scene.remove(o); props.list = props.list.filter(x => x !== o); return o; }

function model(game, id) {
  const P = game.props, at = new THREE.Vector3();
  switch (id) {
    case 'banner': return detach(P, P.banner(at, 0, 'OUT', 'attack'));
    case 'wreath': return detach(P, P.wreath(at, 0, '정신차려', 'attack'));
    case 'flowers': return detach(P, P.flowers(at, 0, '♥ 최고 ♥'));
    case 'rally': return detach(P, P.rallyGroup(at, 0, 'OUT', 'attack'));
    case 'truck': return new Vehicle('ledtruck', { text: 'OUT', textColor: '#ff2d2d', sub: 'LCK' }).root;
    case 'coffee': return new Vehicle('coffee', { text: '☕ 응원해요', textColor: '#ff7ab0' }).root;
    case 'eggs': {
      const g = new THREE.Group();
      const tray = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: 0xc9b79a, roughness: 0.9 })); g.add(tray);
      const egg = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.5 });
      for (let i = 0; i < 6; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), egg); e.scale.y = 1.3; e.position.set(-0.4 + (i % 3) * 0.4, 0.22, i < 3 ? -0.18 : 0.18); g.add(e); }
      return g;
    }
    case 'graffiti': {
      const g = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 20), new THREE.MeshStandardMaterial({ color: 0xff1e46, metalness: 0.6, roughness: 0.3 })); can.position.y = 0.45; g.add(can);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.18, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); cap.position.y = 0.99; g.add(cap);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), new THREE.MeshBasicMaterial({ map: textTex('OUT', { w: 512, h: 256, bg: '#9a9a96', fg: '#ff1e46', size: 0.8 }) })); wall.position.set(0, 0.7, -0.6); g.add(wall);
      return g;
    }
    case 'fireworks': {
      const g = new THREE.Group();
      const fw = glbModel('pr_fireworks');
      if (fw) { fw.scale.setScalar(0.75); g.add(fw); }
      else { const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 })); box.position.y = 0.25; g.add(box); }
      const sp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.6), toneMapped: false });
      for (let i = 0; i < 26; i++) { const d = new THREE.Vector3().randomDirection(); d.y = Math.abs(d.y); const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), sp); s.position.copy(d.multiplyScalar(0.8).add(new THREE.Vector3(0, 1.4, 0))); g.add(s); }
      return g;
    }
    case 'drone': {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.5, roughness: 0.4 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), m); body.position.y = 0.6; g.add(body);
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.75), m); arm.position.set(x / 2, 0.6, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
        const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.6 })); rot.position.set(x, 0.68, z); g.add(rot);
      }
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 1.5), toneMapped: false })); led.position.y = 0.5; g.add(led);
      return g;
    }
    case 'billboard': {
      const g = new THREE.Group();
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: textTex('HAPPY BIRTHDAY', { w: 1024, h: 576, bg: '#06060c', fg: '#ff7ab0', glow: 30, size: 0.2 }), toneMapped: false })); sc.position.y = 1; g.add(sc);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.55, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 })); fr.position.set(0, 1, -0.07); g.add(fr);
      return g;
    }
  }
  return new THREE.Group();
}

export function itemThumb(game, id) {
  if (cache.has(id)) return cache.get(id);
  const url = renderThumb(game, model(game, id), 320, 240, new THREE.Vector3(0.75, 0.45, 1), 1.35);
  cache.set(id, url); return url;
}

// 人物形象缩略图（新游戏选形象用）：正面全身
export function charThumb(game, kind) {
  const key = 'char:' + kind;
  if (cache.has(key)) return cache.get(key);
  const a = new Actor(kind); a.play('idle', 0); a.update(0.6);
  const url = renderThumb(game, a.root, 180, 280, new THREE.Vector3(0.2, 0.05, 1), 1.3);
  cache.set(key, url); return url;
}

function renderThumb(game, obj, W, H, dir, dist) {
  const r = game.renderer.r;
  const scene = new THREE.Scene();
  scene.environment = game.renderer.envDusk || null;
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x30282a, 1.4));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.2); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 1.2); rim.position.set(-4, 3, -3); scene.add(rim);
  scene.add(obj);
  // 自动取景：按包围盒设置相机
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.01, 200);
  cam.position.copy(c).add(dir.clone().normalize().multiplyScalar(size * dist)); cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTone = r.toneMapping, prevColor = new THREE.Color(); r.getClearColor(prevColor); const prevAlpha = r.getClearAlpha();
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam); r.setRenderTarget(null);
  r.setClearColor(prevColor, prevAlpha); r.toneMapping = prevTone;
  const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // 上下翻转
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL('image/png');
  rt.dispose();
  return url;
}
