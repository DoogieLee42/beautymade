import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';

import type { CaptureView } from '../../api/types';

export type GuideState = 'idle' | 'busy' | 'ok' | 'bad';

const STROKE: Record<GuideState, string> = {
  idle: '#FFFFFF',
  busy: 'rgba(255,255,255,0.6)',
  ok: '#4ADE80',
  bad: '#FF6B6B',
};

/** Oval face frame with crosshair guides. For side views the vertical guide marks the nose. */
export function FaceGuide({ view, state }: { view: CaptureView; state: GuideState }) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const measure = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)} />
  );
  if (!width || !height) return measure;
  const rx = Math.min(width * 0.34, height * 0.25);
  const ry = rx * 1.36;
  const cx = width / 2;
  const cy = height * 0.47;
  // The preview is a mirror: turning your head left moves your nose to the screen's left.
  const dir = view === 'left' ? -1 : view === 'right' ? 1 : 0;
  const noseX = cx + dir * rx * 0.45;
  const eyeY = cy - ry * 0.12;
  const dash = '5 6';
  const guide = 'rgba(255,255,255,0.55)';
  const arrowX = cx + dir * (rx + 26);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Svg width={width} height={height}>
        <Line x1={noseX} y1={cy - ry - 34} x2={noseX} y2={cy + ry + 44} stroke={guide} strokeWidth={1} strokeDasharray={dash} />
        <Line x1={cx - rx - 42} y1={eyeY} x2={cx + rx + 42} y2={eyeY} stroke={guide} strokeWidth={1} strokeDasharray={dash} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={STROKE[state]} strokeWidth={2.5} fill="none" />
        {dir !== 0 && (
          <Path
            d={`M${arrowX - dir * 12},${cy - 14} L${arrowX + dir * 2},${cy} L${arrowX - dir * 12},${cy + 14}`}
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </Svg>
    </View>
  );
}
