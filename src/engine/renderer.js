// Renderer + post-processing stack.
//
// The "AAA" look here comes from stacking cheap-but-correct things: physically
// correct lights, an IBL environment so metals have something to reflect, ACES
// filmic tonemapping, soft shadows, bloom on emissives, SSAO for contact
// darkening, then a grade pass (vignette + chromatic aberration + film grain +
// lift/gamma/gain) and finally SMAA.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setTextureRenderer } from './textures.js';

export const QUALITY = {
  low:    { shadowMap: 1024, ssao: false, bloom: true,  smaa: false, pixelRatio: 0.75, shadowType: THREE.PCFShadowMap,     aniso: 2 },
  medium: { shadowMap: 2048, ssao: false, bloom: true,  smaa: true,  pixelRatio: 1.0,  shadowType: THREE.PCFSoftShadowMap, aniso: 4 },
  high:   { shadowMap: 4096, ssao: true,  bloom: true,  smaa: true,  pixelRatio: 1.0,  shadowType: THREE.PCFSoftShadowMap, aniso: 8 },
  ultra:  { shadowMap: 4096, ssao: true,  bloom: true,  smaa: true,  pixelRatio: 1.5,  shadowType: THREE.PCFSoftShadowMap, aniso: 16 },
};

// ---------------------------------------------------------------------------
// Final grade shader — runs after tonemapping, in display space.
// ---------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uVignette:   { value: 0.85 },
    uGrain:      { value: 0.035 },
    uAberration: { value: 0.0016 },
    uLift:       { value: new THREE.Vector3(0, 0, 0) },
    uGain:       { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1.06 },
    uContrast:   { value: 1.04 },
    uDamage:     { value: 0.0 },   // red pulse when spotted
    uScanline:   { value: 0.0 },   // arena-specific CRT feel
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uSaturation, uContrast, uDamage, uScanline;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // Lateral chromatic aberration, strongest at the frame edge.
      float ab = uAberration * (0.35 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // Lift / gain, contrast, saturation.
      col = col * uGain + uLift;
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // Vignette.
      float vig = smoothstep(0.95, 0.25, r2 * uVignette * 2.2);
      col *= mix(1.0, vig, 0.85);

      // Film grain — animated, luminance-weighted so shadows stay clean-ish.
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (0.35 + l);

      // Optional scanlines.
      if (uScanline > 0.0) {
        float s = sin(uv.y * 1400.0) * 0.5 + 0.5;
        col *= mix(1.0, 0.82 + s * 0.18, uScanline);
      }

      // Spotted / damage flash.
      col = mix(col, vec3(0.72, 0.06, 0.05), uDamage * (0.35 + 0.65 * smoothstep(0.05, 0.45, r2)));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = QUALITY[quality] ? quality : 'high';
    const q = QUALITY[this.quality];

    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: !q.smaa,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.gl.setSize(window.innerWidth, window.innerHeight);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = q.shadowType;
    this.gl.info.autoReset = true;
    setTextureRenderer(this.gl);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 900);

    // Image-based lighting so metal/rough surfaces have something to reflect.
    this.pmrem = new THREE.PMREMGenerator(this.gl);
    this.pmrem.compileEquirectangularShader();
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene = null;
    this.composer = null;
    this._time = 0;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  /** (Re)build the post chain for a scene. Call whenever the scene swaps. */
  attach(scene) {
    this.scene = scene;
    const q = QUALITY[this.quality];
    const w = window.innerWidth, h = window.innerHeight;

    this.composer?.dispose?.();
    this.composer = new EffectComposer(this.gl);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.composer.setSize(w, h);

    this.renderPass = new RenderPass(scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (q.ssao) {
      try {
        this.ssao = new SSAOPass(scene, this.camera, w, h);
        this.ssao.kernelRadius = 0.35;
        this.ssao.minDistance = 0.0008;
        this.ssao.maxDistance = 0.09;
        this.ssao.output = SSAOPass.OUTPUT.Default;
        this.composer.addPass(this.ssao);
      } catch (e) {
        console.warn('SSAO unavailable:', e);
        this.ssao = null;
      }
    }

    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.75, 0.82);
      this.composer.addPass(this.bloom);
    }

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    if (q.smaa) {
      this.smaa = new SMAAPass(w, h);
      this.composer.addPass(this.smaa);
    }
  }

  /** Apply an arena's colour-grade preset. */
  setGrade(o = {}) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    if (o.vignette !== undefined) u.uVignette.value = o.vignette;
    if (o.grain !== undefined) u.uGrain.value = o.grain;
    if (o.aberration !== undefined) u.uAberration.value = o.aberration;
    if (o.saturation !== undefined) u.uSaturation.value = o.saturation;
    if (o.contrast !== undefined) u.uContrast.value = o.contrast;
    if (o.scanline !== undefined) u.uScanline.value = o.scanline;
    if (o.lift) u.uLift.value.set(...o.lift);
    if (o.gain) u.uGain.value.set(...o.gain);
    if (o.exposure !== undefined) this.gl.toneMappingExposure = o.exposure;
    if (o.bloom !== undefined && this.bloom) this.bloom.strength = o.bloom;
    if (o.bloomRadius !== undefined && this.bloom) this.bloom.radius = o.bloomRadius;
    if (o.bloomThreshold !== undefined && this.bloom) this.bloom.threshold = o.bloomThreshold;
  }

  setDamage(v) { if (this.grade) this.grade.uniforms.uDamage.value = v; }

  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    const q = QUALITY[name];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.gl.shadowMap.type = q.shadowType;
    if (this.scene) this.attach(this.scene);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  render(dt) {
    this._time += dt;
    if (this.grade) this.grade.uniforms.uTime.value = this._time;
    if (this.composer) this.composer.render(dt);
    else if (this.scene) this.gl.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer?.dispose?.();
    this.pmrem?.dispose();
    this.gl.dispose();
  }
}
