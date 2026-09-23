import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius } from '../../theme';

export function TextField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          { borderColor: error ? colors.danger : focused ? colors.ink : colors.line },
          style,
        ]}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 12, color: colors.danger },
});
