import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import * as THREE from 'three';

import { configure } from './textureLoader.shared';

/**
 * iOS/Android: expo-gl decodes images itself when texImage2D receives `{ localUri }`
 * pointing at a file, so every source is first materialised in the cache directory.
 */
const cacheDir = new Directory(Paths.cache, 'face-textures');

export async function loadTexture(src: string): Promise<THREE.Texture> {
  const uri = await toLocalFile(src);
  const { width, height } = await imageSize(uri);
  const texture = new THREE.Texture();
  // expo-gl's special path: the "pixels" argument is an object with a local file URI.
  texture.image = { data: { localUri: uri }, width, height } as unknown as HTMLImageElement;
  (texture as unknown as { isDataTexture: boolean }).isDataTexture = true;
  texture.unpackAlignment = 1;
  configure(texture);
  return texture;
}

async function toLocalFile(src: string): Promise<string> {
  if (src.startsWith('file://')) return src;
  if (!cacheDir.exists) cacheDir.create({ intermediates: true, idempotent: true });

  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    const header = src.slice(0, comma);
    const data = src.slice(comma + 1);
    const file = new File(cacheDir, `inline-${hash(data)}.${header.includes('png') ? 'png' : 'jpg'}`);
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
      file.write(data, { encoding: 'base64' });
    }
    return file.uri;
  }

  // Signed URLs change over time but the path identifies immutable content.
  const path = src.split('?')[0].replace(/^[a-z]+:\/\/[^/]+/i, '');
  const file = new File(cacheDir, path.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-150));
  if (!file.exists) await File.downloadFileAsync(src, file, { idempotent: true });
  return file.uri;
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + text.length.toString(36);
}
