import * as THREE from 'three';

import { configure } from './textureLoader.shared';

/** Web: textures load through the browser's image decoder (CORS-enabled signed URLs or data: URLs). */
export async function loadTexture(src: string): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const texture = await loader.loadAsync(src);
  configure(texture);
  return texture;
}
