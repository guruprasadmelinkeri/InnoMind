import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { styles } from '../components/styles';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, typography, spacing } from '../theme';

/**
 * SuccessScreen — reassuring confirmation after emergency creation.
 * Shows emergency details and automatically navigates to Hospital Selection after delay.
 *
 * @param {Object} props
 * @param {Object} props.result - Emergency case object from backend
 * @param {{ latitude: number, longitude: number } | null} props.location
 * @param {() => void} [props.onProceed]
 * @param {() => void} props.onReset
 */
export function SuccessScreen({ result, location, onProceed }) {
  // Format the emergency description for display
  const description = result.description || 'Emergency reported via voice transmission';

  // Format severity for display
  const severityLabel = result.severity
    ? String(result.severity).replace(/_/g, ' ').toUpperCase()
    : 'NOT SPECIFIED';

  // Format patient age for display
  const ageLabel = result.patient_age !== null && result.patient_age !== undefined
    ? `${result.patient_age} years`
    : 'Age not specified';

  return (
    <View style={styles.centeredSection}>
      <View style={styles.successIconBg}>
        <Text style={{ fontSize: 28, color: colors.success, fontWeight: '700' }}>✓</Text>
      </View>

      <Text style={styles.cardTitle}>Emergency Request Received</Text>
      <Text style={styles.cardSubtitle}>
        Your emergency has been logged and is being processed. Finding nearby hospitals…
      </Text>

      {/* Emergency details */}
      {description && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>EMERGENCY DESCRIPTION</Text>
          <Text style={styles.transcriptText}>{description}</Text>
        </View>
      )}

      {/* Metadata tags */}
      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Case: #{result.case_number || 'PENDING'}</Text>
        </View>
        {location ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>
              GPS: {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Severity: {severityLabel}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Patient: {ageLabel}</Text>
        </View>
      </View>

      {/* Automated routing feedback */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceSubtle,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
          gap: 10,
        }}
      >
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          Loading recommended emergency facilities…
        </Text>
      </View>

      {onProceed ? (
        <PrimaryButton
          title="View Hospitals Now"
          onPress={onProceed}
          accessibilityLabel="Proceed to hospital selection"
        />
      ) : null}
    </View>
  );
}
