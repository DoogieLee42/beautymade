import { formatValue } from '@beautymade/face-engine';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '../../theme';

interface ValueSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  onChange(value: number): void;
  onStart?(): void;
  onEnd?(value: number): void;
  testID?: string;
}

const THUMB = 26;
const DETENT = 0.035;

function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

/**
 * Slider for beauty controls. Bipolar ranges (-1..1) fill from the centre, with a soft
 * detent and a haptic tick at zero; tapping the value badge resets it.
 */
export function ValueSlider({ label, value, min, max, minLabel, maxLabel, onChange, onStart, onEnd, testID }: ValueSliderProps) {
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

  const pos = ((value - min) / range) * width;
  const zero = ((0 - min) / range) * width;
  const fillLeft = bipolar ? Math.min(pos, zero) : 0;
  const fillWidth = bipolar ? Math.abs(pos - zero) : pos;
  const changed = value !== 0;

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 초기화`}
          disabled={!changed}
          onPress={() => {
            last.current = 0;
            onStart?.();
            onChange(0);
            onEnd?.(0);
          }}
          style={[styles.badge, changed && styles.badgeActive]}
        >
          <Text style={[styles.badgeText, changed && styles.badgeTextActive]}>{formatValue(value)}</Text>
        </Pressable>
      </View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
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
          {bipolar && <View style={[styles.centerTick, { left: zero - 1 }]} />}
          <View style={[styles.fill, { left: fillLeft, width: fillWidth }]} />
          {width > 0 && <View style={[styles.thumb, { left: pos - THUMB / 2 }]} />}
        </View>
      </GestureDetector>
      {(minLabel || maxLabel) && (
        <View style={styles.ends}>
          <Text style={styles.endText}>{minLabel}</Text>
          <Text style={styles.endText}>{maxLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink, letterSpacing: -0.2 },
  badge: { minWidth: 44, paddingHorizontal: 8, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  badgeActive: { backgroundColor: colors.primarySoft },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'] },
  badgeTextActive: { color: colors.primaryInk },
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line },
  centerTick: { position: 'absolute', width: 2, height: 12, borderRadius: 1, backgroundColor: '#D6CDCA', top: 14 },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.primary, top: 18 },
  thumb: {
    position: 'absolute',
    top: (40 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    boxShadow: '0px 2px 8px rgba(42, 26, 32, 0.22)',
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  endText: { fontSize: 11, color: colors.muted },
});
