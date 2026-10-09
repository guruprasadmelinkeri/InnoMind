import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, typography, spacing, radii, shadows } from '../theme';

/**
 * Standard primary call-to-action button.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {() => void} props.onPress
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.loading]
 * @param {'primary' | 'danger' | 'accent'} [props.variant]
 * @param {string} [props.accessibilityLabel]
 * @param {Object} [props.style]
 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  accessibilityLabel,
  style,
}) {
  const getBackgroundColor = () => {
    if (disabled) return colors.surfaceMuted;
    if (variant === 'danger') return colors.error;
    if (variant === 'accent') return colors.accent;
    return colors.primary;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: getBackgroundColor() },
        !disabled && shadows.subtle,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text
          style={[
            styles.text,
            disabled && styles.textDisabled,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  text: {
    ...typography.button,
    color: colors.textInverse,
  },
  textDisabled: {
    color: colors.textSubtle,
  },
});
