/**
 * MediRoute Design System — Typography
 *
 * Establishes strong informational hierarchy for high-stress medical contexts.
 * Uses native system fonts with calibrated weights and line heights.
 */
import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'sans-serif',
});

export const typography = {
  // Screen Titles
  titleLg: {
    fontFamily,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  titleMd: {
    fontFamily,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.3,
  },

  // Section Headings
  heading: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  subheading: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  // Body Content
  body: {
    fontFamily,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },

  // Key Operational Metrics (ETA, Distance, Score)
  metricLg: {
    fontFamily,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  metricMd: {
    fontFamily,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },

  // Badges & Labels
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  caption: {
    fontFamily,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 0.3,
  },
  button: {
    fontFamily,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
};
