import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { styles } from '../components/styles';
import { colors, spacing } from '../theme';

/**
 * LoadingScreen — clean, polished progress state.
 *
 * @param {{ icon?: string, title: string, subtitle: string }} props
 */
export function LoadingScreen({ icon, title, subtitle }) {
  return (
    <View style={styles.centeredSection}>
      {icon ? <Text style={styles.bigIcon}>{icon}</Text> : null}
      <Text style={styles.cardTitle}>{title}</Text>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={{ marginVertical: spacing.lg }}
      />
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </View>
  );
}
