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
 *
 * Eyes: the eye openings are drawn from a separate eyeball texture, looked up by where
 * the surface is now in a frame fixed to the eyeball. Opening a lid (눈매교정, 트임) therefore
 * reveals eyeball that the lid used to cover instead of stretching the iris. A double-eyelid
 * crease is drawn along the upper lids from per-vertex lid coordinates (mm above the lashes).
 */
const vertexShader = /* glsl */ `
  attribute vec3 normal0;
  attribute float edgeFade;
  attribute float eye;
  attribute float eyeShade;
  attribute vec2 lid;

  varying vec2 vUv;
  varying vec3 vNormalObj;
  varying vec3 vNormal0Obj;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying float vFade;
  varying float vEye;
  varying float vEyeShade;
  varying vec2 vLid;

  void main() {
    vUv = uv;
    vEye = eye;
    vEyeShade = eyeShade;
    vLid = lid;
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
  uniform sampler2D uEyes;
  uniform float uHasEyes;
  uniform vec4 uEyeRightU;
  uniform vec4 uEyeRightV;
  uniform vec4 uEyeLeftU;
  uniform vec4 uEyeLeftV;
  uniform float uCrease;
  uniform float uCreaseHeight;
  uniform float uCreaseShape;

  varying vec2 vUv;
  varying vec3 vNormalObj;
  varying vec3 vNormal0Obj;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vObjPos;
  varying float vFade;
  varying float vEye;
  varying float vEyeShade;
  varying vec2 vLid;

  vec3 background(vec2 p) {
    vec3 c = mix(uBgBottom, uBgTop, smoothstep(0.0, 1.0, p.y));
    float vignette = smoothstep(0.95, 0.25, length(p - vec2(0.5, 0.58)));
    return c * mix(0.72, 1.12, vignette);
  }

  float faceShade(vec3 n) {
    return 0.6 + 0.4 * max(dot(n, uFaceLight), 0.0);
  }

  // Height of the double-eyelid crease along the lid (t: 0 inner corner, 1 outer), as a share of
  // its full height: an in-line tucks into the inner corner, an out-line runs parallel from it,
  // an in-out starts inside and widens towards the outer corner.
  float creaseProfile(float t) {
    float inOut = mix(0.15, 1.0, smoothstep(0.0, 0.8, t));
    float inLine = 0.92 * smoothstep(0.02, 0.45, t);
    float outLine = mix(0.8, 1.0, smoothstep(0.0, 0.35, t));
    return uCreaseShape < 0.0 ? mix(inOut, inLine, -uCreaseShape) : mix(inOut, outLine, uCreaseShape);
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

    // Eye openings: the eyeball, fixed in place behind the lids, shaded along the lid margins.
    bool eyeball = vEye > 0.5 && uHasEyes > 0.5;
    if (eyeball) {
      vec4 p = vec4(vObjPos, 1.0);
      vec2 eyeUv = vEye > 1.5 ? vec2(dot(uEyeLeftU, p), dot(uEyeLeftV, p)) : vec2(dot(uEyeRightU, p), dot(uEyeRightV, p));
      col = texture2D(uEyes, eyeUv).rgb * (1.0 - 0.55 * smoothstep(0.0, 1.0, vEyeShade));
    }

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
      // Relative relighting (see file comment); the eyeball keeps the light it was photographed in.
      if (!eyeball) col *= clamp(faceShade(n) / faceShade(n0), 0.7, 1.3);
      // A touch of view-dependent shading so turning the head reads as 3D.
      col *= mix(0.8, 1.0, pow(ndv, 0.7));
    }

    // Double-eyelid crease uCreaseHeight mm above the lashes, shaded like a fold rather than a
    // line: darkest in the crease, fading softly down the lid below it (the fold's shadow),
    // ending crisply above it where the fold of skin turns towards the light.
    if (uCrease > 0.001 && vEye < 0.5 && vLid.y > -50.0) {
      float t = vLid.x;
      float d = vLid.y - uCreaseHeight * creaseProfile(clamp(t, 0.0, 1.0));
      float k = uCrease * smoothstep(-0.03, 0.1, t) * (1.0 - smoothstep(0.95, 1.12, t)) * smoothstep(0.35, 1.2, vLid.y);
      float shade = d < 0.0 ? exp(-(d * d) / 0.8) : exp(-(d * d) / 0.06);
      float light = d > 0.0 ? exp(-(d - 0.9) * (d - 0.9) / 0.5) : 0.0;
      col *= (1.0 - k * 0.3 * shade) * (1.0 + k * 0.08 * light);
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
  /** The clean eyeball atlas, when the face has one. */
  eyes?: THREE.Texture | null;
}

/** Model-space position -> eyeball atlas uv, per eye (see the API's eyeTexture). */
export interface EyeMaps {
  right: { u: number[]; v: number[] };
  left: { u: number[]; v: number[] };
}

export type StageTheme = 'dark' | 'light';

/** Background gradient per stage theme (top, bottom). */
export const STAGE_COLORS: Record<StageTheme, [THREE.Color, THREE.Color]> = {
  dark: [new THREE.Color('#38383b'), new THREE.Color('#0e0e0f')],
  light: [new THREE.Color('#efeff1'), new THREE.Color('#cfcfd4')],
};

export const ACCENT = new THREE.Color('#ffffff');

export function createFaceMaterial(
  textures: FaceMaterialTextures,
  skinTone: number[],
  lit: boolean,
  eyeMaps: EyeMaps | null = null,
): THREE.ShaderMaterial {
  const hasEyes = !!(textures.eyes && eyeMaps);
  const vec4 = (v: number[] | undefined) => new THREE.Vector4().fromArray(v ?? [0, 0, 0, 0]);
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
      uEyes: { value: hasEyes ? textures.eyes! : null },
      uHasEyes: { value: hasEyes ? 1 : 0 },
      uEyeRightU: { value: vec4(eyeMaps?.right.u) },
      uEyeRightV: { value: vec4(eyeMaps?.right.v) },
      uEyeLeftU: { value: vec4(eyeMaps?.left.u) },
      uEyeLeftV: { value: vec4(eyeMaps?.left.v) },
      uCrease: { value: 0 },
      uCreaseHeight: { value: 7 },
      uCreaseShape: { value: 0 },
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
