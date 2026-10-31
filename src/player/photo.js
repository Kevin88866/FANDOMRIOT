import * as THREE from 'three';
import { settings } from '../engine/settings.js';

// 手机拍照：第一人称取景，按画面内容打分
const TAG_NAMES = { subject: '主体', text: '标语清晰', logo: '队标入镜', crowd: '围观人群', explosion: '名场面', night: '夜景', star: '选手本人', reaction: '选手反应', press: '记者入镜' };

export class PhotoMode {
  constructor(game) {
    this.game = game; this.active = false;
    this.yaw = 0; this.pitch = 0; this.fov = 55;
    this.ray = new THREE.Raycaster();
    this.ui = document.getElementById('photo-ui');
    this.tagsEl = document.getElementById('photo-tags');
    this.countEl = document.getElementById('photo-count');
    this.flash = document.getElementById('flash');
    this.small = document.createElement('canvas'); this.small.width = 480; this.small.height = 300;
    this.meter = document.getElementById('photo-meter-i'); this.boxEl = document.getElementById('photo-box');
  }

  enter() {
    const p = this.game.player;
    this.active = true; this.ui.classList.remove('hidden');
    this.yaw = p.yaw + Math.PI; this.pitch = -p.pitch * 0.3 + 0.1; this.fov = 55;
    this.game.renderer.fovLocked = true;
    p.root.visible = false;
    this.game.audio?.click();
  }
  exit() {
    this.active = false; this.ui.classList.add('hidden');
    this.game.player.root.visible = !this.game.player.vehicle || this.game.player.vehicle.type === 'scooter';
    this.game.renderer.fovLocked = false; this.game.camera.fov = settings.fov; this.game.camera.updateProjectionMatrix();
  }

