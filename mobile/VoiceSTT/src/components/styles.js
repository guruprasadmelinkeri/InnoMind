import { StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, shadows } from '../theme';

/**
 * Shared stylesheet for MediRoute.
 * Uses strict design system tokens for spacing, typography, colors, and shadows.
 */
export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingVertical: spacing.lg,
    alignItems: 'flex-start',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  headerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
  },
  headerServiceLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    ...typography.titleLg,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Main Card Surface ─────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    minHeight: 340,
    justifyContent: 'center',
    ...shadows.card,
  },
  centeredSection: {
    alignItems: 'center',
    width: '100%',
  },

  // ── Icons & Feature Badges ────────────────────────────────────────────────
  bigIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  featureIconBg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },

  // ── Recording Visualizer ──────────────────────────────────────────────────
  recordingContainer: {
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  recordingRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.red,
  },
  recordingDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.red,
  },
  recordingLabel: {
    ...typography.caption,
    color: colors.red,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  timerText: {
    ...typography.metricLg,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginVertical: spacing.xs,
  },

  // ── Typography ────────────────────────────────────────────────────────────
  cardTitle: {
    ...typography.titleMd,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    maxWidth: 320,
  },

  // ── Action Buttons ────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: spacing.sm,
    ...shadows.subtle,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  stopButton: {
    backgroundColor: colors.red,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: spacing.md,
    ...shadows.subtle,
  },
  stopButtonText: {
    ...typography.button,
    color: colors.white,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: spacing.xs,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // ── Success State ─────────────────────────────────────────────────────────
  successHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successCheckmark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 26,
    lineHeight: 56,
    color: colors.success,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  successTitle: {
    ...typography.titleMd,
    color: colors.text,
  },
  transcriptBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.md,
  },
  transcriptLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  transcriptText: {
    ...typography.body,
    color: colors.text,
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  metaChip: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radii.sm,
  },
  metaChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // ── Error State ───────────────────────────────────────────────────────────
  errorTitle: {
    ...typography.titleMd,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  errorMsgBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
  },
  errorMsg: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Flow Progress Indicator ───────────────────────────────────────────────
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
    marginBottom: 6,
  },
  stepDotPast: {
    backgroundColor: colors.primary,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -1,
    marginBottom: 5,
  },
  stepDotError: {
    backgroundColor: colors.error,
  },
  stepLine: {
    position: 'absolute',
    top: 4,
    left: '60%',
    right: '-60%',
    height: 1.5,
    backgroundColor: colors.border,
    zIndex: -1,
  },
  stepLinePast: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSubtle,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
});
