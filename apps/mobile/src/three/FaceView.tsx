import Ionicons from '@expo/vector-icons/Ionicons';
import type { CameraFocus, ControlValues } from '@beautymade/face-engine';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { FaceModel } from '../api/types';
import { colors } from '../theme';
import { FaceRenderer, type CompareMode, type RenderStyle, type ThumbnailRequest } from './FaceRenderer';
import type { StageTheme } from './faceMaterial';
import { loadFace } from './faceAssets';
import { createThreeRenderer, glViewExtraProps, readRenderTarget, toDataUrl } from './glContext';

export interface FaceViewHandle {
  focus(focus: Partial<CameraFocus>): void;
  resetView(): void;
  /** Offscreen render of the face with any values/camera; resolves to an image URI. */
  renderThumbnail(req: ThumbnailRequest): Promise<string | null>;
  /** JPEG data URL of a clean three-quarter render of `values`, for look thumbnails. */
  snapshot(values: ControlValues): Promise<string | null>;
  /** The camera angle currently on screen, as a focus request. */
  currentFocus(): Partial<CameraFocus>;
  /** Like renderThumbnail, but always resolves to a JPEG data URL (for uploads). */
  renderDataUrl(req: ThumbnailRequest): Promise<string | null>;
}

export interface FaceViewProps {
  face: FaceModel | null;
  values?: ControlValues;
  /** Values of the comparison face; {} (default) is the original face. */
  compareValues?: ControlValues;
  compareMode?: CompareMode;
  compareLabels?: [string, string];
  /** Distance from the top of the view to the compare labels (to clear overlays). */
  compareLabelsTop?: number;
  /** Makes the "before" label a button (e.g. to pick what to compare against). */
  onBeforeLabelPress?: () => void;
  /** Vertical position of the split handle, 0 (top) to 1 (bottom). */
  splitHandleY?: number;
  /** Framing margin: 1 = the face touches the edges; larger values zoom out. */
  fit?: number;
  theme?: StageTheme;
  renderStyle?: RenderStyle;
  mirrored?: boolean;
  interactive?: boolean;
  /** true: gentle left-right sway. 'full': continuous rotation. */
  turntable?: boolean | 'full';
  reveal?: boolean;
  /** Hide the built-in loading indicator (when the screen shows its own). */
  quietLoading?: boolean;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
  onInteract?: () => void;
  ref?: Ref<FaceViewHandle>;
}

const EMPTY: ControlValues = {};

