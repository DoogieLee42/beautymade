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

/** JPEG data URL of the current frame, downscaled to `maxWidth`. */
export async function snapshotToDataUrl(gl: ExpoWebGLRenderingContext, maxWidth = 480): Promise<string | null> {
  const canvas = gl.canvas as HTMLCanvasElement;
  if (!canvas?.width) return null;
  const scale = Math.min(1, maxWidth / canvas.width);
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext('2d')?.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.85);
}
