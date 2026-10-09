import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, shadows } from '../theme';

/**
 * HospitalMap — clean modern map view for locating emergency facilities.
 *
 * @param {Object} props
 * @param {import('../types/hospital').Hospital[]} props.hospitals
 * @param {import('../types/hospital').Hospital | null} props.selectedHospital
 * @param {(hospital: import('../types/hospital').Hospital) => void} props.onSelectHospital
 * @param {{ latitude: number, longitude: number } | null} props.userLocation
 */
export function HospitalMap({ hospitals, selectedHospital, onSelectHospital, userLocation }) {
  const centerLat = userLocation?.latitude ?? 12.9716;
  const centerLon = userLocation?.longitude ?? 77.5946;

  const latSpan = 0.08;
  const lonSpan = 0.08;

  return (
    <View style={[styles.mapContainer, shadows.subtle]}>
      {/* ── Top Bar: Location & GPS telemetry ───────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.telemetryBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.telemetryLabel}>GPS DISPATCH GRID</Text>
        </View>

        <Text style={styles.coordsText}>
          {userLocation
            ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`
            : 'Center: Sector 4'}
        </Text>
      </View>

      {/* ── Cartographic Canvas ─────────────────────────────────────── */}
      <View style={styles.canvas}>
        {/* Road Grid Representation */}
        <View style={styles.roadMajorH} />
        <View style={styles.roadMajorV} />
        <View style={styles.roadMinor1} />
        <View style={styles.roadMinor2} />

        {/* Distance Range Rings (1km & 3km) */}
        <View style={[styles.rangeRing, styles.ringOuter]} />
        <View style={[styles.rangeRing, styles.ringInner]} />

        {/* User Location Pin */}
        <View style={styles.userPinContainer}>
          <View style={styles.userPulseRing} />
          <View style={styles.userDot} />
          <View style={styles.userBadge}>
            <Text style={styles.userBadgeText}>You</Text>
          </View>
        </View>

        {/* Hospital Markers */}
        {hospitals.map((hospital) => {
          const isSelected = selectedHospital?.id === hospital.id;

          const dLat = hospital.latitude - centerLat;
          const dLon = hospital.longitude - centerLon;

          const topPercent = 50 - Math.min(Math.max((dLat / latSpan) * 100, -36), 36);
          const leftPercent = 50 + Math.min(Math.max((dLon / lonSpan) * 100, -36), 36);

          return (
            <TouchableOpacity
              key={hospital.id}
              style={[
                styles.markerWrapper,
                { top: `${topPercent}%`, left: `${leftPercent}%` },
                isSelected && styles.markerWrapperSelected,
              ]}
              onPress={() => onSelectHospital(hospital)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Select ${hospital.name}`}
            >
              <View style={[styles.markerPin, isSelected && styles.markerPinSelected]}>
                <Text style={styles.pinSymbol}>🏥</Text>
                <View style={[styles.pinScore, isSelected && styles.pinScoreSelected]}>
                  <Text style={[styles.pinScoreText, isSelected && styles.pinScoreTextSelected]}>
                    {hospital.score}%
                  </Text>
                </View>
              </View>

              {/* Callout Label */}
              <View style={[styles.callout, isSelected && styles.calloutSelected]}>
                <Text style={[styles.calloutText, isSelected && styles.calloutTextSelected]} numberOfLines={1}>
                  {hospital.name.split(' ')[0]} · {hospital.distanceKm}km
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Map Footer Legend ───────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.legendItem}>
          <View style={styles.legendUserDot} />
          <Text style={styles.legendText}>Current Location</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={{ fontSize: 11 }}>🏥</Text>
          <Text style={styles.legendText}>Hospital (Tap to focus)</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendTextMuted}>Simulated GPS</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  telemetryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  telemetryLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  coordsText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
  },
  canvas: {
    height: 220,
    backgroundColor: '#F8FAFC',
    position: 'relative',
    overflow: 'hidden',
  },
  roadMajorH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '48%',
    height: 6,
    backgroundColor: '#E2E8F0',
  },
  roadMajorV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '52%',
    width: 6,
    backgroundColor: '#E2E8F0',
  },
  roadMinor1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '22%',
    height: 2,
    backgroundColor: '#F1F5F9',
  },
  roadMinor2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '26%',
    width: 2,
    backgroundColor: '#F1F5F9',
  },
  rangeRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  ringInner: {
    width: 100,
    height: 100,
    marginTop: -50,
    marginLeft: -50,
  },
  ringOuter: {
    width: 180,
    height: 180,
    marginTop: -90,
    marginLeft: -90,
  },
  userPinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -10,
    marginLeft: -10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  userPulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  userDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  userBadge: {
    position: 'absolute',
    top: -14,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  userBadgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '700',
  },
  markerWrapper: {
    position: 'absolute',
    marginLeft: -28,
    marginTop: -26,
    alignItems: 'center',
    zIndex: 20,
  },
  markerWrapperSelected: {
    zIndex: 30,
    transform: [{ scale: 1.1 }],
  },
  markerPin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 3,
    ...shadows.card,
  },
  markerPinSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pinSymbol: {
    fontSize: 11,
  },
  pinScore: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pinScoreSelected: {
    backgroundColor: '#334155',
  },
  pinScoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  pinScoreTextSelected: {
    color: colors.white,
  },
  callout: {
    marginTop: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  calloutSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  calloutText: {
    fontSize: 8,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  calloutTextSelected: {
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendUserDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  legendText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  legendTextMuted: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
  },
});
