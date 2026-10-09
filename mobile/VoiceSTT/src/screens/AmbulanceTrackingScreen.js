import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ambulanceService } from '../services/ambulanceService';
import { StatusBadge } from '../components/StatusBadge';
import { SecondaryButton } from '../components/SecondaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { colors, typography, spacing, radii, shadows } from '../theme';

/**
 * AmbulanceTrackingScreen — displays real-time ambulance tracking and status.
 *
 * @param {Object} props
 * @param {import('../types/hospital').Hospital | null} props.selectedHospital
 * @param {{ latitude: number, longitude: number } | null} props.userLocation
 * @param {string|number} [props.ambulanceId] - ID of the ambulance to track
 * @param {() => void} [props.onBack]
 * @param {() => void} props.onReset
 */
export function AmbulanceTrackingScreen({
  selectedHospital,
  userLocation,
  ambulanceId,
  onBack,
  onReset,
}) {
  const [ambulanceData, setAmbulanceData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (ambulanceId) {
      ambulanceService
        .getAmbulanceById(ambulanceId)
        .then((data) => {
          if (isMounted) {
            setAmbulanceData(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.warn('Failed to load ambulance data:', err.message);
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [ambulanceId, selectedHospital]);

  return (
    <View style={styles.container}>
      {/* ── Top Bar: Back Action & Status ───────────────────────────── */}
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change hospital"
          >
            <Text style={styles.backButtonText}>‹ Change Hospital</Text>
          </TouchableOpacity>
        )}
        <StatusBadge label="DISPATCH CONFIRMED" variant="success" />
      </View>

      {/* ── Operational Status & ETA Block ──────────────────────────── */}
      <View style={styles.etaCard}>
        <Text style={styles.etaLabel}>AMBULANCE STATUS</Text>
        <Text style={styles.etaValue}>
          {ambulanceData?.status?.replace(/_/g, ' ').toUpperCase() || 'AVAILABLE'}
        </Text>
        <Text style={styles.etaSub}>
          {ambulanceData?.vehicle_number || 'UNKNOWN'} •
          {ambulanceData?.current_latitude && ambulanceData?.current_longitude
            ? `(${ambulanceData?.current_latitude?.toFixed(4)}, ${ambulanceData?.current_longitude?.toFixed(4)})`
            : 'Location not available'}
        </Text>
      </View>

      {/* ── Notice Banner ──────────────────────────────────── */}
      <View style={styles.noticeBanner}>
        <Text style={styles.noticeIcon}>ℹ️</Text>
        <Text style={styles.noticeText}>
          <Text style={styles.noticeBold}>Live Data:</Text> Showing real ambulance data from MediRoute backend
        </Text>
      </View>

      {/* ── Telemetry Map Area ─────────────────────────────── */}
      <View style={[styles.mapContainer, shadows.subtle]}>
        {ambulanceData?.current_latitude && ambulanceData?.current_longitude ? (
          <>
            <View style={styles.mapGridLineH} />
            <View style={styles.mapGridLineV} />
            <View style={styles.mapRadarCircle} />

            <View style={styles.mapCenterBox}>
              <View style={styles.ambulanceIconBubble}>
                <Text style={{ fontSize: 24 }}>🚑</Text>
              </View>
              <Text style={styles.mapPlaceholderTitle}>
                Ambulance Location
              </Text>
              <Text style={styles.mapPlaceholderSub}>
                Updated: {new Date(ambulanceData?.updated_at || ambulanceData?.created_at).toLocaleTimeString()}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.mapCenterBox}>
            <Text style={styles.mapPlaceholderTitle}>
              Ambulance location unavailable
            </Text>
            <Text style={styles.mapPlaceholderSub}>
              Waiting for GPS coordinates from unit...
            </Text>
          </View>
        )}
      </View>

      {/* ── Assigned Ambulance Information ──────────────────────────── */}
      <View style={[styles.infoCard, shadows.card]}>
        <SectionHeader
          title="Assigned Unit Details"
          rightAccessory={<StatusBadge
            label={ambulanceData?.status?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}
            variant={ambulanceData?.status === 'AVAILABLE' ? 'default' :
                     ambulanceData?.status === 'EN_ROUTE' ? 'primary' :
                     ambulanceData?.status === 'ARRIVED' ? 'success' : 'default'}
            showDot={false}
          />}
        />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
        ) : (
          <>
            <View style={styles.unitRow}>
              <View>
                <Text style={styles.unitId}>
                  AMB-{ambulanceData?.id?.toString().padStart(4, '0') || 'XXXX'}
                </Text>
                <Text style={styles.unitType}>
                  {ambulanceData?.vehicle_number || 'UNKNOWN VEHICLE'}
                </Text>
              </View>
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceText}>
                  {ambulanceData?.current_latitude && ambulanceData?.current_longitude
                    ? 'GPS Available'
                    : 'No GPS'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last Updated:</Text>
              <Text style={styles.infoValue}>
                {ambulanceData?.updated_at ?
                  new Date(ambulanceData?.updated_at).toLocaleString() :
                  ambulanceData?.created_at ?
                    new Date(ambulanceData?.created_at).toLocaleString() :
                    'Never'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={styles.infoValue}>
                {ambulanceData?.status?.replace(/_/g, ' ').toLowerCase() || 'unknown'}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* ── Destination Hospital Section ────────────────────────────── */}
      <View style={[styles.infoCard, shadows.card]}>
        <SectionHeader title="Designated Intake Facility" />

        <Text style={styles.hospitalName}>
          {selectedHospital?.name || 'Emergency Intake Center'}
        </Text>
        <Text style={styles.hospitalType}>
          {selectedHospital?.emergencyType || 'Level 1 Trauma Facility'}
        </Text>

        <View style={styles.hospitalMetaRow}>
          <Text style={styles.hospitalMetaItem}>
            📍 {selectedHospital?.distanceKm ?? '2.4'} km from scene
          </Text>
          <Text style={styles.hospitalMetaItem}>
            🛏️ {selectedHospital?.availableBeds ?? '12'} beds available
          </Text>
        </View>

        {selectedHospital?.address ? (
          <Text style={styles.hospitalAddress}>{selectedHospital.address}</Text>
        ) : null}
      </View>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <SecondaryButton
          title="Start New Emergency Request"
          onPress={onReset}
          accessibilityLabel="Start new emergency request"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  etaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.subtle,
  },
  etaLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  etaValue: {
    ...typography.metricLg,
    color: colors.text,
    marginVertical: spacing.xxs,
  },
  etaSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  noticeIcon: {
    fontSize: 13,
  },
  noticeText: {
    ...typography.caption,
    flex: 1,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  noticeBold: {
    fontWeight: '700',
    color: colors.text,
  },
  mapContainer: {
    height: 190,
    backgroundColor: '#F8FAFC',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  mapRadarCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  mapCenterBox: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 10,
  },
  ambulanceIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
    ...shadows.subtle,
  },
  mapPlaceholderTitle: {
    ...typography.heading,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  mapPlaceholderSub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  unitId: {
    ...typography.heading,
    color: colors.text,
  },
  unitType: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 2,
  },
  distanceBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  distanceText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.sm,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    ...typography.subheading,
    fontSize: 13,
    color: colors.text,
  },
  driverPhone: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  driverRating: {
    ...typography.caption,
    fontWeight: '700',
    color: '#D97706',
  },
  hospitalName: {
    ...typography.heading,
    color: colors.text,
    marginBottom: 2,
  },
  hospitalType: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  hospitalMetaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxs,
  },
  hospitalMetaItem: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  hospitalAddress: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  actions: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  // New styles for updated UI
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.xs,
  },
  infoLabel: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
});
