import React from 'react';
import { View, Text, Animated } from 'react-native';
import { styles } from '../components/styles';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, typography, spacing } from '../theme';

/**
 * RecordingScreen — active microphone recording state.
 *
 * @param {Object} props
 * @param {string} props.duration - Elapsed MM:SS string
 * @param {() => void} props.onStop
 * @param {Animated.Value} props.pulseScale
 * @param {Animated.Value} props.pulseOpacity
 */
export function RecordingScreen({ duration, onStop, pulseScale, pulseOpacity }) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.recordingContainer}>
        <Animated.View
          style={[
            styles.recordingRing,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
        <View style={styles.recordingDot} />
      </View>

      <Text style={styles.recordingLabel}>● RECORDING AUDIO</Text>
      <Text style={styles.timerText}>{duration}</Text>
      <Text style={styles.cardSubtitle}>
        State patient condition, location landmarks, or critical symptoms.
      </Text>

      <PrimaryButton
        title="Stop Recording"
        onPress={onStop}
        variant="danger"
        accessibilityLabel="Stop recording audio"
      />
    </View>
  );
}
