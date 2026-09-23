import {
  computeVertexNormals,
  type CameraFocus,
  type ControlValues,
  type DeformationModel,
  type FaceMesh,
} from '@beautymade/face-engine';
import * as THREE from 'three';

import {
  STAGE_COLORS,
  createBackgroundMaterial,
  createFaceMaterial,
  type FaceMaterialTextures,
  type StageTheme,
} from './faceMaterial';
import { createWireframe, type WireMesh } from './wireframe';

export interface LoadedFace {
  id: string;
  mesh: FaceMesh;
  wire: WireMesh;
  model: DeformationModel;
  textures: FaceMaterialTextures;
  skinTone: number[];
  /** True when the albedo has no baked lighting (the sample face): render with studio lights. */
  lit: boolean;
}

/**
 * off:        the edited face ("after")
 * original:   the untouched face (press-and-hold "before")
 * split:      before | after divided by a draggable vertical line, same camera
 * sideBySide: two faces in two viewports (e.g. before and after, or two looks)
 */
export type CompareMode = 'off' | 'original' | 'split' | 'sideBySide';

/** photo: the textured face. wireframe: glowing mesh used while the face is generated. */
export type RenderStyle = 'photo' | 'wireframe';

export interface ViewState {
  yaw: number;
  pitch: number;
  zoom: number;
  target: THREE.Vector3;
}

export interface ThumbnailRequest {
  values: ControlValues;
  focus: Partial<CameraFocus>;
  width: number;
  height: number;
  theme?: StageTheme;
  /** Renders a before | after pair instead: these values on the left, `values` on the right. */
  pair?: ControlValues;
  /** Framing margin (see setFit); thumbnails don't inherit the view's. Default 1.1. */
  fit?: number;
}

