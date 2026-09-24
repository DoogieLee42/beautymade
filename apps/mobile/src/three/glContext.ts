import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

/** Web: a real canvas; keep the drawing buffer so snapshots can read it back. */
export const glViewExtraProps = {
  webglContextAttributes: { antialias: true, alpha: false, preserveDrawingBuffer: true },
} as Record<string, unknown>;

export function createThreeRenderer(gl: ExpoWebGLRenderingContext, pixelRatio: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas: gl.canvas as HTMLCanvasElement,
    context: gl,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(pixelRatio);
  return renderer;
}

/** Reads an offscreen render target into a JPEG data URL. */
export async function readRenderTarget(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<string | null> {
  const { width, height } = target;
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  // GL rows start at the bottom; images start at the top.
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Thumbnails are already data URLs on web. */
export async function toDataUrl(uri: string): Promise<string> {
  return uri;
}
