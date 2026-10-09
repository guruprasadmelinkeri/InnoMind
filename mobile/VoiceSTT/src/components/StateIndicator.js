import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './styles';
import { STATE, ERROR_STATES } from '../constants/appStates';

export const FLOW_STAGES = [
  { id: 'voice',     label: 'Voice',     states: [STATE.IDLE, STATE.RECORDING, STATE.RECORDED] },
  { id: 'location',  label: 'Location',  states: [STATE.REQUESTING_LOCATION] },
  { id: 'upload',    label: 'Dispatch',  states: [STATE.UPLOADING, STATE.TRANSCRIBING] },
  { id: 'verified',  label: 'Verified',  states: [STATE.SUCCESS] },
  { id: 'hospitals', label: 'Hospitals', states: [STATE.HOSPITAL_SELECTION] },
  { id: 'tracking',  label: 'Tracking',  states: [STATE.AMBULANCE_TRACKING] },
];

/**
 * StateIndicator — minimal 6-stage progress tracker.
 *
 * @param {{ currentState: string }} props
 */
export function StateIndicator({ currentState }) {
  const activeIndex = FLOW_STAGES.findIndex((stage) => stage.states.includes(currentState));
  const isError = ERROR_STATES.has(currentState);

  return (
    <View style={styles.stepIndicator}>
      {FLOW_STAGES.map((step, i) => {
        const isPast = activeIndex > i;
        const isActive = activeIndex === i;
        return (
          <View key={step.id} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isPast && styles.stepDotPast,
                isActive && (isError ? styles.stepDotError : styles.stepDotActive),
              ]}
            />
            <Text
              style={[
                styles.stepLabel,
                (isPast || isActive) && styles.stepLabelActive,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
            {i < FLOW_STAGES.length - 1 && (
              <View style={[styles.stepLine, isPast && styles.stepLinePast]} />
            )}
          </View>
        );
      })}
    </View>
  );
}
