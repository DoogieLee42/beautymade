import * as THREE from 'three';

/** Face mesh edges at a density that reads as a "3D scan" (one subdivision level). */
export interface WireMesh {
  positions: Float32Array;
  edges: Uint16Array | Uint32Array;
}

/** Unique edges of a triangle mesh as index pairs. */
export function meshEdges(indices: ArrayLike<number>, vertexCount: number): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      const b = indices[t + ((k + 1) % 3)];
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a, b);
    }
  }
  return Uint32Array.from(out);
}

/**
 * A lattice for the back of the head and the neck, so the scanning animation shows a
 * whole head rather than a floating mask. Coordinates match the canonical face frame
 * (x right, y up, z forward, ~cm).
 */
function headShell(): { points: number[]; segments: number[] } {
  const points: number[] = [];
  const segments: number[] = [];
  const c = [0, 1.2, -3.6];
  const r = [8.5, 11.2, 10.8];
  const lat = 16;
  const lon = 30;
  const index: number[][] = [];
  for (let i = 1; i < lat; i++) {
    const theta = (Math.PI * i) / lat;
    index[i] = [];
    for (let j = 0; j < lon; j++) {
      const phi = (2 * Math.PI * j) / lon;
      const x = c[0] + r[0] * Math.sin(theta) * Math.sin(phi);
      const y = c[1] + r[1] * Math.cos(theta);
      const z = c[2] + r[2] * Math.sin(theta) * Math.cos(phi);
      // Skip the part of the skull where the face mesh already is.
      const behindFace = z < -1.4 || y > 8.8 || Math.abs(x) > 7.6;
      if (!behindFace || y < -7.5) {
        index[i][j] = -1;
        continue;
      }
      index[i][j] = points.length / 3;
      points.push(x, y, z);
    }
  }
  for (let i = 1; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = index[i][j];
      if (a < 0) continue;
      const right = index[i][(j + 1) % lon];
      if (right >= 0) segments.push(a, right);
      const below = i + 1 < lat ? index[i + 1][j] : -1;
      if (below >= 0) segments.push(a, below);
    }
  }
  // Neck: an elliptic cylinder under the jaw.
  const rings = 7;
  const around = 20;
  const neckStart = points.length / 3;
  for (let k = 0; k < rings; k++) {
    const y = -8 - k * 1.35;
    for (let j = 0; j < around; j++) {
      const phi = (2 * Math.PI * j) / around;
      points.push(Math.sin(phi) * 4.7, y, -3.2 + Math.cos(phi) * 4.5);
    }
  }
  for (let k = 0; k < rings; k++) {
    for (let j = 0; j < around; j++) {
      const a = neckStart + k * around + j;
      segments.push(a, neckStart + k * around + ((j + 1) % around));
      if (k + 1 < rings) segments.push(a, a + around);
    }
  }
  return { points, segments };
}

const vertexShader = /* glsl */ `
  uniform float uPointSize;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uPoints;
  uniform vec2 uDepthRange;
  varying float vDepth;
  void main() {
    float a = uOpacity * mix(1.0, 0.28, smoothstep(uDepthRange.x, uDepthRange.y, vDepth));
    if (uPoints > 0.5) {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      a *= smoothstep(1.0, 0.2, d);
    }
    gl_FragColor = vec4(vec3(1.0), a);
  }
`;

function wireMaterial(points: boolean, opacity: number, pointSize: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: opacity },
      uPoints: { value: points ? 1 : 0 },
      uPointSize: { value: pointSize },
      uDepthRange: { value: new THREE.Vector2(50, 75) },
    },
  });
}

/**
 * Glowing white wireframe head: mesh edges and vertex dots. Face-only models get a
 * stand-in lattice for the back of the head and the neck (`withShell`).
 */
export function createWireframe(
  wire: WireMesh,
  pixelRatio: number,
  withShell = true,
): { group: THREE.Group; dispose(): void; setDepthRange(near: number, far: number): void } {
  const group = new THREE.Group();

  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute('position', new THREE.BufferAttribute(wire.positions, 3));
  faceGeometry.setIndex(new THREE.BufferAttribute(wire.edges, 1));
  const faceLines = new THREE.LineSegments(faceGeometry, wireMaterial(false, 0.34, 1));
  const faceDots = new THREE.Points(faceGeometry, wireMaterial(true, 0.9, 3.2 * pixelRatio));

  const shell = withShell ? headShell() : { points: [], segments: [] };
  const shellGeometry = new THREE.BufferGeometry();
  shellGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shell.points, 3));
  shellGeometry.setIndex(shell.segments);
  const shellLines = new THREE.LineSegments(shellGeometry, wireMaterial(false, 0.2, 1));
  const shellDots = new THREE.Points(shellGeometry, wireMaterial(true, 0.55, 2.6 * pixelRatio));

  for (const obj of [shellLines, shellDots, faceLines, faceDots]) {
    obj.frustumCulled = false;
    group.add(obj);
  }
  const materials = [faceLines, faceDots, shellLines, shellDots].map((o) => o.material as THREE.ShaderMaterial);
  return {
    group,
    setDepthRange(near, far) {
      for (const m of materials) m.uniforms.uDepthRange.value.set(near, far);
    },
    dispose() {
      faceGeometry.dispose();
      shellGeometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
