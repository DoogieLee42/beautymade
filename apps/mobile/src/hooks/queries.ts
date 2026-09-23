import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, getApi, type FaceModel, type Look, type LookPatch, type NewLook } from '../api';
import { useSession } from '../state/session';
import { DEMO_FACE } from '../three/demoFace';

export const keys = {
  me: ['me'] as const,
  currentFace: ['face', 'current'] as const,
  face: (id: string) => ['face', id] as const,
  looks: ['looks'] as const,
  look: (id: string) => ['looks', id] as const,
};

/** Scopes cached data to the signed-in account and backend. */
function useScope() {
  const token = useSession((s) => s.token);
  const mode = useSession((s) => s.apiMode);
  return { enabled: !!token, scope: `${mode}:${token?.slice(-12) ?? ''}` };
}

export function useMe() {
  const { enabled, scope } = useScope();
  return useQuery({ queryKey: [...keys.me, scope], queryFn: () => getApi().me(), enabled });
}

/** The user's latest scanned face, or null before the first scan. */
export function useCurrentFace() {
  const { enabled, scope } = useScope();
  return useQuery({
    queryKey: [...keys.currentFace, scope],
    queryFn: () => getApi().getCurrentFaceModel(),
    enabled,
    staleTime: 60_000,
  });
}

/** The face to show in the studio: the user's own, or the sample face before scanning. */
export function useStudioFace(): { face: FaceModel | null; isDemo: boolean; loading: boolean } {
  const current = useCurrentFace();
  if (current.isLoading) return { face: null, isDemo: false, loading: true };
  const face = current.data ?? DEMO_FACE;
  return { face, isDemo: !!face.isDemo, loading: false };
}

export function useFace(id: string | null | undefined) {
  const { enabled, scope } = useScope();
  return useQuery({
    queryKey: [...keys.face(id ?? ''), scope],
    queryFn: () => (id === DEMO_FACE.id ? Promise.resolve(DEMO_FACE) : getApi().getFaceModel(id!)),
    enabled: enabled && !!id,
    staleTime: 5 * 60_000,
  });
}

export function useLooks() {
  const { enabled, scope } = useScope();
  return useQuery({ queryKey: [...keys.looks, scope], queryFn: () => getApi().listLooks(), enabled });
}

export function useLook(id: string | undefined) {
  const { enabled, scope } = useScope();
  const client = useQueryClient();
  return useQuery({
    queryKey: [...keys.look(id ?? ''), scope],
    queryFn: () => getApi().getLook(id!),
    enabled: enabled && !!id,
    initialData: () =>
      client.getQueryData<Look[]>([...keys.looks, scope])?.find((l) => l.id === id),
  });
}

function useInvalidateLooks() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: keys.looks });
    client.invalidateQueries({ queryKey: keys.me });
  };
}

export function useCreateLook() {
  const invalidate = useInvalidateLooks();
  return useMutation({ mutationFn: (input: NewLook) => getApi().createLook(input), onSuccess: invalidate });
}

export function useUpdateLook() {
  const invalidate = useInvalidateLooks();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LookPatch }) => getApi().updateLook(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteLook() {
  const invalidate = useInvalidateLooks();
  return useMutation({ mutationFn: (id: string) => getApi().deleteLook(id), onSuccess: invalidate });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return '문제가 생겼어요. 잠시 후 다시 시도해주세요.';
}
