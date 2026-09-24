export type Vec3 = [number, number, number];

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function readVec3(buffer: ArrayLike<number>, index: number): Vec3 {
  const o = index * 3;
  return [buffer[o], buffer[o + 1], buffer[o + 2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 1e-12 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Natural cubic spline through the points (xs[i], ys[i]), continued as straight lines past
 * both ends (which keeps it smooth there: a natural spline has no curvature at its ends).
 * The points may come in any order; points with the same x are averaged.
 */
export function naturalSpline(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const x: number[] = [];
  const y: number[] = [];
  for (const i of xs.map((_, k) => k).sort((a, b) => xs[a] - xs[b])) {
    if (x.length && xs[i] - x[x.length - 1] < 1e-9) {
      y[y.length - 1] = (y[y.length - 1] + ys[i]) / 2;
      continue;
    }
    x.push(xs[i]);
    y.push(ys[i]);
  }
  const n = x.length;
  if (n === 1) return () => y[0];

  // Second derivatives at the points (zero at both ends), by the tridiagonal (Thomas) algorithm.
  const m = new Array<number>(n).fill(0);
  const c = new Array<number>(n).fill(0);
  const d = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = x[i] - x[i - 1];
    const h1 = x[i + 1] - x[i];
    const denom = 2 * (h0 + h1) - h0 * c[i - 1];
    c[i] = h1 / denom;
    d[i] = (6 * ((y[i + 1] - y[i]) / h1 - (y[i] - y[i - 1]) / h0) - h0 * d[i - 1]) / denom;
  }
  for (let i = n - 2; i >= 1; i--) m[i] = d[i] - c[i] * m[i + 1];

  const first = x[1] - x[0];
  const last = x[n - 1] - x[n - 2];
  const startSlope = (y[1] - y[0]) / first - (m[1] * first) / 6;
  const endSlope = (y[n - 1] - y[n - 2]) / last + (m[n - 2] * last) / 6;
  return (t) => {
    if (t <= x[0]) return y[0] + startSlope * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + endSlope * (t - x[n - 1]);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (x[mid] <= t) lo = mid;
      else hi = mid;
    }
    const h = x[hi] - x[lo];
    const a = (x[hi] - t) / h;
    const b = (t - x[lo]) / h;
    return a * y[lo] + b * y[hi] + (((a * a * a - a) * m[lo] + (b * b * b - b) * m[hi]) * h * h) / 6;
  };
}

/** Mean position of the given vertices. */
export function centroid(positions: ArrayLike<number>, indices: readonly number[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const i of indices) {
    c[0] += positions[i * 3];
    c[1] += positions[i * 3 + 1];
    c[2] += positions[i * 3 + 2];
  }
  return scale(c, 1 / indices.length);
}
