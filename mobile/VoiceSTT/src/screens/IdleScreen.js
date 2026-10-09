import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../components/styles';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, typography, spacing } from '../theme';

/**
 * IdleScreen — initial state awaiting user report.
 * Designed to feel calm, clear, and emergency-ready.
 *
 * @param {{ onStart: () => void }} props
 */
export function IdleScreen({ onStart }) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.featureIconBg}>
        <Text style={{ fontSize: 28 }}>🎙️</Text>
      </View>

      <Text style={styles.cardTitle}>Emergency Voice Triage</Text>
      <Text style={styles.cardSubtitle}>
        Press below to describe symptoms, condition, or immediate assistance needed.
        Your coordinates will be attached automatically.
      </Text>

      <PrimaryButton
        title="Start Voice Report"
        onPress={onStart}
        accessibilityLabel="Start voice recording"
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: spacing.md,
        }}
      >
        <Text style={{ fontSize: 12 }}>🔒</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Direct secure link to medical triage network
        </Text>
      </View>
    </View>
  );
}
