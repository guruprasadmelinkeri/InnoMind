import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { hospitalService } from '../services/hospitalService';
import { HospitalMap } from '../components/HospitalMap';
import { HospitalCard } from '../components/HospitalCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { colors, typography, spacing, radii } from '../theme';

/**
 * HospitalSelectionScreen — displays triage-ranked emergency centers from backend recommendations.
 *
 * @param {Object} props
 * @param {{ latitude: number, longitude: number } | null} props.userLocation
 * @param {Array} props.recommendations - Array of hospital recommendations from backend
 * @param {string|number} props.emergencyId - ID of the emergency case
 * @param {(hospital: import('../types/hospital').Hospital) => void} props.onSelectHospital
 * @param {() => void} [props.onBack]
 */
export function HospitalSelectionScreen({
  userLocation,
  recommendations,
  emergencyId,
  onSelectHospital,
  onBack,
}) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    // Use the recommendations passed from the previous screen instead of making another API call
    if (recommendations && recommendations.length > 0) {
      // The recommendations already contain full hospital data from the backend
      // Just format them for UI display
      const hospitalsWithDetails = recommendations.map(rec => ({
        id: rec.id,
        name: rec.name,
        score: rec.score, // Already formatted as 0-100 integer
        rating: rec.rating || 5.0,
        distanceKm: rec.distanceKm ? parseFloat(rec.distanceKm.toFixed(1)) : 0,
        address: rec.address || '',
        latitude: rec.latitude || 0,
        longitude: rec.longitude || 0,
        emergencyType: rec.emergencyType || 'Emergency Room',
        availableBeds: rec.availableBeds || 0,
        specialties: rec.specialties || [],
        phone: rec.phone || '',
        hasRecommendationData: true,
        recommendationScore: rec.score / 100, // Convert back to 0-1 scale for internal use if needed
        isMock: rec.isMock || false
      }));

      setHospitals(hospitalsWithDetails);
      if (hospitalsWithDetails.length > 0) {
        setSelectedHospital(hospitalsWithDetails[0]); // Pre-select the top recommendation
      }
      setLoading(false);
    } else {
      // Fallback: try to get hospitals from service if no recommendations provided
      hospitalService
        .getHospitals({
          latitude: userLocation?.latitude,
          longitude: userLocation?.longitude,
        })
        .then((data) => {
          if (isMounted) {
            setHospitals(data);
            if (data && data.length > 0) {
              setSelectedHospital(data[0]);
            }
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err.message || 'Failed to retrieve hospital recommendations.');
            setLoading(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [userLocation, recommendations]);

  const handleConfirm = () => {
    if (selectedHospital) {
      onSelectHospital(selectedHospital);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Navigation & Title Header ───────────────────────────────── */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.screenTitle}>Select Hospital</Text>
        <Text style={styles.screenSubtitle}>
          Nearby emergency centers matched to your reported condition.
        </Text>
      </View>

      {/* ── Simulation / Mock Notice ─────────────────────────────────── */}
      <View style={styles.noticeBanner}>
        <Text style={styles.noticeIcon}>ℹ️</Text>
        <Text style={styles.noticeText}>
          <Text style={styles.noticeBold}>Prototype Mode:</Text> Hospital availability,
          distances, and match scores are simulated data for demonstration.
        </Text>
      </View>

      {/* ── Loading State ────────────────────────────────────────────── */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Locating nearby emergency centers…</Text>
        </View>
      )}

      {/* ── Error State ──────────────────────────────────────────────── */}
      {error && !loading && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Loaded Content ───────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          {/* Map Surface */}
          <HospitalMap
            hospitals={hospitals}
            selectedHospital={selectedHospital}
            onSelectHospital={setSelectedHospital}
            userLocation={userLocation}
          />

          {/* Section Header */}
          <SectionHeader
            title="Available Emergency Centers"
            subtitle={`${hospitals.length} facilities ready for intake`}
          />

          {/* Hospital Cards List */}
          {hospitals.map((hospital) => (
            <HospitalCard
              key={hospital.id}
              hospital={hospital}
              isSelected={selectedHospital?.id === hospital.id}
              onSelect={() => setSelectedHospital(hospital)}
            />
          ))}

          {/* Bottom Confirmation Action */}
          <View style={styles.bottomBar}>
            <PrimaryButton
              title={
                selectedHospital
                  ? `Confirm Route to ${selectedHospital.name.split(' ')[0]}`
                  : 'Select a Hospital'
              }
              onPress={handleConfirm}
              disabled={!selectedHospital}
              accessibilityLabel={
                selectedHospital
                  ? `Confirm route to ${selectedHospital.name}`
                  : 'Select a hospital'
              }
            />

            {selectedHospital && (
              <Text style={styles.confirmMeta}>
                Estimated Arrival: ~{selectedHospital.etaMinutes} · {selectedHospital.distanceKm} km away
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    marginBottom: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  backButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  screenTitle: {
    ...typography.titleLg,
    color: colors.text,
  },
  screenSubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 2,
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
  centerBox: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  errorBox: {
    padding: spacing.md,
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
  },
  bottomBar: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  confirmMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
