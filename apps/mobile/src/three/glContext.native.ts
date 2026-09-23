import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.setPixelRatio(pixelRatio);
  return renderer;
}

/** JPEG data URL of the last presented frame, downscaled to `maxWidth`. */
export async function snapshotToDataUrl(gl: ExpoWebGLRenderingContext, maxWidth = 480): Promise<string | null> {
  const snap = await GLView.takeSnapshotAsync(gl, { format: 'jpeg', compress: 0.92 });
  const uri = typeof snap.uri === 'string' ? snap.uri : snap.localUri;
  if (!uri) return null;
  const image = await ImageManipulator.manipulate(uri).resize({ width: maxWidth }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
}
