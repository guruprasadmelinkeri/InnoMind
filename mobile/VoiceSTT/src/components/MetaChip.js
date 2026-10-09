import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './styles';

/**
 * Small pill chip showing an icon and label, used on the success screen.
 *
 * @param {{ icon: string, label: string }} props
 */
export function MetaChip({ icon, label }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>
        {icon} {label}
      </Text>
    </View>
  );
}
