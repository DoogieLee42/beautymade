import type { CameraFocus, ControlValues } from '@beautymade/face-engine';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, PixelRatio, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { FaceModel } from '../api/types';
import { colors } from '../theme';
import { FaceRenderer, type CompareMode } from './FaceRenderer';
import { loadFace } from './faceAssets';
import { createThreeRenderer, glViewExtraProps, snapshotToDataUrl } from './glContext';

export interface FaceViewHandle {
  focus(focus: Partial<CameraFocus>): void;
  resetView(): void;
  /** JPEG data URL of a clean frontal render, for look thumbnails. */
  snapshot(): Promise<string | null>;
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
  /** Framing margin: 1 = the face touches the edges; larger values zoom out. */
  fit?: number;
  mirrored?: boolean;
  interactive?: boolean;
  turntable?: boolean;
  reveal?: boolean;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
  ref?: Ref<FaceViewHandle>;
}

const EMPTY: ControlValues = {};

export function FaceView({
  face,
  values = EMPTY,
  compareValues = EMPTY,
  compareMode = 'off',
  compareLabels = ['원본', '변경 후'],
  compareLabelsTop = 14,
  fit = 1.3,
  mirrored = false,
  interactive = true,
  turntable = false,
  reveal = false,
  style,
  onReady,
  ref,
}: FaceViewProps) {
  const rendererRef = useRef<FaceRenderer | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState(0.5);
  const lastPan = useRef({ x: 0, y: 0 });
  const lastPinch = useRef(1);
  const splitStart = useRef(0.5);

  // Keep the latest props for the renderer, which may be created after they arrive.
  const latest = useRef({ values, compareValues, compareMode, mirrored, turntable, reveal, split, fit });
  latest.current = { values, compareValues, compareMode, mirrored, turntable, reveal, split, fit };

  const faceId = face?.id ?? null;

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
        if (p.turntable) renderer.startTurntable();
        setLoadedId(loaded.id);
        setError(null);
        onReady?.();
      })
      .catch(() => setError('3D 얼굴을 불러오지 못했어요.'));
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;
    const renderer = new FaceRenderer(createThreeRenderer(gl, PixelRatio.get()), () => gl.endFrameEXP());
    rendererRef.current = renderer;
    const { width, height } = sizeRef.current;
    if (width && height) renderer.setSize(width, height);
    const p = latest.current;
    renderer.setCompareMode(p.compareMode);
    renderer.setMirrored(p.mirrored);
    renderer.setSplit(p.split);
    renderer.setFit(p.fit);
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
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !loadedId) return;
    if (turntable) renderer.startTurntable();
    else renderer.stopAnimations();
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
    snapshot: async () => {
      const renderer = rendererRef.current;
      const gl = glRef.current;
      if (!renderer || !gl) return null;
      const before = renderer.currentView;
      const mode = latest.current.compareMode;
      renderer.setCompareMode('off');
      renderer.focus({ yaw: 18, pitch: 4, zoom: 1.05 }, 0);
      renderer.renderNow();
      try {
        return await snapshotToDataUrl(gl);
      } finally {
        renderer.setCompareMode(mode);
        renderer.setView(before);
      }
    },
  }));

  const orbit = Gesture.Pan()
    .runOnJS(true)
    .enabled(interactive)
    .minDistance(2)
    .onBegin(() => {
      lastPan.current = { x: 0, y: 0 };
      rendererRef.current?.beginDrag();
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
    .hitSlop({ horizontal: 22 })
    .onBegin(() => {
      splitStart.current = latest.current.split;
    })
    .onUpdate((e) => {
      if (size.width) setSplit(Math.min(0.95, Math.max(0.05, splitStart.current + e.translationX / size.width)));
    });

  const loading = !!face && loadedId !== face.id && !error;

  return (
    <View
      style={[styles.container, style]}
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
          <View pointerEvents="none" style={[styles.compareLabel, { left: 14, top: compareLabelsTop }]}>
            <Text style={styles.compareLabelText}>{compareLabels[0]}</Text>
          </View>
          <View pointerEvents="none" style={[styles.compareLabel, { right: 14, top: compareLabelsTop }]}>
            <Text style={styles.compareLabelText}>{compareLabels[1]}</Text>
          </View>
          <GestureDetector gesture={divider}>
            <View style={[styles.divider, { left: split * size.width - 22 }]}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerKnob}>
                <Text style={styles.dividerArrows}>‹ ›</Text>
              </View>
            </View>
          </GestureDetector>
        </>
      )}

      {compareMode === 'sideBySide' && (
        <>
          <View pointerEvents="none" style={[styles.compareLabel, { left: 14, top: compareLabelsTop }]}>
            <Text style={styles.compareLabelText}>{compareLabels[0]}</Text>
          </View>
          <View pointerEvents="none" style={[styles.compareLabel, { left: size.width / 2 + 14, top: compareLabelsTop }]}>
            <Text style={styles.compareLabelText}>{compareLabels[1]}</Text>
          </View>
          <View pointerEvents="none" style={[styles.sideDivider, { left: size.width / 2 - 0.5 }]} />
        </>
      )}

      {(loading || !face) && (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color={colors.stageText} />
          <Text style={styles.overlayText}>3D 얼굴을 불러오는 중</Text>
        </View>
      )}
      {error && (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.overlayText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.stage, overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  overlayText: { color: colors.stageMuted, fontSize: 13 },
  compareLabel: {
    position: 'absolute',
    top: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(20,16,18,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  compareLabelText: { color: colors.stageText, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  divider: { position: 'absolute', top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  dividerKnob: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dividerArrows: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: -2 },
  sideDivider: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
});
