import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, shadows } from '../theme';
import { ScoreBadge } from './ScoreBadge';

/**
 * HospitalCard — displays hospital emergency facility details with clear visual hierarchy.
 *
 * @param {Object} props
 * @param {import('../types/hospital').Hospital} props.hospital
 * @param {boolean} props.isSelected
 * @param {() => void} props.onSelect
 */
export function HospitalCard({ hospital, isSelected, onSelect }) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        shadows.card,
      ]}
      onPress={onSelect}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${hospital.name}, ${hospital.distanceKm} kilometers away, ${hospital.etaMinutes} travel time`}
    >
      {/* ── Top Row: Name & Rating ──────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.name} numberOfLines={1}>
            {hospital.name}
          </Text>
          <Text style={styles.emergencyType} numberOfLines={1}>
            {hospital.emergencyType}
          </Text>
        </View>

        <View style={styles.ratingBadge}>
          <Text style={styles.ratingStar}>★</Text>
          <Text style={styles.ratingText}>{hospital.rating.toFixed(1)}</Text>
        </View>
      </View>

      {/* ── Metric Row: Distance, ETA, Bed Availability ─────────────── */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricPrimary}>
            {hospital.distanceKm} km
          </Text>
          <Text style={styles.metricSecondary}>· ~{hospital.etaMinutes}</Text>
        </View>

        <View style={styles.bedsItem}>
          <View style={styles.bedDot} />
          <Text style={styles.bedText}>{hospital.availableBeds} beds available</Text>
        </View>
      </View>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Bottom Row: Match Score & Action ────────────────────────── */}
      <View style={styles.bottomRow}>
        <View style={styles.scoreArea}>
          <ScoreBadge score={hospital.score} />
          <Text style={styles.specialtySnippet} numberOfLines={1}>
            {hospital.specialties?.slice(0, 2).join(' · ')}
          </Text>
        </View>

        <View
          style={[
            styles.actionButton,
            isSelected && styles.actionButtonSelected,
          ]}
        >
          <Text
            style={[
              styles.actionButtonText,
              isSelected && styles.actionButtonTextSelected,
            ]}
          >
            {isSelected ? 'Selected ✓' : 'Select'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  cardSelected: {
    borderColor: colors.borderSelected,
    borderWidth: 1.5,
    backgroundColor: '#FAFDFE',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
  },
  name: {
    ...typography.heading,
    color: colors.text,
  },
  emergencyType: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    gap: 3,
  },
  ratingStar: {
    fontSize: 11,
    color: '#D97706',
  },
  ratingText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.xs + 2,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricPrimary: {
    ...typography.subheading,
    fontWeight: '700',
    color: colors.text,
  },
  metricSecondary: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  bedsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  bedText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  scoreArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  specialtySnippet: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actionButtonTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
});
