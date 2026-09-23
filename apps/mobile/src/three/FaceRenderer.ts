import {
  CONTROL_BY_ID,
  computeVertexNormals,
  type CameraFocus,
  type ControlValues,
  type DeformationModel,
  type FaceMesh,
} from '@beautymade/face-engine';
import * as THREE from 'three';

import { ACCENT, STAGE_BOTTOM, STAGE_TOP, createFaceMaterial, type FaceMaterialTextures } from './faceMaterial';

export interface LoadedFace {
  id: string;
  mesh: FaceMesh;
  model: DeformationModel;
  textures: FaceMaterialTextures;
  skinTone: number[];
}

/**
 * off:        the edited face ("after")
 * original:   the untouched face (press-and-hold "before")
 * split:      before | after divided by a draggable vertical line, same camera
 * sideBySide: two faces in two viewports (e.g. comparing two saved looks)
 */
export type CompareMode = 'off' | 'original' | 'split' | 'sideBySide';

export interface ViewState {
  yaw: number;
  pitch: number;
  zoom: number;
  target: THREE.Vector3;
}

const MAX_YAW = 88;
const MAX_PITCH = 32;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 2.6;
const FOV = 24;

interface FaceInstance {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  object: THREE.Mesh;
  positions: THREE.BufferAttribute;
  normals: THREE.BufferAttribute;
  values: ControlValues;
}

/**
 * Renders the user's face with three.js on any WebGL2 context (expo-gl on iOS/Android,
 * a canvas on web). It renders on demand: nothing is drawn unless something changed or
 * an animation (camera tween, turntable, reveal) is running.
 */
