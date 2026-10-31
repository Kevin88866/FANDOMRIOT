import * as THREE from 'three';

// 摆放模式：俯视总部门前广场，鼠标决定花圈 / 花篮 / 横幅 / 集会的位置和朝向。
// 摆得整齐、正对街道会提高"排面"分（影响照片质量）；堵住大门会被保安清理（但那也是名场面）。
const PIECES = { wreath: 3, flowers: 3, banner: 1, rally: 1 };

export class Placer {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18);
    this.mouse = new THREE.Vector2();
    this.ui = document.getElementById('place-ui');
    // 指针被锁住时（比如从游戏里直接进摆放模式）clientX 不会变，改用位移量推动光标
    addEventListener('mousemove', e => {
      if (document.pointerLockElement) { this.mouse.x = Math.max(-1, Math.min(1, this.mouse.x + e.movementX / innerWidth * 2)); this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y - e.movementY / innerHeight * 2)); }
      else this.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
  }

  static supports(prop) { return prop in PIECES; }

  start(order, hqId, item) {
    const g = this.game, hq = g.city.hq[hqId];
    this.ctx = { order, hqId, hq, item, left: PIECES[item.prop], placed: [], rot: 0 };
    g.mode = 'place'; g.releaseMouse(); setTimeout(() => g.mode === 'place' && g.releaseMouse(), 150);   // 防止之前的锁定请求晚到
    this.mouse.set(0, -0.2);
    g.ui.showHud(false);
    this.ui.classList.remove('hidden');
    // 相机：广场斜上方
    const deep = hqId === 'ARENA' ? 10 : 22;
    this.camPos = new THREE.Vector3(hq.cx, 15, hq.face + hq.dir * deep);
    this.camLook = new THREE.Vector3(hq.cx, 0, hq.face + hq.dir * (hqId === 'ARENA' ? 2.5 : 7));
    this.newGhost();
    this.render();
  }

  zone() {
    const hq = this.ctx.hq, arena = this.ctx.hqId === 'ARENA';
    return { xMin: hq.cx - (arena ? 18 : 16.5), xMax: hq.cx + (arena ? 18 : 16.5), dMin: arena ? 0.6 : 1.0, dMax: arena ? 4.2 : 15 };
  }

  // 生成跟随鼠标的"幽灵"道具（半透明）
  newGhost() {
    const { order, hq, item } = this.ctx, P = this.game.props;
    const pos = hq.plaza.clone();
    let obj;
    if (item.prop === 'wreath') obj = P.wreath(pos, hq.faceRy, order.text, order.kind);
    else if (item.prop === 'flowers') obj = P.flowers(pos, hq.faceRy, order.text);
    else if (item.prop === 'banner') obj = P.banner(pos, hq.faceRy, order.text, order.kind);
    else obj = P.rallyGroup(pos, hq.faceRy, order.text, order.kind);
    obj.rotation.y = hq.faceRy + this.ctx.rot;
    obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.userData.ghostMat = true; } });
    this.ghost = obj;
  }

  solidify(obj) { obj.traverse(o => { if (o.isMesh && o.userData.ghostMat) { o.material.opacity = 1; o.material.transparent = false; o.material.needsUpdate = true; } }); }

  rotate(d) { if (!this.ctx) return; this.ctx.rot += d; this.ghost.rotation.y = this.ctx.hq.faceRy + this.ctx.rot; }

  valid(p) {
    const z = this.zone(), hq = this.ctx.hq;
    const d = (p.z - hq.face) * hq.dir;
    if (p.x < z.xMin || p.x > z.xMax || d < z.dMin || d > z.dMax) return false;
    return this.ctx.placed.every(o => o.position.distanceTo(p) > 1.1);
  }

  update() {
    if (!this.ctx) return;
    const cam = this.game.camera;
    cam.position.lerp(this.camPos, 0.15); cam.lookAt(this.camLook);
    this.ray.setFromCamera(this.mouse, cam);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.plane, hit)) {
      this.ghost.position.set(hit.x, 0.18, hit.z);
      const ok = this.valid(hit);
      if (ok !== this.lastOk) {
        this.lastOk = ok;
        this.ghost.traverse(o => { if (o.isMesh && o.material.emissive) { o.material.emissive.set(ok ? 0x000000 : 0xff0000); o.material.emissiveIntensity = ok ? 0 : 0.6; } });
      }
    }
  }

  click(button) {
    if (!this.ctx) return;
    if (button === 2) return this.cancel();
    if (!this.lastOk) { this.game.audio.bad(); return; }
    const obj = this.ghost; this.solidify(obj);
    obj.traverse(o => { if (o.isMesh && o.material.emissive) { o.material.emissiveIntensity = 0; } });
    this.ctx.placed.push(obj); this.ctx.left--;
    this.game.popIn(obj); this.game.audio.click();
    if (this.ctx.left > 0) this.newGhost(); else this.finish();
    this.render();
  }

  // 排面分：朝向、对齐、间距、离大门
  layoutScore() {
    const { placed, hq, hqId } = this.ctx;
    const facing = placed.reduce((a, o) => a + Math.cos(o.rotation.y - hq.faceRy), 0) / placed.length;   // 1 = 正对街道
    let line = 1, spacing = 1;
    if (placed.length > 1) {
      const ds = placed.map(o => (o.position.z - hq.face) * hq.dir), mean = ds.reduce((a, b) => a + b) / ds.length;
      const dev = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length);
      line = Math.max(0, 1 - dev / 1.5);
      const xs = placed.map(o => o.position.x).sort((a, b) => a - b), gaps = xs.slice(1).map((x, i) => x - xs[i]);
      const gm = gaps.reduce((a, b) => a + b) / gaps.length, gd = Math.sqrt(gaps.reduce((a, b) => a + (b - gm) ** 2, 0) / gaps.length);
      spacing = Math.max(0, 1 - gd / Math.max(0.5, gm)) * (gm > 1.2 && gm < 5 ? 1 : 0.7);
    }
    const near = placed.reduce((a, o) => a + (o.position.z - hq.face) * hq.dir, 0) / placed.length;
    const visible = hqId === 'ARENA' ? 1 : THREE.MathUtils.clamp(1.15 - near / 20, 0.7, 1.1);   // 离大楼近，和队标同框更容易
    const blockDoor = hqId !== 'ARENA' && placed.some(o => Math.abs(o.position.x - hq.cx) < 3 && (o.position.z - hq.face) * hq.dir < 4);
    const score = THREE.MathUtils.clamp(0.7 + 0.22 * Math.max(0, facing) + 0.18 * line + 0.15 * spacing, 0.7, 1.25) * visible;
    return { score: Math.round(score * 100) / 100, blockDoor, facing, line, spacing };
  }

  render() {
    if (!this.ctx) return;
    const { left, item, placed } = this.ctx;
    const sc = placed.length ? this.layoutScore() : null;
    const stars = sc ? '★'.repeat(Math.round((sc.score - 0.6) / 0.65 * 5)).padEnd(5, '☆') : '';
    this.ui.innerHTML = `<div class="place-card"><b>摆放 ${item.name}</b>　还剩 ${left} 件${sc ? `　排面 <span class="stars">${stars}</span>${sc.blockDoor ? '　<span class="neg">⚠ 堵住了大门</span>' : ''}` : ''}
      <div class="sub">${this.game.input.device === 'pad' ? '左摇杆 移动 · <kbd class="pad">A</kbd> 放下 · <kbd class="pad">LB</kbd><kbd class="pad">RB</kbd> 旋转 · <kbd class="pad">B</kbd> 取消（退回背包）' : '鼠标移动 · 左键 放下 · Q / E 或滚轮 旋转 · 右键 取消（退回背包）'}<br>小技巧：正对街道、排成一排、间距均匀，排面更好。堵门曝光更高，但保安会来清理。</div></div>`;
  }

  finish() {
    const g = this.game, c = this.ctx;
    const sc = this.layoutScore();
    this.ctx = null; this.ghost = null; this.lastOk = undefined;
    this.ui.classList.add('hidden');
    g.finishPlacement(c, sc);
  }

  cancel() {
    const g = this.game, c = this.ctx;
    for (const o of [...c.placed, this.ghost]) { g.scene.remove(o); g.props.list = g.props.list.filter(x => x !== o); }
    this.ctx = null; this.ghost = null; this.lastOk = undefined;
    this.ui.classList.add('hidden');
    g.cancelPlacement(c);
  }
}
