import { describe, expect, it } from 'vitest';

import { naturalSpline } from '../src';

describe('naturalSpline', () => {
  const xs = [0, 0.2, 0.5, 0.7, 1];
  const ys = [0, 0.6, 0.9, 0.7, 0];
  const f = naturalSpline(xs, ys);

  it('passes through the points, in any order', () => {
    xs.forEach((x, i) => expect(f(x)).toBeCloseTo(ys[i], 9));
    const shuffled = naturalSpline([0.5, 1, 0, 0.7, 0.2], [0.9, 0, 0, 0.7, 0.6]);
    for (let x = 0; x <= 1; x += 0.05) expect(shuffled(x)).toBeCloseTo(f(x), 9);
  });

  it('is smooth, and continues as straight lines past the ends', () => {
    const slope = (x: number) => (f(x + 1e-6) - f(x - 1e-6)) / 2e-6;
    for (const x of xs) expect(slope(x - 1e-4)).toBeCloseTo(slope(x + 1e-4), 2);
    expect(f(-0.2) - f(-0.1)).toBeCloseTo(f(-0.1) - f(0), 9);
    expect(f(1.2) - f(1.1)).toBeCloseTo(f(1.1) - f(1), 9);
  });

  it('reproduces a straight line and handles tiny inputs', () => {
    const line = naturalSpline([0, 1, 3], [1, 3, 7]);
    for (const x of [-1, 0.5, 2, 4]) expect(line(x)).toBeCloseTo(1 + 2 * x, 9);
    expect(naturalSpline([2], [5])(10)).toBe(5);
    expect(naturalSpline([0, 0, 1], [0, 2, 3])(0)).toBeCloseTo(1, 9);
  });
});
