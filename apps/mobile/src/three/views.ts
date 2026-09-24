import { CONTROL_BY_ID, type CameraFocus, type CategoryId } from '@beautymade/face-engine';

/** Camera used for a category's preset thumbnails: close on the feature, turned to show its profile. */
export const PRESET_VIEW: Record<CategoryId, Partial<CameraFocus>> = {
  eyes: { ...CONTROL_BY_ID.creaseDepth.focus, yaw: 16, pitch: 0, zoom: 2.2 },
  nose: { ...CONTROL_BY_ID.noseTip.focus, yaw: 58, pitch: 2, zoom: 2.3 },
  contour: { ...CONTROL_BY_ID.chinLength.focus, yaw: 38, pitch: 4, zoom: 1.45 },
  lips: { ...CONTROL_BY_ID.lipVolume.focus, yaw: 24, pitch: 0, zoom: 2.5 },
  skin: { ...CONTROL_BY_ID.skinSmooth.focus, yaw: 22, pitch: 0, zoom: 1.9 },
  lifting: { ...CONTROL_BY_ID.nasolabial.focus, yaw: 34, pitch: 0, zoom: 1.5 },
};

/** Angles offered for captures and comparisons (yaw for the unmirrored face). */
export const ANGLE_VIEWS = {
  front: { yaw: 0, pitch: 0, zoom: 1 },
  left: { yaw: -42, pitch: 0, zoom: 1 },
  right: { yaw: 42, pitch: 0, zoom: 1 },
} satisfies Record<string, Partial<CameraFocus>>;

/** Pleasant three-quarter view the studio opens with. */
export const STUDIO_VIEW: Partial<CameraFocus> = { yaw: 28, pitch: 1, zoom: 1 };
