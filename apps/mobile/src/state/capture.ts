import { create } from 'zustand';

import type { CaptureView, LocalPhoto, ScanPhoto } from '../api/types';

export interface Shot {
  local: LocalPhoto;
  status: 'uploading' | 'ok' | 'rejected' | 'error';
  result?: ScanPhoto;
  error?: string;
}

interface CaptureState {
  scanId: string | null;
  shots: Partial<Record<CaptureView, Shot>>;
  begin(scanId: string): void;
  setShot(view: CaptureView, shot: Shot | undefined): void;
  reset(): void;
}

/** The capture session in progress (photos taken so far and their server-side checks). */
export const useCapture = create<CaptureState>((set) => ({
  scanId: null,
  shots: {},
  begin: (scanId) => set({ scanId, shots: {} }),
  setShot: (view, shot) => set((s) => ({ shots: { ...s.shots, [view]: shot } })),
  reset: () => set({ scanId: null, shots: {} }),
}));
