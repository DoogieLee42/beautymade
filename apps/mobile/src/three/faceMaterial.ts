import * as THREE from 'three';

// Photos are shown exactly as captured: no linear/sRGB conversions anywhere in the pipeline.
THREE.ColorManagement.enabled = false;

/**
 * Face shader.
 *
 * The albedo comes straight from the user's photos, which already contain the real
 * lighting. To make geometry edits visible without double-lighting the face we use
 * "relative relighting": shading is computed for both the edited normal and the
 * original normal, and only their ratio is applied. An untouched face therefore looks
 * exactly like the photos, while a higher nose bridge or slimmer jaw catches light
 * and shadow as it would in reality. Skin controls (smoothing, tone-up, redness,
 * glow) are masked to skin so eyes, brows and lips stay crisp.
 */
const vertexShader = /* glsl */ `
  attribute vec3 normal0;
  attribute float edgeFade;

  varying vec2 vUv;
  varying vec3 vNormalObj;
  varying vec3 vNormal0Obj;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying float vFade;

  void main() {
    vUv = uv;
    vNormalObj = normal;
    vNormal0Obj = normal0;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vObjPos = position;
    vFade = edgeFade;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAlbedo;
  uniform sampler2D uSmooth;
  uniform sampler2D uMask;
  uniform float uSmoothAmount;
  uniform float uTone;
  uniform float uRedness;
  uniform float uGlow;
  uniform vec3 uSkinTone;
  uniform vec3 uFaceLight;
  uniform vec3 uKeyLight;
  uniform vec3 uBgTop;
  uniform vec3 uBgBottom;
  uniform vec2 uViewport;
  uniform vec2 uViewportOrigin;
  uniform float uReveal;
  uniform vec2 uRevealRange;
  uniform vec3 uAccent;
  uniform float uLit;

  varying vec2 vUv;
  varying vec3 vNormalObj;
  varying vec3 vNormal0Obj;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying float vFade;

  vec3 background(vec2 p) {
    vec3 c = mix(uBgBottom, uBgTop, smoothstep(0.0, 1.0, p.y));
    float vignette = smoothstep(0.95, 0.25, length(p - vec2(0.5, 0.58)));
    return c * mix(0.72, 1.12, vignette);
  }

  float faceShade(vec3 n) {
    return 0.6 + 0.4 * max(dot(n, uFaceLight), 0.0);
  }

  void main() {
    vec2 screen = (gl_FragCoord.xy - uViewportOrigin) / uViewport;
    vec3 bg = background(screen);

    vec3 base = texture2D(uAlbedo, vUv).rgb;
    vec3 smoothed = texture2D(uSmooth, vUv).rgb;
    float skin = texture2D(uMask, vUv).r;
    vec3 col = mix(base, smoothed, uSmoothAmount * skin * 0.92);

    // Redness: pull back only the red that exceeds the person's average skin tone.
    float excess = max(0.0, (col.r - col.g) - (uSkinTone.r - uSkinTone.g));
    col += uRedness * skin * excess * vec3(-0.7, 0.22, 0.26);

    // Tone-up: a gentle screen-style lift with a hint of porcelain pink.
    vec3 lifted = 1.0 - (1.0 - col) * vec3(0.78, 0.8, 0.8);
    col = mix(col, lifted, uTone * skin);

    vec3 n = normalize(vNormalObj);
    vec3 n0 = normalize(vNormal0Obj);
    vec3 nv = normalize(vNormalView);
    vec3 v = normalize(-vViewPos);
    float ndv = clamp(dot(nv, v), 0.0, 1.0);
    if (uLit > 0.5) {
      // Unlit albedo (the sample face): a soft studio key + fill, like a sculpture.
      float key = max(dot(nv, normalize(vec3(-0.5, 0.55, 0.68))), 0.0);
      float fill = max(dot(nv, normalize(vec3(0.65, 0.05, 0.75))), 0.0);
      col *= 0.3 + 0.66 * key + 0.2 * fill;
    } else {
      // Relative relighting (see file comment).
      col *= clamp(faceShade(n) / faceShade(n0), 0.7, 1.3);
      // A touch of view-dependent shading so turning the head reads as 3D.
      col *= mix(0.8, 1.0, pow(ndv, 0.7));
    }

    // Skin sheen: broad and subtle by default, glassy with the glow control.
    vec3 h = normalize(uKeyLight + v);
    float shininess = mix(18.0, 72.0, uGlow);
    float spec = pow(clamp(dot(nv, h), 0.0, 1.0), shininess) * mix(0.035, 0.38, uGlow) * skin;
    col += spec * vec3(1.0, 0.97, 0.95);

    // Soft rim light separates the face from the dark stage.
    col += pow(1.0 - ndv, 3.0) * 0.14 * vec3(1.0);

    // Scan reveal: above the sweep line the face is shown, below it a glowing mesh grid.
    if (uReveal < 1.0) {
      float lineY = mix(uRevealRange.x, uRevealRange.y, uReveal);
      float d = vObjPos.y - lineY;
      vec2 grid = abs(fract(vec2(vObjPos.x + vObjPos.z * 0.6, vObjPos.y) * 1.1) - 0.5);
      float wire = 1.0 - smoothstep(0.0, 0.06, min(grid.x, grid.y));
      vec3 scanned = mix(bg, uAccent, wire * 0.55 + 0.08);
      float band = exp(-abs(d) * 3.5);
      col = d > 0.0 ? col : scanned;
      col += uAccent * band * 0.55;
    }

    gl_FragColor = vec4(mix(bg, col, vFade), 1.0);
  }
`;

