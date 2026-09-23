import { formatDecimal } from '@beautymade/face-engine';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '../../theme';

interface ValueSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  onStart?(): void;
  onEnd?(value: number): void;
  testID?: string;
}

const THUMB = 18;
const DETENT = 0.035;

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

/**
 * Compact slider row: label, track, value. Bipolar ranges (-1..1) fill from the centre
 * with a soft detent and haptic tick at zero; double-tap resets.
 */
export function ValueSlider({ label, value, min, max, onChange, onStart, onEnd, testID }: ValueSliderProps) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  const bipolar = min < 0;
  const range = max - min;

  const toValue = (x: number) => {
    const raw = min + Math.min(1, Math.max(0, x / Math.max(width, 1))) * range;
    const snapped = Math.abs(raw) < DETENT ? 0 : raw;
    return Math.round(snapped * 100) / 100;
  };

  const emit = (v: number) => {
    if (v === last.current) return;
    if ((last.current !== 0 && v === 0) || Math.sign(last.current) * Math.sign(v) < 0) tick();
    last.current = v;
    onChange(v);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      last.current = value;
      onStart?.();
      emit(toValue(e.x));
    })
    .onUpdate((e) => emit(toValue(e.x)))
    .onEnd(() => onEnd?.(last.current));

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      last.current = value;
      onStart?.();
      emit(toValue(e.x));
      onEnd?.(last.current);
    });

  const reset = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      last.current = 0;
      onStart?.();
      onChange(0);
      onEnd?.(0);
    });

  const pos = ((value - min) / range) * width;
  const zero = ((0 - min) / range) * width;
  const fillLeft = bipolar ? Math.min(pos, zero) : 0;
  const fillWidth = bipolar ? Math.abs(pos - zero) : pos;

  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <GestureDetector gesture={Gesture.Exclusive(reset, pan, tap)}>
        <View
          style={styles.hit}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: min * 100, max: max * 100, now: Math.round(value * 100) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const step = e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1;
            onChange(Math.round(Math.min(max, Math.max(min, value + step)) * 100) / 100);
          }}
        >
          <View style={styles.track} />
          {bipolar && <View style={[styles.centerTick, { left: zero - 0.5 }]} />}
          <View style={[styles.fill, { left: fillLeft, width: fillWidth }]} />
          {width > 0 && <View style={[styles.thumb, { left: pos - THUMB / 2 }]} />}
        </View>
      </GestureDetector>
      <Text style={[styles.value, value !== 0 && styles.valueOn]}>{formatDecimal(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { width: 58, fontSize: 14, color: colors.inkSoft, fontWeight: '500' },
  hit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: '#E6E6E9' },
  centerTick: { position: 'absolute', width: 1, height: 9, top: 13.5, backgroundColor: '#C9C9CF' },
  fill: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.ink, top: 16.5 },
  thumb: {
    position: 'absolute',
    top: (36 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.28)',
  },
  value: { width: 36, textAlign: 'right', fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] },
  valueOn: { color: colors.ink, fontWeight: '600' },
});
