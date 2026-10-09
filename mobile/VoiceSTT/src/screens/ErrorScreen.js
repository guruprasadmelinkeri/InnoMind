import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../components/styles';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { STATE } from '../constants/appStates';
import { spacing } from '../theme';

const ERROR_TITLES = {
  [STATE.MICROPHONE_ERROR]: 'Microphone Permission Needed',
  [STATE.LOCATION_ERROR]: 'GPS Location Unavailable',
  [STATE.UPLOAD_ERROR]: 'Emergency Transmission Failed',
  [STATE.TRANSCRIPTION_ERROR]: 'Triage Server Unreachable',
  [STATE.PROCESSING_EMERGENCY]: 'Processing Emergency',
  [STATE.EMERGENCY_ERROR]: 'Emergency Processing Failed',
};

/**
 * ErrorScreen — calm, actionable explanation of error state with recovery options.
 *
 * @param {Object} props
 * @param {string} props.state
 * @param {string} props.message
 * @param {() => void} [props.onRetry]
 * @param {() => void} props.onReset
 */
export function ErrorScreen({ state, message, onRetry, onReset }) {
  return (
    <View style={styles.centeredSection}>
      <View style={styles.errorIconBg}>
        <Text style={{ fontSize: 26 }}>⚠️</Text>
      </View>

      <Text style={styles.errorTitle}>
        {ERROR_TITLES[state] || 'Action Required'}
      </Text>

      <View style={styles.errorMsgBox}>
        <Text style={styles.errorMsg}>{message}</Text>
      </View>

      {onRetry && (
        <PrimaryButton
          title="Try Again"
          onPress={onRetry}
          accessibilityLabel="Retry failed action"
          style={{ marginBottom: spacing.sm }}
        />
      )}

      <SecondaryButton
        title="Start Over"
        onPress={onReset}
        accessibilityLabel="Start over"
      />
    </View>
  );
}
