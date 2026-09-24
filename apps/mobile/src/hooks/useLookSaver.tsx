import {
  FACE_ENGINE_VERSION,
  activePresets,
  lookCategories,
  sanitizeValues,
  suggestLookName,
  type ControlValues,
} from '@beautymade/face-engine';
import { router } from 'expo-router';
import { useState, type RefObject } from 'react';

import type { FaceModel, Look } from '../api/types';
import { SaveLookSheet } from '../components/studio/SaveLookSheet';
import { toast } from '../components/ui';
import { defaultLookLabel } from '../lib/format';
import { useSession } from '../state/session';
import { useStudio } from '../state/studio';
import type { FaceViewHandle } from '../three/FaceView';
import { errorMessage, useCreateLook, useLooks, useUpdateLook } from './queries';

/**
 * Save flow shared by the studio and the compare screen: guards the sample face, renders
 * a thumbnail from the live 3D view, creates or updates the look and returns the sheet.
 */
export function useLookSaver({
  faceRef,
  face,
  values,
  onSaved,
}: {
  faceRef: RefObject<FaceViewHandle | null>;
  face: FaceModel | null;
  values: ControlValues;
  onSaved?: (look: Look, mode: 'new' | 'update') => void;
}) {
  const [visible, setVisible] = useState(false);
  const apiMode = useSession((s) => s.apiMode);
  const look = useStudio((s) => s.look);
  const looks = useLooks();
  const createLook = useCreateLook();
  const updateLook = useUpdateLook();

  const open = () => {
    if (!face) return;
    if (face.isDemo && apiMode === 'remote') {
      toast('샘플 얼굴은 저장할 수 없어요. 내 얼굴을 스캔해보세요.', {
        action: { label: '스캔하기', onPress: () => router.push('/scan') },
      });
      return;
    }
    setVisible(true);
  };

  const save = async (name: string, mode: 'new' | 'update') => {
    if (!face) return;
    try {
      const thumbnail = (await faceRef.current?.snapshot(values).catch(() => null)) ?? null;
      const clean = sanitizeValues(values);
      const presetId = activePresets(clean)[0]?.id ?? null;
      const saved =
        mode === 'update' && look
          ? await updateLook.mutateAsync({ id: look.id, patch: { name, values: clean, presetId, thumbnail } })
          : await createLook.mutateAsync({
              name,
              faceModelId: face.id,
              values: clean,
              presetId,
              engineVersion: FACE_ENGINE_VERSION,
              thumbnail,
            });
      useStudio.getState().markSaved(saved);
      setVisible(false);
      onSaved?.(saved, mode);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  // One changed area gets a descriptive name ("갸름형 윤곽"); mixes get "Look 03".
  const suggested = lookCategories(values).length === 1 ? suggestLookName(values) : '원본';
  const sheet = (
    <SaveLookSheet
      visible={visible}
      values={values}
      suggestedName={suggested === '원본' ? defaultLookLabel((looks.data?.length ?? 0) + 1) : suggested}
      editingName={look?.name}
      saving={createLook.isPending || updateLook.isPending}
      onSave={save}
      onClose={() => setVisible(false)}
    />
  );

  return { open, sheet };
}
