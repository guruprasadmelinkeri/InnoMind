import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii } from '../theme';

/**
 * Clean status indicator pill with semantic coloring.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {'success' | 'warning' | 'error' | 'neutral' | 'accent'} [props.variant]
 * @param {boolean} [props.showDot]
 */
export function StatusBadge({ label, variant = 'neutral', showDot = true }) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          bg: colors.successBg,
          text: colors.success,
          dot: colors.success,
          border: colors.successBorder,
        };
      case 'warning':
        return {
          bg: colors.warningBg,
          text: colors.warning,
          dot: colors.warning,
          border: colors.warningBorder,
        };
      case 'error':
        return {
          bg: colors.errorBg,
          text: colors.error,
          dot: colors.error,
          border: colors.errorBorder,
        };
      case 'accent':
        return {
          bg: colors.accentMuted,
          text: colors.accent,
          dot: colors.accent,
          border: '#BAE6FD',
        };
      default:
        return {
          bg: colors.surfaceSubtle,
          text: colors.textSecondary,
          dot: colors.textMuted,
          border: colors.border,
        };
    }
  };

  const current = getVariantStyles();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: current.bg, borderColor: current.border },
      ]}
    >
      {showDot && <View style={[styles.dot, { backgroundColor: current.dot }]} />}
      <Text style={[styles.text, { color: current.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
