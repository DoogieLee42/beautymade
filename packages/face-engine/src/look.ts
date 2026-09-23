import { CATEGORIES, CONTROL_BY_ID, CONTROLS, isControlId, type CategoryId, type ControlId } from './controls';
import { clamp } from './math';
import { PRESETS, type ControlValues, type Preset } from './presets';

/**
 * Version of the control definitions. Saved looks store it so a look can be
 * re-rendered (or migrated) exactly as it was created.
 */
export const FACE_ENGINE_VERSION = 1;

export interface LookParams {
  engineVersion: number;
  values: ControlValues;
  presetId?: string | null;
}

export function emptyLookParams(): LookParams {
  return { engineVersion: FACE_ENGINE_VERSION, values: {}, presetId: null };
}

export function clampControlValue(id: ControlId, value: number): number {
  const control = CONTROL_BY_ID[id];
  return Math.round(clamp(value, control.min, control.max) * 100) / 100;
}

/** Drops unknown ids, non-finite and zero values, and clamps to each control's range. */
export function sanitizeValues(values: Record<string, unknown> | null | undefined): ControlValues {
  const out: ControlValues = {};
  if (!values) return out;
  for (const [id, raw] of Object.entries(values)) {
    if (!isControlId(id) || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const v = clampControlValue(id, raw);
    if (v !== 0) out[id] = v;
  }
  return out;
}

export function isNeutral(values: ControlValues): boolean {
  return Object.values(values).every((v) => !v);
}

/** Sets the preset's controls (scaled by intensity) and keeps every other adjustment. */
export function applyPreset(current: ControlValues, preset: Preset, intensity = 1): ControlValues {
  const next: ControlValues = { ...current };
  for (const [id, v] of Object.entries(preset.values) as [ControlId, number][]) {
    next[id] = clampControlValue(id, v * intensity);
  }
  return sanitizeValues(next);
}

export function isPresetActive(values: ControlValues, preset: Preset): boolean {
  return (Object.entries(preset.values) as [ControlId, number][]).every(
    ([id, v]) => Math.abs((values[id] ?? 0) - v) < 0.005,
  );
}

export function activePresets(values: ControlValues): Preset[] {
  return PRESETS.filter((p) => isPresetActive(values, p));
}

/** Linear blend between two sets of values, used to animate preset changes. */
export function interpolateValues(from: ControlValues, to: ControlValues, t: number): ControlValues {
  const out: ControlValues = {};
  const ids = new Set([...Object.keys(from), ...Object.keys(to)] as ControlId[]);
  for (const id of ids) {
    const a = from[id] ?? 0;
    const b = to[id] ?? 0;
    out[id] = a + (b - a) * t;
  }
  return out;
}

/** "+40", "-25", "0" (slider value shown as a percentage). */
export function formatValue(value: number): string {
  const pct = Math.round(value * 100);
  if (pct === 0) return '0';
  return pct > 0 ? `+${pct}` : `${pct}`;
}

export interface ChangeSummary {
  id: ControlId;
  label: string;
  value: number;
  text: string;
}

/** Largest adjustments first, in catalogue order for ties. */
export function summarizeChanges(values: ControlValues, limit = Infinity): ChangeSummary[] {
  return CONTROLS.filter((c) => Math.abs(values[c.id] ?? 0) >= 0.005)
    .map((c) => ({ id: c.id, label: c.label, value: values[c.id] ?? 0, text: `${c.label} ${formatValue(values[c.id] ?? 0)}` }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

export function describeLook(values: ControlValues, limit = 3): string {
  const changes = summarizeChanges(values, limit);
  return changes.length ? changes.map((c) => c.text).join(' · ') : '변경 없음';
}

/** Slider readout used in the studio: "0.2", "-0.1", "0". */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? '0' : rounded.toFixed(1);
}

/** Categories a look changes, in display order (e.g. for "코 / 턱/윤곽" captions and filters). */
export function lookCategories(values: ControlValues): CategoryId[] {
  const touched = new Set(
    CONTROLS.filter((c) => Math.abs(values[c.id] ?? 0) >= 0.005).map((c) => c.category),
  );
  return CATEGORIES.map((c) => c.id).filter((id) => touched.has(id));
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Short nouns for look names ("갸름형 윤곽", "도톰형 입술"). */
const LOOK_NOUN: Record<CategoryId, string> = { nose: '코', contour: '윤곽', lips: '입술', skin: '피부', lifting: '리프팅' };

/** Default name for a new look: an active preset's name, else the dominant change. */
export function suggestLookName(values: ControlValues): string {
  const preset = activePresets(values)[0];
  if (preset) {
    const noun = LOOK_NOUN[preset.category];
    return preset.name.includes(noun) ? preset.name : `${preset.name} ${noun}`;
  }
  const top = summarizeChanges(values, 2);
  if (!top.length) return '원본';
  return top.map((c) => c.label.replace(/\s*\(.*\)$/, '')).join(' + ');
}
