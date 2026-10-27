import * as THREE from 'three';

// 粒子特效：爆炸、烟、碎片、烟花、蛋液
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
    this.debrisGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 });
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

  explosion(pos, scale = 1) {
    const P = pos.clone();
    this.flash(P.clone().add(new THREE.Vector3(0, 2, 0)), 0xff9944, 900 * scale, 80 * scale, 0.7);
    for (let i = 0; i < 26 * scale; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 12 + 2, (Math.random() - 0.5) * 14).multiplyScalar(scale * 0.7);
      this.sprite(this.fireTex, new THREE.Color(3, 2.2, 1.4), P.clone().add(new THREE.Vector3(0, 1, 0)), (3 + Math.random() * 4) * scale, 0.6 + Math.random() * 0.5, v, { grow: 2.2, drag: 0.9, hdr: true });
    }
    for (let i = 0; i < 22 * scale; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 2, (Math.random() - 0.5) * 6).multiplyScalar(scale);
      const sh = 0.12 + Math.random() * 0.1;
      this.sprite(this.smoke, new THREE.Color(sh, sh, sh), P.clone().add(new THREE.Vector3(0, 1.5, 0)), (4 + Math.random() * 4) * scale, 3 + Math.random() * 3, v, { grow: 1.6, drag: 0.96, normal: true, opacity: 0.95 });
    }
    for (let i = 0; i < 40 * scale; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 20 + 5, (Math.random() - 0.5) * 30).multiplyScalar(scale * 0.8);
      this.sprite(this.sparkTex, new THREE.Color(4, 2.5, 1), P.clone().add(new THREE.Vector3(0, 1, 0)), 0.35, 1 + Math.random(), v, { gravity: -18, drag: 0.985, hdr: true, grow: 0.3 });
    }
    for (let i = 0; i < 18 * scale; i++) {
      const d = new THREE.Mesh(this.debrisGeo, this.debrisMat); d.position.copy(P).add(new THREE.Vector3(0, 1, 0)); d.castShadow = true;
      d.scale.setScalar(0.5 + Math.random() * 2);
      this.scene.add(d);
      this.parts.push({ o: d, life: 4, max: 4, vel: new THREE.Vector3((Math.random() - 0.5) * 18, Math.random() * 14 + 4, (Math.random() - 0.5) * 18), g: -22, drag: 0.995, mesh: true, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
    }
    this.scorch(P, 4 * scale);
    this.game.audio?.boom(scale);
    this.game.shake?.(1.2 * scale, P);
  }

  scorch(pos, r) {
    if (!this.scorchTex) this.scorchTex = radialTex([[0, 'rgba(0,0,0,0.9)'], [0.6, 'rgba(10,8,6,0.6)'], [1, 'rgba(0,0,0,0)']]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.position.set(pos.x, pos.y + 0.03, pos.z); this.scene.add(m);
    (this.decals ||= []).push(m);
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

  splat(pos, normal, color = 0xe8c020) {
    if (!this.splatTex) this.splatTex = radialTex([[0, 'rgba(255,240,180,1)'], [0.35, 'rgba(240,200,60,0.95)'], [0.6, 'rgba(220,180,40,0.6)'], [1, 'rgba(200,160,30,0)']]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: this.splatTex, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.2 }));
    m.position.copy(pos).addScaledVector(normal, 0.05); m.lookAt(pos.clone().add(normal)); m.rotation.z = Math.random() * 6;
    this.scene.add(m); (this.decals ||= []).push(m);
    for (let i = 0; i < 10; i++) this.sprite(this.sparkTex, new THREE.Color(1, 0.85, 0.3), pos.clone(), 0.2, 0.5, normal.clone().multiplyScalar(3).add(new THREE.Vector3().randomDirection().multiplyScalar(2)), { gravity: -10, normal: true });
  }

  clearDecals() { for (const d of this.decals || []) { this.scene.remove(d); d.geometry.dispose(); } this.decals = []; }

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
