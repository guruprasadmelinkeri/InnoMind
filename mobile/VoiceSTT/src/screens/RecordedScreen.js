import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../components/styles';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { colors, typography, spacing } from '../theme';

/**
 * RecordedScreen — voice report captured, ready for transmission with GPS.
 *
 * @param {Object} props
 * @param {string} props.duration
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onRedo
 */
export function RecordedScreen({ duration, onSubmit, onRedo }) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.featureIconBg}>
        <Text style={{ fontSize: 26 }}>✓</Text>
      </View>

      <Text style={styles.cardTitle}>Audio Report Captured</Text>
      <Text style={styles.timerText}>{duration}</Text>
      <Text style={styles.cardSubtitle}>
        Your voice recording is ready. Next, attach your GPS coordinates and submit to
        the medical dispatch server.
      </Text>

      <PrimaryButton
        title="Share Location & Submit"
        onPress={onSubmit}
        accessibilityLabel="Share location and submit report"
        style={{ marginBottom: spacing.sm }}
      />

      <SecondaryButton
        title="Record Again"
        onPress={onRedo}
        accessibilityLabel="Record again"
      />
    </View>
  );
}