export class FaceRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private readonly background: THREE.Mesh;
  private readonly backgroundScene = new THREE.Scene();
  private readonly backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly root = new THREE.Group();

  private face: LoadedFace | null = null;
  private after: FaceInstance | null = null;
  private before: FaceInstance | null = null;
  private afterValues: ControlValues = {};
  private beforeValues: ControlValues = {};
  private faceCenter = new THREE.Vector3();
  private faceSize = new THREE.Vector2(16, 18);

  private width = 1;
  private height = 1;
  private compareMode: CompareMode = 'off';
  private split = 0.5;
  private mirrored = false;
  private fit = 1.3;

  private view: ViewState = { yaw: 0, pitch: 0, zoom: 1, target: new THREE.Vector3() };
  private tween: { from: ViewState; to: ViewState; start: number; duration: number } | null = null;
  private turntable: { amplitude: number; speed: number; start: number; phase: number } | null = null;
  private reveal: { start: number; duration: number } | null = null;
  private velocity = { yaw: 0, pitch: 0 };
  private dragging = false;

  private frame: number | null = null;
  private dirty = true;
  private disposed = false;
  private readonly onFrameEnd: () => void;

  constructor(renderer: THREE.WebGLRenderer, onFrameEnd: () => void = () => {}) {
    this.renderer = renderer;
    this.onFrameEnd = onFrameEnd;
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(STAGE_BOTTOM, 1);

    const bgMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBgTop: { value: STAGE_TOP },
        uBgBottom: { value: STAGE_BOTTOM },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uViewportOrigin: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uBgTop; uniform vec3 uBgBottom; uniform vec2 uViewport; uniform vec2 uViewportOrigin;
        void main() {
          vec2 p = (gl_FragCoord.xy - uViewportOrigin) / uViewport;
          vec3 c = mix(uBgBottom, uBgTop, smoothstep(0.0, 1.0, p.y));
          float vignette = smoothstep(0.95, 0.25, length(p - vec2(0.5, 0.58)));
          gl_FragColor = vec4(c * mix(0.72, 1.12, vignette), 1.0);
        }`,
    });
    this.background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
    this.background.frustumCulled = false;
    this.backgroundScene.add(this.background);
    this.scene.add(this.root);
  }

  // ------------------------------------------------------------------ setup

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.invalidate();
  }

  setFace(face: LoadedFace): void {
    if (this.face?.id === face.id) return;
    this.disposeFace();
    this.face = face;
    this.after = this.createInstance(face);
    this.before = this.createInstance(face);
    this.root.add(this.after.object, this.before.object);

    this.after.geometry.computeBoundingBox();
    const box = this.after.geometry.boundingBox!;
    box.getCenter(this.faceCenter);
    this.faceCenter.z = box.max.z * 0.35 + box.min.z * 0.65;
    for (const inst of [this.after, this.before]) {
      inst.material.uniforms.uRevealRange.value.set(box.max.y + 0.5, box.min.y - 0.5);
    }
    this.faceSize.set(box.max.x - box.min.x, box.max.y - box.min.y);
    this.view = { yaw: 0, pitch: 0, zoom: 1, target: this.faceCenter.clone() };
    this.applyInstanceValues(this.after, this.afterValues, true);
    this.applyInstanceValues(this.before, this.beforeValues, true);
    this.invalidate();
  }

  private createInstance(face: LoadedFace): FaceInstance {
    const { mesh } = face;
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(mesh.positions), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    const normals = new THREE.BufferAttribute(new Float32Array(mesh.normals), 3);
    normals.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('normal', normals);
    geometry.setAttribute('normal0', new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    geometry.setAttribute('edgeFade', new THREE.BufferAttribute(mesh.edgeFade, 1));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const material = createFaceMaterial(face.textures, face.skinTone);
    const object = new THREE.Mesh(geometry, material);
    object.frustumCulled = false;
    return { geometry, material, object, positions, normals, values: {} };
  }

  // ------------------------------------------------------------------ edits

  /** Values for the edited ("after") face. */
  setValues(values: ControlValues): void {
    this.afterValues = values;
    if (this.after) this.applyInstanceValues(this.after, values);
  }

  /** Values for the comparison face: {} for the original, or another look. */
  setCompareValues(values: ControlValues): void {
    this.beforeValues = values;
    if (this.before) this.applyInstanceValues(this.before, values);
  }

  private applyInstanceValues(inst: FaceInstance, values: ControlValues, force = false): void {
    const face = this.face;
    if (!face) return;
    const prev = inst.values;
    inst.values = { ...values };
    const shapeChanged = force || shapeKeysDiffer(prev, values);
    if (shapeChanged) {
      const pos = inst.positions.array as Float32Array;
      face.model.apply(values, pos);
      computeVertexNormals(pos, face.mesh.indices, inst.normals.array as Float32Array);
      inst.positions.needsUpdate = true;
      inst.normals.needsUpdate = true;
    }
    const u = inst.material.uniforms;
    u.uSmoothAmount.value = values.skinSmooth ?? 0;
    u.uTone.value = values.skinTone ?? 0;
    u.uRedness.value = values.skinRedness ?? 0;
    u.uGlow.value = values.skinGlow ?? 0;
    this.invalidate();
  }

  setCompareMode(mode: CompareMode): void {
    if (mode === this.compareMode) return;
    this.compareMode = mode;
    this.invalidate();
  }

  /** Divider position for split mode, 0..1 from the left. */
  setSplit(position: number): void {
    this.split = Math.min(0.98, Math.max(0.02, position));
    if (this.compareMode === 'split') this.invalidate();
  }

  /** Framing margin around the face (1 = edge to edge). */
  setFit(fit: number): void {
    this.fit = Math.max(1, fit);
    this.invalidate();
  }

  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
    this.root.scale.x = mirrored ? -1 : 1;
    this.invalidate();
  }

  // ------------------------------------------------------------------ camera

  orbitBy(dxPixels: number, dyPixels: number): void {
    this.stopAnimations();
    const degPerPixel = 180 / Math.max(this.width, 320);
    const dyaw = -dxPixels * degPerPixel;
    const dpitch = dyPixels * degPerPixel * 0.8;
    this.view.yaw = clamp(this.view.yaw + dyaw, -MAX_YAW, MAX_YAW);
    this.view.pitch = clamp(this.view.pitch + dpitch, -MAX_PITCH, MAX_PITCH);
    this.velocity = { yaw: dyaw, pitch: dpitch };
    this.invalidate();
  }

  beginDrag(): void {
    this.dragging = true;
    this.velocity = { yaw: 0, pitch: 0 };
    this.stopAnimations();
  }

  endDrag(): void {
    this.dragging = false;
    this.velocity.yaw *= 0.5;
    this.velocity.pitch *= 0.5;
    this.kick();
  }

  zoomBy(factor: number): void {
    this.tween = null;
    this.view.zoom = clamp(this.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.invalidate();
  }

  /** Animates to a camera pose. Yaw is given for the unmirrored face. */
  focus(focus: Partial<CameraFocus>, duration = 650): void {
    const face = this.face;
    const sign = this.mirrored ? -1 : 1;
    const center = new THREE.Vector3(this.faceCenter.x * sign, this.faceCenter.y, this.faceCenter.z);
    const target = center.clone();
    const zoom = focus.zoom ?? 1;
    if (face && focus.target?.length) {
      const pos = (this.after?.positions.array as Float32Array | undefined) ?? face.mesh.positions;
      const c = face.model.landmarkCentroid(pos, focus.target);
      // Move from the face centre towards the feature as we zoom in.
      const t = clamp((zoom - 1) / 0.6, 0, 1);
      target.x = lerp(center.x, c[0] * sign, t);
      target.y = lerp(center.y, c[1], t);
    }
    this.animateTo({ yaw: (focus.yaw ?? 0) * sign, pitch: focus.pitch ?? 0, zoom, target }, duration);
  }

  resetView(duration = 600): void {
    this.focus({ yaw: 0, pitch: 0, zoom: 1 }, duration);
  }

  focusControl(id: keyof typeof CONTROL_BY_ID): void {
    this.focus(CONTROL_BY_ID[id].focus);
  }

  /** Jumps to an exact camera state (as returned by {@link currentView}). */
  setView(view: ViewState): void {
    this.stopAnimations();
    this.view = { ...view, target: view.target.clone() };
    this.invalidate();
  }

  private animateTo(to: ViewState, duration: number): void {
    this.turntable = null;
    if (duration <= 0) {
      this.tween = null;
      this.view = to;
      this.invalidate();
      return;
    }
    this.tween = {
      from: { ...this.view, target: this.view.target.clone() },
      to,
      start: now(),
      duration,
    };
    this.kick();
  }

  /** Gentle left-right turntable, used on the reveal screen and in previews. */
  startTurntable(amplitude = 32, speed = 0.12): void {
    this.tween = null;
    const phase = Math.asin(clamp(this.view.yaw / amplitude, -1, 1));
    this.turntable = { amplitude, speed, start: now(), phase };
    this.kick();
  }

  stopAnimations(): void {
    this.tween = null;
    this.turntable = null;
  }

  /** Plays the scan-line reveal (grid -> textured face). */
  playReveal(duration = 2200): void {
    this.reveal = { start: now(), duration };
    this.kick();
  }

  get currentView(): ViewState {
    return { ...this.view, target: this.view.target.clone() };
  }

  // ------------------------------------------------------------------ rendering

  invalidate(): void {
    this.dirty = true;
    this.kick();
  }

  private kick(): void {
    if (this.frame === null && !this.disposed) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (): void => {
    this.frame = null;
    if (this.disposed) return;
    const animating = this.step();
    if (this.dirty || animating) {
      this.dirty = false;
      this.draw();
    }
    if (animating) this.kick();
  };

  /** Advances animations; returns true while anything is still moving. */
  private step(): boolean {
    const t = now();
    let moving = false;
    if (this.tween) {
      const { from, to, start, duration } = this.tween;
      const k = clamp((t - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      this.view.yaw = lerp(from.yaw, to.yaw, e);
      this.view.pitch = lerp(from.pitch, to.pitch, e);
      this.view.zoom = lerp(from.zoom, to.zoom, e);
      this.view.target.lerpVectors(from.target, to.target, e);
      if (k >= 1) this.tween = null;
      moving = true;
    } else if (this.turntable) {
      const { amplitude, speed, start, phase } = this.turntable;
      this.view.yaw = amplitude * Math.sin(phase + ((t - start) / 1000) * speed * Math.PI * 2);
      moving = true;
    } else if (!this.dragging && (Math.abs(this.velocity.yaw) > 0.02 || Math.abs(this.velocity.pitch) > 0.02)) {
      // Inertia after a flick.
      this.view.yaw = clamp(this.view.yaw + this.velocity.yaw, -MAX_YAW, MAX_YAW);
      this.view.pitch = clamp(this.view.pitch + this.velocity.pitch, -MAX_PITCH, MAX_PITCH);
      this.velocity.yaw *= 0.88;
      this.velocity.pitch *= 0.88;
      moving = true;
    }
    if (this.reveal) {
      const k = clamp((t - this.reveal.start) / this.reveal.duration, 0, 1);
      const value = k * k * (3 - 2 * k);
      for (const inst of [this.after, this.before]) if (inst) inst.material.uniforms.uReveal.value = value;
      if (k >= 1) this.reveal = null;
      moving = true;
    }
    return moving;
  }

  private placeCamera(aspect: number): void {
    const { yaw, pitch, zoom, target } = this.view;
    const distance = this.distanceFor(aspect) / zoom;
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    this.camera.aspect = aspect;
    this.camera.position.set(
      target.x + distance * Math.cos(p) * Math.sin(y),
      target.y + distance * Math.sin(p),
      target.z + distance * Math.cos(p) * Math.cos(y),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  }

  private distanceFor(aspect: number): number {
    // Fit the face height, or its width when the viewport is narrow.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byHeight = (this.faceSize.y * 0.5) / tanHalf;
    const byWidth = (this.faceSize.x * 0.5) / (tanHalf * Math.max(aspect, 0.01));
    return Math.max(byHeight, byWidth) * this.fit;
  }

  private draw(): void {
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const W = this.width;
    const H = this.height;
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.clear(true, true, true);

    if (!this.after || !this.before) {
      this.drawBackground(0, 0, W, H, pr);
      this.onFrameEnd();
      return;
    }

    switch (this.compareMode) {
      case 'off':
      case 'original': {
        const inst = this.compareMode === 'off' ? this.after : this.before;
        this.drawFace(inst, 0, 0, W, H, pr);
        break;
      }
      case 'split': {
        const cut = Math.round(W * this.split);
        r.setScissorTest(true);
        r.setScissor(0, 0, cut, H);
        this.drawFace(this.before, 0, 0, W, H, pr);
        r.setScissor(cut, 0, W - cut, H);
        this.drawFace(this.after, 0, 0, W, H, pr);
        r.setScissorTest(false);
        break;
      }
      case 'sideBySide': {
        const half = Math.floor(W / 2);
        r.setScissorTest(true);
        r.setScissor(0, 0, half, H);
        this.drawFace(this.before, 0, 0, half, H, pr);
        r.setScissor(half, 0, W - half, H);
        this.drawFace(this.after, half, 0, W - half, H, pr);
        r.setScissorTest(false);
        break;
      }
    }
    this.onFrameEnd();
  }

  private drawBackground(x: number, y: number, w: number, h: number, pr: number): void {
    const u = (this.background.material as THREE.ShaderMaterial).uniforms;
    u.uViewport.value.set(w * pr, h * pr);
    u.uViewportOrigin.value.set(x * pr, y * pr);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.render(this.backgroundScene, this.backgroundCamera);
  }

  private drawFace(inst: FaceInstance, x: number, y: number, w: number, h: number, pr: number): void {
    this.drawBackground(x, y, w, h, pr);
    this.renderer.clearDepth();
    this.after!.object.visible = inst === this.after;
    this.before!.object.visible = inst === this.before;
    const u = inst.material.uniforms;
    u.uViewport.value.set(w * pr, h * pr);
    u.uViewportOrigin.value.set(x * pr, y * pr);
    this.placeCamera(w / h);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.render(this.scene, this.camera);
  }

  /** Synchronously renders a frame (e.g. right before taking a snapshot). */
  renderNow(): void {
    this.step();
    this.dirty = false;
    this.draw();
  }

  // ------------------------------------------------------------------ cleanup

  private disposeFace(): void {
    for (const inst of [this.after, this.before]) {
      if (!inst) continue;
      this.root.remove(inst.object);
      inst.geometry.dispose();
      inst.material.dispose();
    }
    this.after = this.before = null;
    this.face = null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.disposeFace();
    this.background.geometry.dispose();
    (this.background.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}

function shapeKeysDiffer(a: ControlValues, b: ControlValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ControlValues>;
  for (const k of keys) {
    if (k.startsWith('skin')) continue;
    if ((a[k] ?? 0) !== (b[k] ?? 0)) return true;
  }
  return false;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export { ACCENT };
