import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii } from '../theme';

/**
 * ScoreBadge — displays hospital suitability / triage match score cleanly.
 *
 * @param {Object} props
 * @param {number} props.score - 0 to 100
 * @param {boolean} [props.compact]
 */
export function ScoreBadge({ score, compact = false }) {
  // Calm, trustworthy color scale
  const isHighMatch = score >= 90;
  const badgeColor = isHighMatch ? colors.success : colors.accent;
  const badgeBg = isHighMatch ? colors.successBg : colors.accentMuted;

  return (
    <View style={[styles.container, { backgroundColor: badgeBg }]}>
      <Text style={[styles.scoreValue, { color: badgeColor }]}>{score}%</Text>
      {!compact && <Text style={[styles.scoreLabel, { color: badgeColor }]}>MATCH</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  scoreValue: {
    ...typography.label,
    fontWeight: '700',
  },
  scoreLabel: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
