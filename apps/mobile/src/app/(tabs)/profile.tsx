import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApi } from '../../api';
import { toast } from '../../components/ui';
import { errorMessage, useCurrentFace, useMe } from '../../hooks/queries';
import { confirm } from '../../lib/dialog';
import { formatDate } from '../../lib/format';
import { useSession } from '../../state/session';
import { useStudio } from '../../state/studio';
import { forgetFace } from '../../three/faceAssets';
import { colors, radius, shadow } from '../../theme';

const VIEW_LABEL: Record<string, string> = { front: '정면', left: '왼쪽', right: '오른쪽' };

/** Profile: account, face data (privacy controls) and preferences. */
export default function Profile() {
  const me = useMe();
  const face = useCurrentFace();
  const queryClient = useQueryClient();
  const { user, apiMode, signOut, setApiMode } = useSession();
  const { mirrored, autoFocus, toggleMirrored, toggleAutoFocus } = useStudio();
  const account = me.data?.user ?? user;
  const faceData = face.data;

  const deleteFace = async () => {
    if (!faceData) return;
    const ok = await confirm('얼굴 데이터 삭제', '3D 얼굴과 원본 사진, 이 얼굴로 만든 룩이 모두 삭제돼요. 되돌릴 수 없어요.', '삭제', true);
    if (!ok) return;
    try {
      await getApi().deleteFaceModel(faceData.id);
      forgetFace(faceData.id);
      useStudio.getState().startFresh();
      await queryClient.invalidateQueries();
      toast('얼굴 데이터를 삭제했어요');
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const logout = async () => {
    await signOut();
    queryClient.clear();
    useStudio.getState().startFresh();
    router.replace('/');
  };

  const deleteAccount = async () => {
    const ok = await confirm('계정 삭제', '계정과 모든 얼굴 데이터, 저장한 룩이 영구 삭제돼요.', '계정 삭제', true);
    if (!ok) return;
    try {
      await getApi().deleteAccount();
      await logout();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>프로필</Text>

        <View style={[styles.card, shadow, styles.account]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{account?.name?.slice(0, 1) ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{account?.name ?? '-'}</Text>
            <Text style={styles.muted}>{account?.email ?? ''}</Text>
          </View>
          {apiMode === 'demo' && (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>데모</Text>
            </View>
          )}
        </View>

        <Text style={styles.section}>내 얼굴 데이터</Text>
        <View style={[styles.card, shadow]}>
          {faceData ? (
            <>
              <View style={styles.faceRow}>
                {faceData.thumbnailUrl ? (
                  <Image source={{ uri: faceData.thumbnailUrl }} style={styles.faceThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.faceThumb, styles.faceThumbEmpty]}>
                    <Ionicons name="happy-outline" size={24} color={colors.stageMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.rowTitle}>{formatDate(faceData.createdAt)} 스캔</Text>
                  <Text style={styles.muted}>
                    {(faceData.quality?.viewsUsed ?? []).map((v) => VIEW_LABEL[v] ?? v).join(' · ') || '샘플 얼굴'} 사진 사용
                  </Text>
                </View>
              </View>
              <Row icon="scan-outline" label="다시 스캔하기" onPress={() => router.push('/scan')} />
              <Row icon="trash-outline" label="얼굴 데이터 삭제" danger onPress={deleteFace} last />
            </>
          ) : (
            <Row icon="scan-outline" label="아직 스캔한 얼굴이 없어요 · 스캔하기" onPress={() => router.push('/scan')} last />
          )}
        </View>
        <Text style={styles.note}>원본 사진과 3D 얼굴은 내 계정에만 저장되고, 삭제하면 서버에서도 즉시 지워져요.</Text>

        <Text style={styles.section}>Studio 설정</Text>
        <View style={[styles.card, shadow]}>
          <Row icon="swap-horizontal" label="거울 모드" hint="거울에서 보던 방향으로 보여줘요">
            <Switch value={mirrored} onValueChange={toggleMirrored} trackColor={{ true: colors.primary }} />
          </Row>
          <Row icon="locate-outline" label="부위 자동 포커스" hint="조절하는 부위로 카메라가 이동해요" last>
            <Switch value={autoFocus} onValueChange={toggleAutoFocus} trackColor={{ true: colors.primary }} />
          </Row>
        </View>

        <Text style={styles.section}>계정</Text>
        <View style={[styles.card, shadow]}>
          <Row
            icon="server-outline"
            label={apiMode === 'demo' ? '실제 서버에 연결하기' : '데모 모드로 전환'}
            hint={apiMode === 'demo' ? '지금은 기기 안에서만 동작하는 데모 모드예요' : getApi().baseUrl ?? ''}
            onPress={async () => {
              if (await confirm('모드 전환', '전환하면 로그아웃돼요. 계속할까요?')) {
                await setApiMode(apiMode === 'demo' ? 'remote' : 'demo');
                queryClient.clear();
                router.replace('/');
              }
            }}
          />
          <Row icon="log-out-outline" label="로그아웃" onPress={logout} />
          <Row icon="close-circle-outline" label="계정 삭제" danger onPress={deleteAccount} last />
        </View>

        <Text style={styles.version}>BeautyMade {Constants.expoConfig?.version ?? ''} · MVP</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  hint,
  onPress,
  danger,
  last,
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.inkSoft} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{label}</Text>
        {!!hint && (
          <Text style={styles.muted} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      {children ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, marginBottom: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primaryInk },
  accountName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  demoPill: { paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: colors.warningSoft, justifyContent: 'center' },
  demoPillText: { fontSize: 12, fontWeight: '800', color: colors.warning },
  section: { fontSize: 14, fontWeight: '800', color: colors.inkSoft, marginTop: 26, marginBottom: 10 },
  faceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  faceThumb: { width: 56, height: 56, borderRadius: 28 },
  faceThumbEmpty: { backgroundColor: colors.stageRaised, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 12, color: colors.muted },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 8, paddingHorizontal: 4 },
  version: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 32 },
});
