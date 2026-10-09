import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii } from '../theme';

/**
 * Standard secondary / outline action button.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {() => void} props.onPress
 * @param {boolean} [props.disabled]
 * @param {string} [props.accessibilityLabel]
 * @param {Object} [props.style]
 */
export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
    >
      <Text style={[styles.text, disabled && styles.textDisabled]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  buttonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  text: {
    ...typography.button,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  textDisabled: {
    color: colors.textSubtle,
  },
});
