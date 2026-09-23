import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';

import type { CaptureView } from '../../api/types';

export type GuideState = 'idle' | 'busy' | 'ok' | 'bad';

const STROKE: Record<GuideState, string> = {
  idle: 'rgba(255,255,255,0.95)',
  busy: '#FF7AA0',
  ok: '#4ADE9A',
  bad: '#FF6B6B',
};

/**
 * Oval face guide over the (mirrored) selfie preview. The outside is dimmed; for side
 * views an arrow shows which way to turn and a dashed line marks where the nose goes.
 */
export function FaceGuide({
  width,
  height,
  view,
  state,
}: {
  width: number;
  height: number;
  view: CaptureView;
  state: GuideState;
}) {
  if (!width || !height) return null;
  const rx = Math.min(width * 0.36, height * 0.26);
  const ry = rx * 1.3;
  const cx = width / 2;
  const cy = height * 0.43;
  // The preview is a mirror: turning your head left moves your nose to the screen's left.
  const dir = view === 'left' ? -1 : view === 'right' ? 1 : 0;
  const hole = `M0,0 H${width} V${height} H0 Z M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
  const arrowX = cx + dir * (rx + 30);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Path d={hole} fill="rgba(12,9,11,0.62)" fillRule="evenodd" />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={STROKE[state]} strokeWidth={3} fill="none" />
        {dir !== 0 && (
          <>
            <Line
              x1={cx + dir * rx * 0.42}
              y1={cy - ry * 0.55}
              x2={cx + dir * rx * 0.42}
              y2={cy + ry * 0.35}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth={2}
              strokeDasharray="6 7"
            />
            <Path
              d={`M${arrowX - dir * 16},${cy - 16} L${arrowX + dir * 2},${cy} L${arrowX - dir * 16},${cy + 16}`}
              stroke="#FF7AA0"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
      </Svg>
    </View>
  );
}