export function FaceView({
  face,
  values = EMPTY,
  compareValues = EMPTY,
  compareMode = 'off',
  compareLabels = ['Before', 'After'],
  compareLabelsTop = 14,
  onBeforeLabelPress,
  splitHandleY = 0.5,
  fit = 1.3,
  theme = 'dark',
  renderStyle = 'photo',
  mirrored = false,
  interactive = true,
  turntable = false,
  reveal = false,
  quietLoading = false,
  style,
  onReady,
  onInteract,
  ref,
}: FaceViewProps) {
  const rendererRef = useRef<FaceRenderer | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState(0.5);
  const lastPan = useRef({ x: 0, y: 0 });
  const lastPinch = useRef(1);
  const splitStart = useRef(0.5);

  // Keep the latest props for the renderer, which may be created after they arrive.
  const props = { values, compareValues, compareMode, mirrored, turntable, reveal, split, fit, theme, renderStyle };
  const latest = useRef(props);
  latest.current = props;

  const faceId = face?.id ?? null;

  const startMotion = (renderer: FaceRenderer) => {
    const t = latest.current.turntable;
    if (t === 'full') renderer.startTurntable(0, 0.08, true);
    else if (t) renderer.startTurntable();
  };

  const attachFace = (renderer: FaceRenderer) => {
    if (!face) return;
    loadFace(face)
      .then((loaded) => {
        if (rendererRef.current !== renderer) return;
        const p = latest.current;
        renderer.setValues(p.values);
        renderer.setCompareValues(p.compareValues);
        renderer.setFace(loaded);
        if (p.reveal) renderer.playReveal();
        startMotion(renderer);
        setLoadedId(loaded.id);
        setError(null);
        onReady?.();
      })
      .catch(() => setError('3D 얼굴을 불러오지 못했어요.'));
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const renderer = new FaceRenderer(createThreeRenderer(gl, PixelRatio.get()), {
      onFrameEnd: () => gl.endFrameEXP(),
      readTarget: readRenderTarget,
    });
    rendererRef.current = renderer;
    const { width, height } = sizeRef.current;
    if (width && height) renderer.setSize(width, height);
    const p = latest.current;
    renderer.setCompareMode(p.compareMode);
    renderer.setMirrored(p.mirrored);
    renderer.setSplit(p.split);
    renderer.setFit(p.fit);
    renderer.setTheme(p.theme);
    renderer.setRenderStyle(p.renderStyle);
    attachFace(renderer);
  };

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer && faceId) attachFace(renderer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId]);

  useEffect(() => rendererRef.current?.setValues(values), [values]);
  useEffect(() => rendererRef.current?.setCompareValues(compareValues), [compareValues]);
  useEffect(() => rendererRef.current?.setCompareMode(compareMode), [compareMode]);
  useEffect(() => rendererRef.current?.setMirrored(mirrored), [mirrored]);
  useEffect(() => rendererRef.current?.setSplit(split), [split]);
  useEffect(() => rendererRef.current?.setFit(fit), [fit]);
  useEffect(() => rendererRef.current?.setTheme(theme), [theme]);
  useEffect(() => rendererRef.current?.setRenderStyle(renderStyle), [renderStyle]);
  // Start or stop the turntable when the prop changes (not on load, which would cancel
  // a camera move requested from onReady).
  const turning = useRef(turntable);
  useEffect(() => {
    const renderer = rendererRef.current;
    const was = turning.current;
    turning.current = turntable;
    if (!renderer || !loadedId || was === turntable) return;
    if (turntable) startMotion(renderer);
    else renderer.stopAnimations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turntable, loadedId]);

  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    focus: (f) => rendererRef.current?.focus(f),
    resetView: () => rendererRef.current?.resetView(),
    currentFocus: () => rendererRef.current?.currentFocus() ?? { yaw: 0, pitch: 0, zoom: 1 },
    renderDataUrl: async (req) => {
      const uri = rendererRef.current ? await rendererRef.current.renderThumbnail(req) : null;
      return uri ? toDataUrl(uri) : null;
    },
    renderThumbnail: async (req) => (rendererRef.current ? rendererRef.current.renderThumbnail(req) : null),
    snapshot: async (v) => {
      const renderer = rendererRef.current;
      if (!renderer) return null;
      const uri = await renderer.renderThumbnail({ values: v, focus: { yaw: -22, pitch: 2, zoom: 1.12 }, width: 300, height: 360 });
      return uri ? toDataUrl(uri) : null;
    },
  }));

  const orbit = Gesture.Pan()
    .runOnJS(true)
    .enabled(interactive)
    .minDistance(2)
    .onBegin(() => {
      lastPan.current = { x: 0, y: 0 };
      rendererRef.current?.beginDrag();
      onInteract?.();
    })
    .onUpdate((e) => {
      rendererRef.current?.orbitBy(e.translationX - lastPan.current.x, e.translationY - lastPan.current.y);
      lastPan.current = { x: e.translationX, y: e.translationY };
    })
    .onFinalize(() => rendererRef.current?.endDrag());

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .enabled(interactive)
    .onBegin(() => {
      lastPinch.current = 1;
      onInteract?.();
    })
    .onUpdate((e) => {
      rendererRef.current?.zoomBy(e.scale / lastPinch.current);
      lastPinch.current = e.scale;
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .enabled(interactive)
    .numberOfTaps(2)
    .onEnd(() => rendererRef.current?.resetView());

  const divider = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ horizontal: 24 })
    .onBegin(() => {
      splitStart.current = latest.current.split;
    })
    .onUpdate((e) => {
      if (size.width) setSplit(Math.min(0.95, Math.max(0.05, splitStart.current + e.translationX / size.width)));
    });

  const loading = !!face && loadedId !== face.id && !error;
  const labelTop = { top: compareLabelsTop };

  const beforeLabel = (position: ViewStyle) =>
    onBeforeLabelPress ? (
      <Pressable
        onPress={onBeforeLabelPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`비교 대상: ${compareLabels[0]}`}
        style={({ pressed }) => [styles.compareLabel, styles.compareLabelButton, labelTop, position, pressed && { opacity: 0.75 }]}
      >
        <Text style={styles.compareLabelText} numberOfLines={1}>
          {compareLabels[0]}
        </Text>
        <Ionicons name="chevron-down" size={13} color="#FFFFFF" />
      </Pressable>
    ) : (
      <View pointerEvents="none" style={[styles.compareLabel, labelTop, position]}>
        <Text style={styles.compareLabelText} numberOfLines={1}>
          {compareLabels[0]}
        </Text>
      </View>
    );

  return (
    <View
      style={[styles.container, theme === 'light' && styles.containerLight, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        sizeRef.current = { width, height };
        setSize({ width, height });
        rendererRef.current?.setSize(width, height);
      }}
    >
      <GestureDetector gesture={Gesture.Simultaneous(orbit, pinch, doubleTap)}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} {...glViewExtraProps} />
        </View>
      </GestureDetector>

      {compareMode === 'split' && size.width > 0 && (
        <>
          {beforeLabel({ left: 14 })}
          <View pointerEvents="none" style={[styles.compareLabel, labelTop, { right: 14 }]}>
            <Text style={styles.compareLabelText}>{compareLabels[1]}</Text>
          </View>
          <View pointerEvents="none" style={[styles.dividerLine, { left: split * size.width - 1 }]} />
          <GestureDetector gesture={divider}>
            <View style={[styles.dividerKnob, { left: split * size.width - 20, top: size.height * splitHandleY - 20 }]}>
              <Ionicons name="code-outline" size={18} color={colors.ink} />
            </View>
          </GestureDetector>
        </>
      )}

      {compareMode === 'sideBySide' && size.width > 0 && (
        <>
          {beforeLabel({ left: 14 })}
          <View pointerEvents="none" style={[styles.compareLabel, labelTop, { left: size.width / 2 + 14 }]}>
            <Text style={styles.compareLabelText}>{compareLabels[1]}</Text>
          </View>
          <View pointerEvents="none" style={[styles.sideDivider, { left: size.width / 2 - 0.5 }]} />
        </>
      )}

      {(loading || !face) && !quietLoading && (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color={theme === 'light' ? colors.ink : colors.stageText} />
        </View>
      )}
      {error && (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={[styles.overlayText, theme === 'light' && { color: colors.muted }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.stage, overflow: 'hidden' },
  containerLight: { backgroundColor: '#E2E2E5' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10 },
  overlayText: { color: colors.stageMuted, fontSize: 13 },
  compareLabel: {
    position: 'absolute',
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(90,90,94,0.62)',
  },
  compareLabelButton: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '46%' },
  compareLabelText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  dividerKnob: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 10px rgba(0,0,0,0.3)',
  },
  sideDivider: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
});