/** Reads a render target back as an image URI (platform specific, see glContext). */
export type ReadTarget = (renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) => Promise<string | null>;

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
  private readonly thumbCamera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private readonly background: THREE.Mesh;
  private readonly backgroundScene = new THREE.Scene();
  private readonly backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly root = new THREE.Group();

  private face: LoadedFace | null = null;
  private after: FaceInstance | null = null;
  private before: FaceInstance | null = null;
  private thumb: FaceInstance | null = null;
  private thumbPair: FaceInstance | null = null;
  private wire: ReturnType<typeof createWireframe> | null = null;
  private afterValues: ControlValues = {};
  private beforeValues: ControlValues = {};
  private faceCenter = new THREE.Vector3();
  private faceSize = new THREE.Vector2(16, 18);

  private width = 1;
  private height = 1;
  private compareMode: CompareMode = 'off';
  private style: RenderStyle = 'photo';
  private theme: StageTheme = 'dark';
  private split = 0.5;
  private mirrored = false;
  private fit = 1.3;

  private view: ViewState = { yaw: 0, pitch: 0, zoom: 1, target: new THREE.Vector3() };
  private tween: { from: ViewState; to: ViewState; start: number; duration: number } | null = null;
  private turntable: { amplitude: number; speed: number; start: number; phase: number; full: boolean } | null = null;
  private reveal: { start: number; duration: number } | null = null;
  private velocity = { yaw: 0, pitch: 0 };
  private dragging = false;

  private frame: number | null = null;
  private dirty = true;
  private disposed = false;
  private thumbQueue: Promise<unknown> = Promise.resolve();

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly options: { onFrameEnd?: () => void; readTarget?: ReadTarget } = {},
  ) {
    this.renderer = renderer;
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(STAGE_COLORS.dark[1], 1);
    this.background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), createBackgroundMaterial());
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

    // Frame the face (the landmarks), not the whole head, so every model is framed alike.
    const faceBox = new THREE.Box3();
    const p = face.mesh.positions;
    const point = new THREE.Vector3();
    for (let i = 0; i < face.mesh.landmarkCount; i++) faceBox.expandByPoint(point.fromArray(p, i * 3));
    faceBox.getCenter(this.faceCenter);
    this.faceSize.set(faceBox.max.x - faceBox.min.x, faceBox.max.y - faceBox.min.y);
    this.after.geometry.computeBoundingBox();
    const box = this.after.geometry.boundingBox!;
    const faceDepth = faceBox.max.z * 0.35 + faceBox.min.z * 0.65;
    // With a head, orbit around a point between the face and the middle of the head.
    this.faceCenter.z = face.mesh.hasHead ? faceDepth * 0.55 + ((box.max.z + box.min.z) / 2) * 0.45 : faceDepth;
    for (const inst of [this.after, this.before]) {
      inst.material.uniforms.uRevealRange.value.set(box.max.y + 0.5, box.min.y - 0.5);
    }

    this.wire = createWireframe(face.wire, this.renderer.getPixelRatio(), !face.mesh.hasHead);
    this.root.add(this.wire.group);

    this.view = { yaw: 0, pitch: 0, zoom: 1, target: this.faceCenter.clone() };
    this.applyTheme();
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
    const material = createFaceMaterial(face.textures, face.skinTone, face.lit);
    const object = new THREE.Mesh(geometry, material);
    object.frustumCulled = false;
    object.visible = false;
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
    if (force || shapeKeysDiffer(prev, values)) {
      const pos = inst.positions.array as Float32Array;
      face.model.apply(values, pos);
      computeVertexNormals(pos, face.mesh.indices, inst.normals.array as Float32Array, face.mesh.weld);
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

  setRenderStyle(style: RenderStyle): void {
    if (style === this.style) return;
    this.style = style;
    this.invalidate();
  }

  setTheme(theme: StageTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.applyTheme();
    this.invalidate();
  }

  private applyTheme(theme: StageTheme = this.theme): void {
    const [top, bottom] = STAGE_COLORS[theme];
    const materials = [this.background.material as THREE.ShaderMaterial];
    for (const inst of [this.after, this.before, this.thumb, this.thumbPair]) if (inst) materials.push(inst.material);
    for (const m of materials) {
      m.uniforms.uBgTop.value.copy(top);
      m.uniforms.uBgBottom.value.copy(bottom);
    }
    this.renderer.setClearColor(bottom, 1);
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

  /** Camera state for a focus request. Yaw is given for the unmirrored face. */
  private viewFor(focus: Partial<CameraFocus>, positions?: ArrayLike<number>): ViewState {
    const sign = this.mirrored ? -1 : 1;
    const center = new THREE.Vector3(this.faceCenter.x * sign, this.faceCenter.y, this.faceCenter.z);
    const target = center.clone();
    const zoom = focus.zoom ?? 1;
    const face = this.face;
    if (face && focus.target?.length) {
      const c = face.model.landmarkCentroid(positions ?? face.mesh.positions, focus.target);
      // Move from the face centre towards the feature as we zoom in.
      const t = clamp((zoom - 1) / 0.6, 0, 1);
      target.x = lerp(center.x, c[0] * sign, t);
      target.y = lerp(center.y, c[1], t);
    }
    return { yaw: (focus.yaw ?? 0) * sign, pitch: focus.pitch ?? 0, zoom, target };
  }

  /** Animates to a camera pose. */
  focus(focus: Partial<CameraFocus>, duration = 650): void {
    this.animateTo(this.viewFor(focus, this.after?.positions.array as Float32Array | undefined), duration);
  }

  resetView(duration = 600): void {
    this.focus({ yaw: 0, pitch: 0, zoom: 1 }, duration);
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
    this.tween = { from: { ...this.view, target: this.view.target.clone() }, to, start: now(), duration };
    this.kick();
  }

  /** Gentle left-right turntable, or a continuous rotation (`full`) for the wireframe. */
  startTurntable(amplitude = 32, speed = 0.12, full = false): void {
    this.tween = null;
    const phase = full ? THREE.MathUtils.degToRad(this.view.yaw) : Math.asin(clamp(this.view.yaw / amplitude, -1, 1));
    this.turntable = { amplitude, speed, start: now(), phase, full };
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

  /** The on-screen angle as a focus request (yaw for the unmirrored face), centred on the face. */
  currentFocus(): Partial<CameraFocus> {
    const sign = this.mirrored ? -1 : 1;
    return { yaw: this.view.yaw * sign, pitch: this.view.pitch, zoom: Math.min(this.view.zoom, 1.2) };
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
      const { amplitude, speed, start, phase, full } = this.turntable;
      const angle = phase + ((t - start) / 1000) * speed * Math.PI * 2;
      this.view.yaw = full ? THREE.MathUtils.radToDeg(angle) : amplitude * Math.sin(angle);
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

  private placeCamera(camera: THREE.PerspectiveCamera, view: ViewState, aspect: number, fit = this.fit): void {
    const { yaw, pitch, zoom, target } = view;
    const distance = this.distanceFor(aspect, fit) / zoom;
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    camera.aspect = aspect;
    camera.position.set(
      target.x + distance * Math.cos(p) * Math.sin(y),
      target.y + distance * Math.sin(p),
      target.z + distance * Math.cos(p) * Math.cos(y),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  private distanceFor(aspect: number, fit: number): number {
    // Fit the face height, or its width when the viewport is narrow.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byHeight = (this.faceSize.y * 0.5) / tanHalf;
    const byWidth = (this.faceSize.x * 0.5) / (tanHalf * Math.max(aspect, 0.01));
    return Math.max(byHeight, byWidth) * fit;
  }

  private draw(): void {
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const W = this.width;
    const H = this.height;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.clear(true, true, true);

    if (!this.after || !this.before) {
      this.drawBackground(0, 0, W, H, pr);
    } else if (this.style === 'wireframe') {
      this.drawWireframe(W, H);
    } else {
      switch (this.compareMode) {
        case 'off':
        case 'original':
          this.drawFace(this.compareMode === 'off' ? this.after : this.before, 0, 0, W, H, pr);
          break;
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
    }
    this.options.onFrameEnd?.();
  }

  private drawBackground(x: number, y: number, w: number, h: number, pr: number): void {
    const u = (this.background.material as THREE.ShaderMaterial).uniforms;
    u.uViewport.value.set(w * pr, h * pr);
    u.uViewportOrigin.value.set(x * pr, y * pr);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.render(this.backgroundScene, this.backgroundCamera);
  }

  private showOnly(object: THREE.Object3D | null): void {
    for (const inst of [this.after, this.before, this.thumb, this.thumbPair]) if (inst) inst.object.visible = inst.object === object;
    if (this.wire) this.wire.group.visible = object === this.wire.group;
  }

  private drawFace(inst: FaceInstance, x: number, y: number, w: number, h: number, pr: number): void {
    this.drawBackground(x, y, w, h, pr);
    this.renderer.clearDepth();
    this.showOnly(inst.object);
    const u = inst.material.uniforms;
    u.uViewport.value.set(w * pr, h * pr);
    u.uViewportOrigin.value.set(x * pr, y * pr);
    this.placeCamera(this.camera, this.view, w / h);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.render(this.scene, this.camera);
  }

  private drawWireframe(w: number, h: number): void {
    const r = this.renderer;
    r.setViewport(0, 0, w, h);
    r.setClearColor(0x050505, 1);
    r.clear(true, true, true);
    r.setClearColor(STAGE_COLORS[this.theme][1], 1);
    if (!this.wire) return;
    this.showOnly(this.wire.group);
    this.placeCamera(this.camera, this.view, w / h);
    const d = this.camera.position.distanceTo(this.view.target);
    this.wire.setDepthRange(d - 8, d + 12);
    r.render(this.scene, this.camera);
  }

  /** Synchronously renders a frame (e.g. right before taking a snapshot). */
  renderNow(): void {
    this.step();
    this.dirty = false;
    this.draw();
  }

  /**
   * Renders the face with arbitrary values and camera into an offscreen target and
   * returns an image URI, without touching what's on screen. Requests are serialised.
   */
  renderThumbnail(req: ThumbnailRequest): Promise<string | null> {
    const job = this.thumbQueue.then(() => this.renderThumbnailNow(req));
    this.thumbQueue = job.catch(() => null);
    return job;
  }

  private async renderThumbnailNow(req: ThumbnailRequest): Promise<string | null> {
    const face = this.face;
    const read = this.options.readTarget;
    if (!face || !read || this.disposed) return null;
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const W = Math.max(1, Math.round(req.width * pr));
    const H = Math.max(1, Math.round(req.height * pr));
    if (!this.thumb) {
      this.thumb = this.createInstance(face);
      this.root.add(this.thumb.object);
    }
    const panels: { inst: FaceInstance; values: ControlValues; x: number; w: number }[] = [];
    if (req.pair) {
      if (!this.thumbPair) {
        this.thumbPair = this.createInstance(face);
        this.root.add(this.thumbPair.object);
      }
      const gap = Math.max(2, Math.round(pr * 1.5));
      const half = Math.floor((W - gap) / 2);
      panels.push({ inst: this.thumbPair, values: req.pair, x: 0, w: half });
      panels.push({ inst: this.thumb, values: req.values, x: half + gap, w: W - half - gap });
    } else {
      panels.push({ inst: this.thumb, values: req.values, x: 0, w: W });
    }
    for (const p of panels) this.applyInstanceValues(p.inst, p.values, true);
    this.applyTheme(req.theme ?? this.theme);

    const target = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
    try {
      // A white background shows through the gap between a pair.
      r.setClearColor(0xffffff, 1);
      r.setScissorTest(false);
      r.setRenderTarget(target);
      r.clear(true, true, true);
      const bg = (this.background.material as THREE.ShaderMaterial).uniforms;
      for (const { inst, x, w } of panels) {
        target.viewport.set(x, 0, w, H);
        target.scissor.set(x, 0, w, H);
        target.scissorTest = true;
        r.setRenderTarget(target);
        bg.uViewport.value.set(w, H);
        bg.uViewportOrigin.value.set(x, 0);
        r.render(this.backgroundScene, this.backgroundCamera);
        r.clearDepth();
        this.showOnly(inst.object);
        inst.material.uniforms.uViewport.value.set(w, H);
        inst.material.uniforms.uViewportOrigin.value.set(x, 0);
        inst.material.uniforms.uReveal.value = 1;
        this.placeCamera(this.thumbCamera, this.viewFor(req.focus, inst.positions.array as Float32Array), w / H, req.fit ?? 1.1);
        r.render(this.scene, this.thumbCamera);
      }
      target.viewport.set(0, 0, W, H);
      target.scissorTest = false;
      r.setRenderTarget(target);
      return await read(r, target);
    } finally {
      r.setRenderTarget(null);
      target.dispose();
      this.applyTheme();
      this.invalidate();
    }
  }

  // ------------------------------------------------------------------ cleanup

  private disposeFace(): void {
    for (const inst of [this.after, this.before, this.thumb, this.thumbPair]) {
      if (!inst) continue;
      this.root.remove(inst.object);
      inst.geometry.dispose();
      inst.material.dispose();
    }
    if (this.wire) {
      this.root.remove(this.wire.group);
      this.wire.dispose();
    }
    this.after = this.before = this.thumb = this.thumbPair = null;
    this.wire = null;
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
