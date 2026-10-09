/**
 * MediRoute Design System — Color Tokens
 *
 * Calm, trustworthy, restrained healthcare palette.
 * Avoids neon, high-saturation purple/blue, or artificial gradients.
 */
export const colors = {
  // Brand & Primary
  primary: '#0F172A',        // Slate 900 — authoritative, trustworthy
  primaryInteractive: '#1E293B', // Slate 800 — active state
  accent: '#0369A1',         // Clinical Sky 700 — clear actions
  accentMuted: '#E0F2FE',    // Sky 100 — subtle tint
  accentSubtle: '#F0F9FF',   // Sky 50

  // Backgrounds & Surfaces
  bg: '#F8FAFC',             // Slate 50 — clean neutral background
  surface: '#FFFFFF',        // Pure white card surfaces
  surfaceSubtle: '#F1F5F9',   // Slate 100 — secondary containers
  surfaceMuted: '#E2E8F0',    // Slate 200 — divider & tracking backgrounds

  // Borders
  border: '#E2E8F0',         // Slate 200 — standard card border
  borderSubtle: '#F1F5F9',   // Slate 100
  borderStrong: '#CBD5E1',   // Slate 300 — input / prominent border
  borderSelected: '#0369A1', // Accent border for selected items

  // Typography
  text: '#0F172A',           // Slate 900 — high contrast primary text
  textSecondary: '#334155',  // Slate 700 — readable body
  textMuted: '#64748B',      // Slate 500 — secondary labels
  textSubtle: '#94A3B8',     // Slate 400 — timestamps / placeholders
  textInverse: '#FFFFFF',    // White text on dark/colored buttons

  // Semantic Statuses
  success: '#15803D',        // Green 700
  successBg: '#DCFCE7',      // Green 100
  successBorder: '#86EFAC',  // Green 300

  warning: '#B45309',        // Amber 700
  warningBg: '#FEF3C7',      // Amber 100
  warningBorder: '#FDE68A',  // Amber 200

  error: '#B91C1C',          // Red 700 — reserved for medical emergencies & hard failures
  errorBg: '#FEE2E2',        // Red 100
  errorBorder: '#FCA5A5',    // Red 300
  red: '#DC2626',            // Recording active indicator

  white: '#FFFFFF',
};

// Backward-compatible alias for existing imports
export const COLORS = {
  bg: colors.bg,
  surface: colors.surface,
  card: colors.surface,
  border: colors.border,
  accent: colors.accent,
  accentLight: colors.accentMuted,
  accentDim: colors.accentSubtle,
  success: colors.success,
  error: colors.error,
  red: colors.red,
  text: colors.text,
  textMuted: colors.textMuted,
  white: colors.white,
};
