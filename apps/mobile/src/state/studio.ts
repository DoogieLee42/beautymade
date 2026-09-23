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

const HISTORY_LIMIT = 60;

interface StudioState {
  values: ControlValues;
  /** Values the current session started from (a loaded look or the original face). */
  baseline: ControlValues;
  /** The saved look being edited, if any. */
  look: Pick<Look, 'id' | 'name' | 'faceModelId'> | null;
  tab: CategoryId;
  autoFocus: boolean;
  mirrored: boolean;
  /** Undo / redo stacks of whole value sets. */
  past: ControlValues[];
  future: ControlValues[];
  /** Values when the current gesture or animation began (see beginEdit). */
  editStart: ControlValues | null;

  setValue(id: ControlId, value: number): void;
  setValues(values: ControlValues): void;
  /** Starts an undoable edit (slider drag, preset animation). */
  beginEdit(): void;
  /** Records the edit started by beginEdit, if it changed anything. */
  endEdit(): void;
  undo(): void;
  redo(): void;
  applyPreset(preset: Preset): void;
  resetCategory(category: CategoryId): void;
  loadLook(look: Look): void;
  startFresh(values?: ControlValues): void;
  markSaved(look: Pick<Look, 'id' | 'name' | 'faceModelId' | 'values'>): void;
  setTab(tab: CategoryId): void;
  toggleAutoFocus(): void;
  toggleMirrored(): void;
}

const cleanSession = { past: [], future: [], editStart: null };

export const useStudio = create<StudioState>((set, get) => ({
  values: {},
  baseline: {},
  look: null,
  tab: 'nose',
  autoFocus: true,
  mirrored: true,
  ...cleanSession,

  setValue: (id, value) => set((s) => ({ values: { ...s.values, [id]: value } })),

  setValues: (values) => set({ values }),

  beginEdit: () => {
    if (!get().editStart) set({ editStart: get().values });
  },

  endEdit: () =>
    set((s) => {
      if (!s.editStart) return {};
      if (sameValues(s.editStart, s.values)) return { editStart: null };
      return { past: [...s.past, s.editStart].slice(-HISTORY_LIMIT), future: [], editStart: null };
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return { values: prev, past: s.past.slice(0, -1), future: [...s.future, s.values], editStart: null };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[s.future.length - 1];
      if (!next) return {};
      return { values: next, future: s.future.slice(0, -1), past: [...s.past, s.values], editStart: null };
    }),

  applyPreset: (preset) => {
    get().beginEdit();
    set((s) => ({ values: applyPreset(s.values, preset), tab: preset.category }));
    get().endEdit();
  },

  resetCategory: (category) => {
    get().beginEdit();
    set((s) => {
      const next = { ...s.values };
      for (const c of controlsInCategory(category)) delete next[c.id];
      return { values: next };
    });
    get().endEdit();
  },

  loadLook: (look) =>
    set({
      values: sanitizeValues(look.values),
      baseline: sanitizeValues(look.values),
      look: { id: look.id, name: look.name, faceModelId: look.faceModelId },
      ...cleanSession,
    }),

  startFresh: (values = {}) => set({ values, baseline: {}, look: null, ...cleanSession }),

  markSaved: (look) =>
    set({ look: { id: look.id, name: look.name, faceModelId: look.faceModelId }, baseline: sanitizeValues(look.values) }),

  setTab: (tab) => set({ tab }),
  toggleAutoFocus: () => set({ autoFocus: !get().autoFocus }),
  toggleMirrored: () => set({ mirrored: !get().mirrored }),
}));

export function sameValues(a: ControlValues, b: ControlValues): boolean {
  const x = sanitizeValues(a);
  const y = sanitizeValues(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]) as Set<ControlId>;
  for (const k of keys) if ((x[k] ?? 0) !== (y[k] ?? 0)) return false;
  return true;
}

export function isDirty(values: ControlValues, baseline: ControlValues): boolean {
  return !sameValues(values, baseline);
}