  look(dx, dy) { const k = this.fov / 55; this.yaw -= dx * 0.0022 * k; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022 * k, -1.2, 1.3); }
  zoom(d) { this.fov = THREE.MathUtils.clamp(this.fov + d * 0.03, 15, 75); }

  updateCamera(cam) {
    const p = this.game.player;
    const base = p.vehicle ? p.vehicle.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)) : p.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    cam.position.copy(base);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    cam.lookAt(base.add(dir));
    if (cam.fov !== this.fov) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // 实时提示（低频）
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 10 === 0) {
      const r = this.evaluate(false);
      const show = Object.keys(TAG_NAMES).filter(k => k !== 'night' && (k !== 'star' && k !== 'reaction' && k !== 'press' || r.tags.includes(k)));
      this.tagsEl.innerHTML = show.map(k => `<span class="${r.tags.includes(k) ? 'on' : ''}">${TAG_NAMES[k]}</span>`).join('') + (r.subject ? `<span class="on">${r.subject.label}</span>` : '');
      this.countEl.textContent = `今日照片 ${this.game.day.photos.length}/12`;
      this.meter.style.width = Math.min(100, r.q / 1.6 * 100) + '%';
      this.meter.style.background = r.q > 1.1 ? 'var(--good)' : r.q > 0.7 ? 'var(--warn)' : 'var(--bad)';
      const bx = this.boxEl;
      if (r.box) { Object.assign(bx.style, { display: 'block', left: r.box.x + 'px', top: r.box.y + 'px', width: r.box.w + 'px', height: r.box.h + 'px' }); bx.dataset.label = r.subject.label; }
      else bx.style.display = 'none';
    }
  }

  // 计算画面质量
  evaluate(full) {
    const g = this.game, cam = g.camera;
    cam.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let best = null, bestScore = 0;
    const tags = new Set();
    for (const s of g.props.subjects) {
      if (!s.obj.parent) continue;
      const box = new THREE.Box3().setFromObject(s.obj);
      if (box.isEmpty() || !frustum.intersectsBox(box)) continue;
      // 投影包围盒 → 屏幕占比
      const pts = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(cam));
      const xs = pts.map(p => THREE.MathUtils.clamp(p.x, -1, 1)), ys = pts.map(p => THREE.MathUtils.clamp(p.y, -1, 1));
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) / 4;
      const center = box.getCenter(new THREE.Vector3());
      const c = center.clone().project(cam);
      if (c.z > 1) continue;
      const dist = cam.position.distanceTo(center);
      // 遮挡检测（只在真正拍照时做，较贵）
      let occl = 1;
      if (full) {
        this.ray.set(cam.position, center.clone().sub(cam.position).normalize()); this.ray.far = dist - 1;
        const hits = this.ray.intersectObject(g.city.group, true);
        if (hits.length) occl = 0.35;
      }
      const sizeScore = area < 0.01 ? area * 30 : area < 0.06 ? 0.3 + (area - 0.01) * 10 : area < 0.55 ? 0.8 + Math.min(0.2, (area - 0.06) * 0.8) : 0.75;
      const centered = 1 - Math.min(1, Math.hypot(c.x, c.y)) * 0.35;
      const sc = sizeScore * centered * occl * (s.weight || 1);
      if (sc > bestScore) { bestScore = sc; best = { ...s, area, dist, occl, centered, sizeScore }; }
      if (s.text && area > 0.02 && dist < 40 && occl > 0.5 && (!s.vehicle || s.vehicle.sloganVisible())) tags.add('text');
    }
    if (best) tags.add('subject');
    // 队标 / 总部招牌入镜
    for (const id in g.city.hq) {
      const hq = g.city.hq[id];
      for (const o of [hq.sign, hq.logo]) { if (o && o.parent && frustum.containsPoint(o.getWorldPosition(new THREE.Vector3()))) tags.add('logo'); }
    }
    // 围观路人
    let crowd = 0;
    for (const p of g.crowd.list) if ((p.state === 'watch' || p.state === 'goto') && frustum.containsPoint(p.a.root.position.clone().setY(1)) && p.a.root.position.distanceTo(cam.position) < 50) crowd++;
    if (crowd >= 3) tags.add('crowd');
    // 名场面：爆炸 / 烟花 / 无人机成形
    if (g.time - (g.lastSpectacle?.t ?? -99) < 2.2 && frustum.containsPoint(g.lastSpectacle.pos)) tags.add('explosion');
    if (g.renderer.night > 0.6) tags.add('night');
    // 机会事件：选手本人 / 选手看到你的道具 / 记者
    const inFrame = o => { const b = new THREE.Box3().setFromObject(o); return !b.isEmpty() && frustum.intersectsBox(b); };
    const opp = g.opps ? g.opps.photoTags(frustum, cam, inFrame) : { tags: [] };
    for (const t of opp.tags) tags.add(t);
    if (opp.reaction) tags.add('explosion');

    let q = best ? 0.25 + bestScore * 0.75 : 0.12;
    if (tags.has('text')) q += 0.15; if (tags.has('logo')) q += 0.18; if (tags.has('crowd')) q += Math.min(0.3, crowd * 0.04);
    if (tags.has('explosion')) q += 0.45; if (tags.has('night') && best?.glow) q += 0.1; if (best?.night) q += 0.25 * g.renderer.night - 0.1;   // 投影越晚越清楚
    if (tags.has('star')) q += 0.25; if (tags.has('reaction')) q += 0.3; if (tags.has('press')) q += 0.15;
    if (best?.layout) q *= best.layout;
    q *= 1 + 0.08 * g.state.skills.photo;
    q = THREE.MathUtils.clamp(q, 0.1, 1.6);
    return { q, tags: [...tags], subject: best, crowd, opp, box: best ? this.screenBox(best.obj, cam) : null };
  }

  // 主体在屏幕上的包围框（像素）
  screenBox(obj, cam) {
    const box = new THREE.Box3().setFromObject(obj); if (box.isEmpty()) return null;
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(cam); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const c = v => THREE.MathUtils.clamp(v, -1, 1);
    x0 = c(x0); x1 = c(x1); y0 = c(y0); y1 = c(y1);
    return { x: (x0 + 1) / 2 * innerWidth, y: (1 - y1) / 2 * innerHeight, w: (x1 - x0) / 2 * innerWidth, h: (y1 - y0) / 2 * innerHeight };
  }

  shoot() {
    const g = this.game;
    if (g.day.photos.length >= 12) { g.toast('手机内存满了（今日最多 12 张）', 'bad'); return; }
    const r = this.evaluate(true);
    g.renderer.render();
    const ctx = this.small.getContext('2d');
    ctx.drawImage(g.renderer.r.domElement, 0, 0, this.small.width, this.small.height);
    const img = this.small.toDataURL('image/jpeg', 0.82);
    const photo = { img, q: r.q, tags: r.tags, eventId: r.subject?.eventId ?? r.opp?.reaction?.eventId ?? null, label: r.subject?.label || (r.opp?.star ? `${r.opp.star} ${r.opp.exclusive ? '独家' : '本人'}` : '街景'), t: g.clockMin, crowd: r.crowd,
      star: r.opp?.star || null, exclusive: !!r.opp?.exclusive, reaction: !!r.opp?.reaction, press: !!r.opp?.press, truckSlogan: !!(r.subject?.vehicle && r.tags.includes('text')) };
    if (photo.reaction) g.ui.achieve('reaction'); if (photo.press) g.ui.achieve('press');
    g.day.photos.push(photo);
    g.lastThumb = img;
    g.tutorial?.event('photo');
    this.flash.style.transition = 'none'; this.flash.style.opacity = 0.9;
    requestAnimationFrame(() => { this.flash.style.transition = 'opacity .35s'; this.flash.style.opacity = 0; });
    g.audio?.shutter();
    const stars = '★'.repeat(Math.max(1, Math.round(r.q * 3))).padEnd(5, '☆');
    const extra = photo.reaction ? ' · 选手反应名场面！' : r.tags.includes('explosion') ? ' · 名场面！' : photo.star ? ` · 拍到了 ${photo.star}` : photo.press ? ' · 记者入镜' : '';
    g.toast(`📸 ${photo.label} · ${stars}${extra}`, r.q > 1 ? 'good' : '');
  }
}
