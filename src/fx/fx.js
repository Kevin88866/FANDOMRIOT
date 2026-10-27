import * as THREE from 'three';

// 粒子特效：烟花、烟雾
function radialTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function smokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 14 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene, game) {
    this.scene = scene; this.game = game;
    this.parts = [];
    this.fireTex = radialTex([[0, 'rgba(255,255,230,1)'], [0.25, 'rgba(255,200,80,0.9)'], [0.6, 'rgba(255,90,20,0.45)'], [1, 'rgba(120,20,0,0)']]);
    this.sparkTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    this.smoke = smokeTex();
    // 预先创建闪光灯池，避免动态加灯导致着色器重编译卡顿
    this.lights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 1, 1.6); scene.add(l); return { l, life: 0, max: 1, i: 0 }; });
  }

  sprite(tex, color, pos, size, life, vel, opts = {}) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: opts.normal ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: !opts.hdr, rotation: Math.random() * 6 });
    const s = new THREE.Sprite(m); s.position.copy(pos); s.scale.setScalar(size);
    this.scene.add(s);
    this.parts.push({ o: s, life, max: life, vel: vel || new THREE.Vector3(), grow: opts.grow ?? 1, g: opts.gravity ?? 0, drag: opts.drag ?? 0.98, fade: opts.fade ?? 1, size, opacity: opts.opacity ?? 1 });
    return s;
  }

  flash(pos, color = 0xffaa55, intensity = 400, dist = 60, life = 0.5) {
    const L = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    L.l.color.set(color); L.l.distance = dist; L.l.position.copy(pos); L.life = L.max = life; L.i = intensity;
  }

  firework(pos, color) {
    const col = color || new THREE.Color().setHSL(Math.random(), 1, 0.6);
    const top = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 22 + Math.random() * 14, (Math.random() - 0.5) * 8));
    // 上升拖尾
    const rocket = this.sprite(this.sparkTex, new THREE.Color(3, 2.5, 2), pos.clone(), 0.6, 1.0, top.clone().sub(pos).multiplyScalar(1.0), { drag: 1, hdr: true, grow: 1 });
    this.parts[this.parts.length - 1].onDie = () => {
      const c = col.clone().multiplyScalar(4);
      for (let i = 0; i < 90; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(12 + Math.random() * 4);
        this.sprite(this.sparkTex, c, top.clone(), 0.55, 1.6 + Math.random() * 0.8, v, { gravity: -4, drag: 0.95, hdr: true, grow: 0.6 });
      }
      this.flash(top, col.getHex(), 500, 90, 0.6);
      this.game.audio?.pop();
    };
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.o); if (!p.mesh) p.o.material.dispose(); p.onDie?.(); this.parts.splice(i, 1); continue; }
      p.vel.y += (p.g || 0) * dt; p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.o.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      if (p.mesh) {
        p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt;
        if (p.o.position.y < 0.15) { p.o.position.y = 0.15; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.6); }
      } else {
        p.o.scale.setScalar(p.size * (1 + k * (p.grow - 1)));
        p.o.material.opacity = p.opacity * (1 - Math.pow(k, 1.5));
      }
    }
    for (const L of this.lights) { L.life = Math.max(0, L.life - dt); L.l.intensity = L.i * (L.life / L.max); }
  }
}
