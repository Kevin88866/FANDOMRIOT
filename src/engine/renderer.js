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

// 暗角 + 轻微色调
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.08 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float sat; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); float l=dot(c.rgb,vec3(.299,.587,.114));
      c.rgb=mix(vec3(l),c.rgb,sat); vec2 d=vUv-.5; c.rgb*=1.0-vignette*dot(d,d)*2.2; gl_FragColor=c; }`,
};

export class Renderer {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 900);
    this.quality = localStorage.getItem('fr_quality') || 'high';

    this.setupLights();
    this.setupComposer();
    addEventListener('resize', () => this.resize());
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
    this.setTime(18);
  }

  async loadEnv(url) {
    const pmrem = new THREE.PMREMGenerator(this.r);
    const tex = await new RGBELoader().loadAsync(url);
    this.envMap = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
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
    this.sun.intensity = THREE.MathUtils.lerp(2.4, 0.0, Math.min(1, t * 1.4));
    this.sun.color.setHSL(0.07, 0.8, THREE.MathUtils.lerp(0.68, 0.5, t));
    this.moonish = t;
    this.hemi.intensity = THREE.MathUtils.lerp(0.4, 0.18, t);
    this.hemi.color.setHSL(0.62, 0.6, THREE.MathUtils.lerp(0.75, 0.35, t));
    this.r.toneMappingExposure = THREE.MathUtils.lerp(0.75, 0.95, t);
    this.scene.fog.color.setHSL(THREE.MathUtils.lerp(0.95, 0.66, t), 0.25, THREE.MathUtils.lerp(0.45, 0.06, t));
    this.scene.fog.density = THREE.MathUtils.lerp(0.0035, 0.0055, t);
    const newEnv = THREE.MathUtils.lerp(0.8, 0.22, t);
    if (Math.abs((this.envIntensity ?? 0) - newEnv) > 0.03) { this.envIntensity = newEnv; this.applyEnvIntensity(); }
    if (this.bloom) this.bloom.strength = THREE.MathUtils.lerp(0.35, 0.75, t);
    this.night = t;
  }

  followShadow(target) {
    // 阴影相机跟随玩家，按 texel 对齐防闪烁
    const d = this.sunDir.clone(); if (d.y < 0.15) d.y = 0.15; d.normalize();
    const step = 140 / 2048;
    const tx = Math.round(target.x / step) * step, tz = Math.round(target.z / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + d.x * 150, d.y * 150, tz + d.z * 150);
  }

  setupComposer() {
    const w = innerWidth, h = innerHeight, r = this.r;
    const c = this.composer = new EffectComposer(r);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 });
      c.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
  }

  setQuality(q) { this.quality = q; localStorage.setItem('fr_quality', q); location.reload(); }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.r.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  render() { this.composer.render(); }
}
