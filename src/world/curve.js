// 斜穿全城的弯曲大道：在正交路网上叠一条 S 形的斜路（现实里的首尔不全是方格）
import * as THREE from 'three';

export class CurveRoad {
  // pts：[[x, z], ...] 控制点；hw：路面半宽；isGridRoad(x, z)：这个点是不是在原来的方格路上
  constructor(pts, hw, isGridRoad, curb) {
    this.hw = hw;
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = curve.getLength(), N = Math.ceil(len / 1.5);
    this.samples = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      this.samples.push({ x: p.x, z: p.z, tx: tg.x, tz: tg.z, nx: -tg.z, nz: tg.x, s: t * len, road: isGridRoad(p.x, p.z) });
    }
    // 路面高度：街区里和人行道一样高（路沿高度），经过方格路口时 3 米内做斜坡降到路面
    const raw = this.samples.map(p => (p.road ? 0 : curb));
    this.samples.forEach((p, i) => { let a = 0, n = 0; for (let k = -2; k <= 2; k++) { const q = raw[i + k]; if (q !== undefined) { a += q; n++; } } p.h = a / n; });
    this.len = len;
    // 空间哈希：10 米一格，加速"离弯路多远"的查询
    this.hash = new Map();
    this.samples.forEach((p, i) => {
      const r = Math.ceil((hw + 8) / 10);
      const cx = Math.floor(p.x / 10), cz = Math.floor(p.z / 10);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const k = (cx + a) + ',' + (cz + b); if (!this.hash.has(k)) this.hash.set(k, []); this.hash.get(k).push(i); }
    });
  }

  // 最近的采样点和距离（离得远时返回 Infinity）
  nearest(x, z) {
    const list = this.hash.get(Math.floor(x / 10) + ',' + Math.floor(z / 10));
    if (!list) return { d: Infinity, i: -1 };
    let bd = Infinity, bi = -1;
    for (const i of list) { const p = this.samples[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return { d: Math.sqrt(bd), i: bi };
  }
  dist(x, z) { return this.nearest(x, z).d; }

  // 地面高度：路面 / 人行道（离弯路太远返回 null，用原来的规则）
  groundY(x, z) {
    const { d, i } = this.nearest(x, z);
    if (d > this.hw + 3.2) return null;
    const p = this.samples[i];
    return d <= this.hw ? p.h + 0.02 : Math.max(p.h, 0.18) + 0.06;
  }

  // 沿路的一条偏移线（offset 正 = 左侧）
  line(offset, step = 1) {
    const out = [];
    for (let i = 0; i < this.samples.length; i += step) { const p = this.samples[i]; out.push(new THREE.Vector3(p.x + p.nx * offset, 0, p.z + p.nz * offset)); }
    return out;
  }
}

// 沿弯路铺一条带状网格；from/to 是偏移范围（米），keep(i) 决定这一段要不要铺，yOf(p) 给高度
export function stripGeo(road, from, to, yOf, keep = () => true, uvScale = 0.25) {
  const pos = [], uv = [], nrm = [], idx = [], S = road.samples;
  let n = 0;
  for (let i = 0; i < S.length - 1; i++) {
    if (!keep(i) || !keep(i + 1)) continue;
    for (const j of [i, i + 1]) {
      const p = S[j], y = yOf(p);
      for (const o of [from, to]) { const x = p.x + p.nx * o, z = p.z + p.nz * o; pos.push(x, y, z); uv.push(x * uvScale, z * uvScale); nrm.push(0, 1, 0); }
    }
    idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); n += 4;   // 正面朝上
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
