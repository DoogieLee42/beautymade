import { describe, expect, it } from 'vitest';

import {
  CONTROL_BY_ID,
  PRESETS,
  PRESET_BY_ID,
  applyPreset,
  describeLook,
  formatValue,
  interpolateValues,
  isNeutral,
  isPresetActive,
  sanitizeValues,
  suggestLookName,
  summarizeChanges,
} from '../src';

describe('presets', () => {
  it('only reference known controls with in-range values', () => {
    for (const preset of PRESETS) {
      for (const [id, v] of Object.entries(preset.values)) {
        const control = CONTROL_BY_ID[id as keyof typeof CONTROL_BY_ID];
        expect(control, `${preset.id}.${id}`).toBeDefined();
        expect(v).toBeGreaterThanOrEqual(control.min);
        expect(v).toBeLessThanOrEqual(control.max);
      }
    }
  });

  it('merges into existing adjustments and reports as active', () => {
    const vline = PRESET_BY_ID['v-line'];
    const values = applyPreset({ skinGlow: 0.4 }, vline);
    expect(values.skinGlow).toBe(0.4);
    expect(values.jawline).toBe(0.75);
    expect(isPresetActive(values, vline)).toBe(true);
    expect(isPresetActive({ ...values, jawline: 0.5 }, vline)).toBe(false);
  });

  it('scales with intensity', () => {
    const values = applyPreset({}, PRESET_BY_ID['natural-nose'], 0.5);
    expect(values.noseBridge).toBe(0.25);
  });
});

describe('look values', () => {
  it('sanitizes unknown, invalid and out-of-range values', () => {
    expect(
      sanitizeValues({ noseBridge: 3, lift: -1, bogus: 1, noseTip: Number.NaN, chinLength: 0, skinTone: 0.123456 }),
    ).toEqual({ noseBridge: 1, skinTone: 0.12 });
  });

  it('detects neutral looks', () => {
    expect(isNeutral({})).toBe(true);
    expect(isNeutral({ noseTip: 0 })).toBe(true);
    expect(isNeutral({ noseTip: 0.1 })).toBe(false);
  });

  it('interpolates between value sets', () => {
    expect(interpolateValues({ noseTip: 0.2 }, { lift: 1 }, 0.5)).toEqual({ noseTip: 0.1, lift: 0.5 });
  });

  it('formats and summarizes changes', () => {
    expect(formatValue(0.4)).toBe('+40');
    expect(formatValue(-0.25)).toBe('-25');
    expect(formatValue(0.001)).toBe('0');
    const summary = summarizeChanges({ noseTip: 0.2, jawline: -0.6, lift: 0.4 }, 2);
    expect(summary.map((s) => s.id)).toEqual(['jawline', 'lift']);
    expect(describeLook({ noseTip: 0.2 })).toBe('코끝 높이 +20');
    expect(describeLook({})).toBe('변경 없음');
  });

  it('suggests a name from presets or dominant changes', () => {
    expect(suggestLookName(PRESET_BY_ID['glass-skin'].values)).toBe('물광 피부');
    expect(suggestLookName({ jawline: 0.3, noseTip: 0.5 })).toBe('코끝 높이 + 턱선');
    expect(suggestLookName({})).toBe('원본');
  });
});