export interface FaceMaterialTextures {
  albedo: THREE.Texture;
  smooth: THREE.Texture;
  mask: THREE.Texture;
}

export type StageTheme = 'dark' | 'light';

/** Background gradient per stage theme (top, bottom). */
export const STAGE_COLORS: Record<StageTheme, [THREE.Color, THREE.Color]> = {
  dark: [new THREE.Color('#38383b'), new THREE.Color('#0e0e0f')],
  light: [new THREE.Color('#efeff1'), new THREE.Color('#cfcfd4')],
};

export const ACCENT = new THREE.Color('#ffffff');

export function createFaceMaterial(textures: FaceMaterialTextures, skinTone: number[], lit: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uAlbedo: { value: textures.albedo },
      uSmooth: { value: textures.smooth },
      uMask: { value: textures.mask },
      uSmoothAmount: { value: 0 },
      uTone: { value: 0 },
      uRedness: { value: 0 },
      uGlow: { value: 0 },
      uLit: { value: lit ? 1 : 0 },
      uSkinTone: { value: new THREE.Vector3(...(skinTone.length === 3 ? skinTone : [0.8, 0.65, 0.58])) },
      // Face-space light used only for relative relighting: upper front, slightly to the side.
      uFaceLight: { value: new THREE.Vector3(0.35, 0.55, 0.76).normalize() },
      // View-space key light for specular sheen.
      uKeyLight: { value: new THREE.Vector3(-0.35, 0.5, 0.8).normalize() },
      uBgTop: { value: STAGE_COLORS.dark[0].clone() },
      uBgBottom: { value: STAGE_COLORS.dark[1].clone() },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uViewportOrigin: { value: new THREE.Vector2(0, 0) },
      uReveal: { value: 1 },
      uRevealRange: { value: new THREE.Vector2(11, -12) },
      uAccent: { value: ACCENT.clone() },
    },
  });
}

/** Full-screen gradient drawn behind the face (same formula as the face shader's background). */
export function createBackgroundMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uBgTop: { value: STAGE_COLORS.dark[0].clone() },
      uBgBottom: { value: STAGE_COLORS.dark[1].clone() },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uViewportOrigin: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uBgTop; uniform vec3 uBgBottom; uniform vec2 uViewport; uniform vec2 uViewportOrigin;
      void main() {
        vec2 p = (gl_FragCoord.xy - uViewportOrigin) / uViewport;
        vec3 c = mix(uBgBottom, uBgTop, smoothstep(0.0, 1.0, p.y));
        float vignette = smoothstep(0.95, 0.25, length(p - vec2(0.5, 0.58)));
        gl_FragColor = vec4(c * mix(0.72, 1.12, vignette), 1.0);
      }`,
  });
}
