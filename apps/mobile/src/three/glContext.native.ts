import { File } from 'expo-file-system';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

export const glViewExtraProps = { msaaSamples: 4 } as Record<string, unknown>;

/** iOS/Android: three.js on an expo-gl context, with a minimal canvas stand-in. */
export function createThreeRenderer(gl: ExpoWebGLRenderingContext, pixelRatio: number): THREE.WebGLRenderer {
  // expo-gl only implements these two pixelStorei parameters and logs a warning for the
  // others three.js sets on every texture upload.
  const pixelStorei = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname: GLenum, param: GLint | GLboolean) => {
    if (pname === gl.UNPACK_FLIP_Y_WEBGL || pname === gl.UNPACK_ALIGNMENT) pixelStorei(pname, param);
  };
  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  const renderer = withoutWebGL1Class(gl, () => new THREE.WebGLRenderer({ canvas, context: gl }));
  renderer.setPixelRatio(pixelRatio);
  return renderer;
}

/**
 * three.js (r163+) rejects any context that is `instanceof WebGLRenderingContext`, taking it
 * for WebGL 1. expo-gl makes its WebGL2RenderingContext extend WebGLRenderingContext, so its
 * WebGL 2 contexts fail that test too. Hide the WebGL 1 class while three.js looks, but only
 * for a context that really is WebGL 2.
 */
function withoutWebGL1Class<T>(gl: ExpoWebGLRenderingContext, create: () => T): T {
  const scope = globalThis as { WebGLRenderingContext?: unknown };
  const webgl1 = scope.WebGLRenderingContext;
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return create();
  scope.WebGLRenderingContext = undefined;
  try {
    return create();
  } finally {
    scope.WebGLRenderingContext = webgl1;
  }
}

/** Saves an offscreen render target to a JPEG file and returns its file:// URI. */
export async function readRenderTarget(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<string | null> {
  const gl = renderer.getContext() as ExpoWebGLRenderingContext;
  const props = renderer.properties.get(target) as { __webglFramebuffer?: WebGLFramebuffer };
  if (!props.__webglFramebuffer) return null;
  const snap = await GLView.takeSnapshotAsync(gl, {
    framebuffer: props.__webglFramebuffer,
    rect: { x: 0, y: 0, width: target.width, height: target.height },
    format: 'jpeg',
    compress: 0.9,
  });
  return typeof snap.uri === 'string' ? snap.uri : snap.localUri || null;
}

/** Look thumbnails are uploaded as data URLs. */
export async function toDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  return `data:image/jpeg;base64,${await new File(uri).base64()}`;
}
