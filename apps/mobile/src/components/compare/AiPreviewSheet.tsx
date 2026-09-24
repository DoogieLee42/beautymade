import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import { Button, Segmented } from '../ui';

export type AiPreviewState =
  | { status: 'loading'; guide: string }
  | { status: 'done'; guide: string; image: string; remaining: number }
  | { status: 'error'; guide: string | null; message: string };

type Showing = 'ai' | '3d';

/** Full-screen viewer for the AI high-resolution preview of a look. */
export function AiPreviewSheet({
  state,
  onClose,
  onRetry,
  onSave,
}: {
  state: AiPreviewState | null;
  onClose(): void;
  onRetry(): void;
  onSave(): void;
}) {
  const [showing, setShowing] = useState<Showing>('ai');
  useEffect(() => {
    if (state?.status === 'loading') setShowing('ai');
  }, [state?.status]);

  const image = state?.status === 'done' && showing === 'ai' ? state.image : state?.guide;
  return (
    <Modal visible={!!state} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="닫기" testID="ai-close">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>AI 고화질</Text>
          <Pressable
            onPress={onSave}
            hitSlop={12}
            disabled={state?.status !== 'done'}
            style={{ opacity: state?.status === 'done' ? 1 : 0.3 }}
            accessibilityLabel="이미지 저장"
          >
            <Ionicons name="download-outline" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.stage}>
          {image ? <Image source={{ uri: image }} style={styles.image} contentFit="contain" transition={250} /> : null}
          {state?.status === 'loading' && (
            <View style={styles.overlay}>
              <ActivityIndicator color="#FFFFFF" size="large" />
              <Text style={styles.overlayTitle}>AI가 사진처럼 만들고 있어요</Text>
              <Text style={styles.overlayText}>보통 10~30초 걸려요</Text>
            </View>
          )}
          {state?.status === 'error' && (
            <View style={styles.overlay}>
              <Ionicons name="alert-circle-outline" size={34} color="#FFFFFF" />
              <Text style={styles.overlayTitle}>{state.message}</Text>
              <Button title="다시 시도" variant="white" size="md" onPress={onRetry} style={{ marginTop: 8, paddingHorizontal: 24 }} />
            </View>
          )}
        </View>

        <View style={styles.footer}>
          {state?.status === 'done' && (
            <Segmented<Showing>
              tone="dark"
              options={[
                { value: 'ai', label: 'AI 사진' },
                { value: '3d', label: '3D 미리보기' },
              ]}
              value={showing}
              onChange={setShowing}
              style={{ alignSelf: 'center' }}
            />
          )}
          <Text style={styles.note}>AI가 만든 참고용 이미지예요. 실제 시술 결과와 다를 수 있어요.</Text>
          {state?.status === 'done' && <Text style={styles.remaining}>오늘 {state.remaining}번 더 만들 수 있어요</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0C' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  stage: { flex: 1, marginHorizontal: 16, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.stage },
  image: { ...StyleSheet.absoluteFill },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(10,10,10,0.55)',
  },
  overlayTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  overlayText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 10 },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' },
  remaining: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', marginTop: -4 },
});
