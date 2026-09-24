import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getApi } from '../api';
import { errorMessage } from '../hooks/queries';
import { useSession } from '../state/session';
import { colors, radius } from '../theme';
import { Button, Screen, TextField } from './ui';

type Mode = 'signup' | 'login';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AuthForm({ mode }: { mode: Mode }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { apiMode, setAuth, setApiMode } = useSession();
  const queryClient = useQueryClient();
  const signup = mode === 'signup';

  const health = useQuery({
    queryKey: ['health', apiMode],
    queryFn: () => getApi().health(),
    enabled: apiMode === 'remote',
    retry: false,
    staleTime: 10_000,
  });
  const offline = apiMode === 'remote' && health.data === false;

  const validate = (): string | null => {
    if (signup && !name.trim()) return '이름을 입력해주세요.';
    if (!EMAIL.test(email.trim())) return '올바른 이메일 주소를 입력해주세요.';
    if (password.length < 8) return '비밀번호는 8자 이상이어야 해요.';
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const api = getApi();
      const result = signup
        ? await api.signup({ name: name.trim(), email: email.trim(), password })
        : await api.login({ email: email.trim(), password });
      queryClient.clear();
      await setAuth(result);
      router.replace(signup ? '/scan' : '/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.brand}>BeautyMade</Text>

        <Text style={styles.title}>{signup ? '계정을 만들어주세요' : '다시 만나서 반가워요'}</Text>
        <Text style={styles.subtitle}>
          {signup ? '스캔한 얼굴과 저장한 룩은 나만 볼 수 있어요.' : '저장해 둔 3D 얼굴과 룩을 불러올게요.'}
        </Text>

        {apiMode === 'demo' && (
          <Banner tone="info" icon="sparkles" text="데모 모드: 서버 없이 샘플 얼굴로 모든 흐름을 체험해요." />
        )}
        {offline && (
          <Banner
            tone="warn"
            icon="cloud-offline-outline"
            text="API 서버에 연결할 수 없어요. services/api를 실행하거나 데모 모드로 체험해보세요."
            action={{ label: '데모 모드로 체험', onPress: () => setApiMode('demo') }}
          />
        )}

        <View style={styles.form}>
          {signup && (
            <TextField label="이름" value={name} onChangeText={setName} placeholder="홍길동" autoComplete="name" returnKeyType="next" />
          )}
          <TextField
            label="이메일"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />
          <TextField
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            placeholder="8자 이상"
            secureTextEntry
            autoComplete={signup ? 'new-password' : 'current-password'}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Button title={signup ? '가입하고 내 얼굴 만들기' : '로그인'} onPress={submit} loading={busy} testID="auth-submit" />

        <Pressable onPress={() => router.replace(signup ? '/auth/login' : '/auth/signup')} style={styles.switch} hitSlop={8}>
          <Text style={styles.switchText}>
            {signup ? '이미 계정이 있나요? ' : '처음이신가요? '}
            <Text style={styles.switchLink}>{signup ? '로그인' : '회원가입'}</Text>
          </Text>
        </Pressable>

        <Pressable onPress={() => setApiMode(apiMode === 'demo' ? 'remote' : 'demo')} style={styles.modeSwitch} hitSlop={8}>
          <Text style={styles.modeText}>
            {apiMode === 'demo' ? '실제 서버에 연결하기' : '서버 없이 데모 모드로 둘러보기'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Banner({
  tone,
  icon,
  text,
  action,
}: {
  tone: 'info' | 'warn';
  icon: 'sparkles' | 'cloud-offline-outline';
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const warn = tone === 'warn';
  return (
    <View style={[styles.banner, { backgroundColor: warn ? colors.warningSoft : colors.surfaceAlt }]}>
      <Ionicons name={icon} size={18} color={warn ? colors.warning : colors.ink} />
      <View style={styles.flex}>
        <Text style={[styles.bannerText, { color: warn ? '#6B4309' : colors.inkSoft }]}>{text}</Text>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={6}>
            <Text style={styles.bannerAction}>{action.label} →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 32 },
  back: { width: 40, height: 44, justifyContent: 'center', marginLeft: -8, marginBottom: 12 },
  brand: { fontSize: 15, fontWeight: '700', color: colors.muted, letterSpacing: -0.2, marginBottom: 6 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, color: colors.ink },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.inkSoft, marginTop: 6 },
  form: { gap: 16, marginTop: 28, marginBottom: 24 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  switch: { alignItems: 'center', marginTop: 20 },
  switchText: { fontSize: 14, color: colors.inkSoft },
  switchLink: { color: colors.ink, fontWeight: '700', textDecorationLine: 'underline' },
  modeSwitch: { alignItems: 'center', marginTop: 28 },
  modeText: { fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  banner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, marginTop: 20, alignItems: 'flex-start' },
  bannerText: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  bannerAction: { fontSize: 13, fontWeight: '800', color: '#6B4309', marginTop: 6, textDecorationLine: 'underline' },
});
