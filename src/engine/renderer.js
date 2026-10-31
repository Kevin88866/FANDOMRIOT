import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { settings, onSettings } from './settings.js';

// 暗角 + 轻微色调
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.0 }, fade: { value: 0 }, grain: { value: 0.035 }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float sat; uniform float fade; uniform float grain; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){ vec4 c=texture2D(tDiffuse,vUv); float l=dot(c.rgb,vec3(.299,.587,.114));
      c.rgb=mix(vec3(l),c.rgb,sat); vec2 d=vUv-.5; c.rgb*=(1.0-vignette*dot(d,d)*2.2)*(1.0-fade);
      c.rgb += (h(vUv * 1000.0) - 0.5) * grain;   // 胶片颗粒，让画面没那么"塑料"
      gl_FragColor=c; }`,
};

export class Renderer {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(this.pixelRatio());
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.1, 900);
    this.quality = settings.preset;

    this.setupLights();
    this.setupComposer();
    this.applySettings();
    onSettings(() => this.applySettings());
    addEventListener('resize', () => this.resize());
  }

  applyAniso() {
    const a = Math.min(settings.aniso || 1, this.r.capabilities.getMaxAnisotropy());
    this.scene.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k].anisotropy !== a) { m[k].anisotropy = a; m[k].needsUpdate = true; } });
  }

  pixelRatio() { return THREE.MathUtils.clamp(settings.renderScale * (settings.resScale || 1), 0.35, 2.5); }

  // 设置即时生效：渲染分辨率、阴影、环境光遮蔽、辉光、抗锯齿、视野
  applySettings() {
    const S = settings, r = this.r;
    this.quality = S.preset;
    const pr = this.pixelRatio();
    if (Math.abs(r.getPixelRatio() - pr) > 1e-3) { r.setPixelRatio(pr); this.composer.setPixelRatio(pr); this.resize(); }
    const sm = { off: 0, low: 1024, mid: 1536, high: 2048, ultra: 4096 }[S.shadows] ?? 2048;
    if (r.shadowMap.enabled !== sm > 0) {
      r.shadowMap.enabled = sm > 0; this.sun.castShadow = sm > 0;
      this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    if (sm && this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.shadowSize = sm || 2048;
    if (S.ao && !this.gtao) {
      const g = this.gtao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      g.output = GTAOPass.OUTPUT.Default; g.blendIntensity = 0.85;
      g.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 });
      this.composer.insertPass(g, 1);
    }
    if (this.gtao) this.gtao.enabled = !!S.ao;
    this.bloom.enabled = !!S.bloom;
    this.smaa.enabled = !!S.aa;
    this.baseFov = S.fov;
    // 阴影距离、视距、纹理过滤、颗粒、暗角、亮度
    const sd = 70 * (S.shadowDist || 1), sc = this.sun.shadow.camera;
    if (sc.right !== sd) { sc.left = -sd; sc.right = sd; sc.top = sd; sc.bottom = -sd; sc.updateProjectionMatrix(); }
    this.camera.far = 900 * Math.max(0.6, S.viewDist || 1); this.camera.updateProjectionMatrix();
    this.grade.uniforms.grain.value = S.grain ? 0.035 : 0;
    this.grade.uniforms.vignette.value = 0.64 * (S.vignette ?? 0.5);
    if (this.anisoApplied !== S.aniso) { this.anisoApplied = S.aniso; this.applyAniso(); }
    if (this.hour !== undefined) this.setTime(this.hour);
    if (!this.fovLocked && this.camera.fov !== S.fov) { this.camera.fov = S.fov; this.camera.updateProjectionMatrix(); }
  }

  setupLights() {
    const s = this.scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    s.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85;

    this.hemi = new THREE.HemisphereLight(0x9fb6ff, 0x302020, 0.35);
    s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffc89a, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    s.add(sun, sun.target);
    s.fog = new THREE.FogExp2(0x8a7f8f, 0.0042);
    this.setupNightSky();
    this.setTime(18);
  }

  // 夜空：渐变穹顶（城市光污染）+ 星星 + 月亮，随入夜淡入；整组跟着相机走
  setupNightSky() {
    const R = 780, grp = this.skyGroup = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { k: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float k; varying vec3 vP;
        void main(){ float h = clamp(vP.y, -0.1, 1.0);
          vec3 top = vec3(0.012,0.016,0.04), mid = vec3(0.05,0.045,0.09), glow = vec3(0.32,0.16,0.10);
          vec3 c = mix(glow, mid, smoothstep(0.0, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.7, h));
          gl_FragColor = vec4(c, k); }`,
    }));
    dome.renderOrder = -2; grp.add(dome); this.dome = dome;
    const n = 1400, pos = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.08; v.normalize().multiplyScalar(R - 10); pos.set([v.x, v.y, v.z], i * 3); size[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('s', new THREE.BufferAttribute(size, 1));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { k: { value: 0 }, t: { value: 0 } },
      vertexShader: 'attribute float s; uniform float t; varying float a; void main(){ a = 0.35 + 0.65 * fract(s * 91.7 + sin(t * (0.5 + s) + s * 40.0) * 0.5); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = 1.0 + s * 1.8; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float k; varying float a; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(vec3(1.0,0.97,0.9), a * k * 0.8); }',
    }));
    this.stars.renderOrder = -1; this.stars.frustumCulled = false; grp.add(this.stars);
    const mc = document.createElement('canvas'); mc.width = mc.height = 128; const mg = mc.getContext('2d');
    const gr = mg.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.32, 'rgba(255,248,230,1)'); gr.addColorStop(0.36, 'rgba(200,210,255,.25)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
    mg.fillStyle = gr; mg.fillRect(0, 0, 128, 128);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    this.moon.scale.setScalar(70); this.moon.position.set(-330, 420, -520); grp.add(this.moon);
    this.scene.add(grp);
  }

  // 黄昏用落日 HDR，入夜后换成城市夜景 HDR（玻璃幕墙的反射会跟着变）
  async loadEnv(url, nightUrl, scale = [1, 1]) {
    this.envScale = scale;   // 不同 HDR 的整体亮度差很多（夜景 HDR 里有路灯直射），按图校准
    const pmrem = new THREE.PMREMGenerator(this.r);
    const tex = await new RGBELoader().loadAsync(url);
    this.envDusk = pmrem.fromEquirectangular(tex).texture; tex.dispose();
    if (nightUrl) { const nt = await (nightUrl.endsWith('.hdr') ? new RGBELoader() : new EXRLoader()).loadAsync(nightUrl); this.envNight = pmrem.fromEquirectangular(nt).texture; nt.dispose(); }
    this.envMap = this.envDusk;
    this.scene.environment = this.envMap;
    this.applyEnvIntensity();
  }

  applyEnvIntensity() {
    // 根据时间调节环境光强度（three r160 无 scene.environmentIntensity，逐材质设置）
    const k = this.envIntensity ?? 1;
    this.scene.traverse(o => { if (o.material && o.material.envMapIntensity !== undefined && !o.material.userData.fixedEnv) o.material.envMapIntensity = k * (o.material.userData.envMul ?? 1); });
  }

  // 游戏内时间（小时，可带小数）。18 点黄昏 → 20 点后入夜
  setTime(h) {
    this.hour = h;
    const t = THREE.MathUtils.clamp((h - 17) / 3.5, 0, 1);           // 0 = 黄昏, 1 = 夜
    const elev = THREE.MathUtils.lerp(9, -8, t);
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(235);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.sunDir = sunDir;
    // 入夜后主光换成冷色月光（从高处照下来，阴影方向固定）
    const dusk = Math.min(1, t * 1.4);
    this.sun.intensity = dusk < 0.85 ? THREE.MathUtils.lerp(2.4, 0.2, dusk / 0.85) : 0.32;
    this.sun.color.setHSL(THREE.MathUtils.lerp(0.07, 0.6, dusk), THREE.MathUtils.lerp(0.8, 0.35, dusk), THREE.MathUtils.lerp(0.68, 0.78, dusk));
    this.lightDir = dusk < 0.85 ? sunDir : new THREE.Vector3(-0.42, 0.78, -0.46).normalize();
    this.moonish = t;
    this.hemi.intensity = THREE.MathUtils.lerp(0.4, 0.26, t);
    this.hemi.color.setHSL(0.62, 0.6, THREE.MathUtils.lerp(0.75, 0.35, t));
    this.r.toneMappingExposure = THREE.MathUtils.lerp(0.75, 1.08, t) * (settings.brightness || 1);
    this.scene.fog.color.setHSL(THREE.MathUtils.lerp(0.95, 0.66, t), 0.25, THREE.MathUtils.lerp(0.45, 0.06, t));
    this.scene.fog.density = THREE.MathUtils.lerp(0.0035, 0.0055, t) / Math.max(0.5, settings.viewDist || 1);
    const useNight = t > 0.55 && this.envNight;
    const newEnv = THREE.MathUtils.lerp(0.8, 0.38, t) * ((this.envScale || [1, 1])[useNight ? 1 : 0]);
    if (Math.abs((this.envIntensity ?? 0) - newEnv) > 0.01) { this.envIntensity = newEnv; this.applyEnvIntensity(); }
    if (this.bloom) this.bloom.strength = THREE.MathUtils.lerp(0.35, 0.75, t);
    this.night = t;
    if (this.dome) { const k = THREE.MathUtils.smoothstep(t, 0.35, 0.9); this.dome.material.uniforms.k.value = k; this.stars.material.uniforms.k.value = k; this.moon.material.opacity = k; }
    const env = useNight ? this.envNight : this.envDusk;
    if (env && this.scene.environment !== env) { this.scene.environment = env; this.envMap = env; }
  }

  followShadow(target) {
    // 阴影相机跟随玩家，按 texel 对齐防闪烁
    const d = (this.lightDir || this.sunDir).clone(); if (d.y < 0.15) d.y = 0.15; d.normalize();
    const step = 140 / (this.shadowSize || 2048);
    const tx = Math.round(target.x / step) * step, tz = Math.round(target.z / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + d.x * 150, d.y * 150, tz + d.z * 150);
  }

  setupComposer() {
    const w = innerWidth, h = innerHeight, r = this.r;
    const c = this.composer = new EffectComposer(r);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(this.smaa = new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
  }


  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.r.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  render() {
    if (this.skyGroup) { this.skyGroup.position.copy(this.camera.position); this.stars.material.uniforms.t.value = performance.now() / 1000; }
    this.grade.uniforms.time.value = (performance.now() % 10000) / 1000;
    this.composer.render();
  }
}
