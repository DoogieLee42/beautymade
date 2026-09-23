import {
  applyPreset,
  controlsInCategory,
  sanitizeValues,
  type CategoryId,
  type ControlId,
  type ControlValues,
  type Preset,
} from '@beautymade/face-engine';
import { create } from 'zustand';

import type { Look } from '../api/types';

export type StudioTab = 'presets' | CategoryId;

interface StudioState {
  values: ControlValues;
  /** Values the current session started from (a loaded look or the original face). */
  baseline: ControlValues;
  /** The saved look being edited, if any. */
  look: Pick<Look, 'id' | 'name' | 'faceModelId'> | null;
  presetId: string | null;
  tab: StudioTab;
  autoFocus: boolean;
  mirrored: boolean;
  setValue(id: ControlId, value: number): void;
  setValues(values: ControlValues, presetId?: string | null): void;
  applyPreset(preset: Preset): void;
  resetCategory(category: CategoryId): void;
  resetAll(): void;
  loadLook(look: Look): void;
  startFresh(values?: ControlValues): void;
  markSaved(look: Pick<Look, 'id' | 'name' | 'faceModelId' | 'values'>): void;
  setTab(tab: StudioTab): void;
  toggleAutoFocus(): void;
  toggleMirrored(): void;
}

export const useStudio = create<StudioState>((set, get) => ({
  values: {},
  baseline: {},
  look: null,
  presetId: null,
  tab: 'presets',
  autoFocus: true,
  mirrored: true,

  setValue: (id, value) => set((s) => ({ values: { ...s.values, [id]: value } })),

  setValues: (values, presetId) => set((s) => ({ values, presetId: presetId === undefined ? s.presetId : presetId })),

  applyPreset: (preset) => set((s) => ({ values: applyPreset(s.values, preset), presetId: preset.id })),

  resetCategory: (category) =>
    set((s) => {
      const next = { ...s.values };
      for (const c of controlsInCategory(category)) delete next[c.id];
      return { values: next };
    }),

  resetAll: () => set({ values: {}, presetId: null }),

  loadLook: (look) =>
    set({
      values: sanitizeValues(look.values),
      baseline: sanitizeValues(look.values),
      look: { id: look.id, name: look.name, faceModelId: look.faceModelId },
      presetId: look.presetId,
    }),

  startFresh: (values = {}) => set({ values, baseline: {}, look: null, presetId: null }),

  markSaved: (look) =>
    set({ look: { id: look.id, name: look.name, faceModelId: look.faceModelId }, baseline: sanitizeValues(look.values) }),

  setTab: (tab) => set({ tab }),
  toggleAutoFocus: () => set({ autoFocus: !get().autoFocus }),
  toggleMirrored: () => set({ mirrored: !get().mirrored }),
}));

export function isDirty(values: ControlValues, baseline: ControlValues): boolean {
  const a = sanitizeValues(values);
  const b = sanitizeValues(baseline);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<ControlId>;
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return true;
  return false;
}
