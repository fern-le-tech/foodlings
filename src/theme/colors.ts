// Design system per brief: flat cards, no gradients/shadows, warm accents
// used *semantically* (by category — e.g. "evolution ready", "reward available")
// rather than per-restaurant.

export const colors = {
  background: "#FFF8EF",
  surface: "#FFFFFF",
  surfaceMuted: "#F3ECE0",
  border: "#EAE0D2",

  textPrimary: "#2B2320",
  textSecondary: "#7A6F63",
  textDisabled: "#B8AEA0",

  // Semantic accents — reuse across any restaurant/character
  accentEvolution: "#E8813A", // evolution-ready / xp progress
  accentReward: "#3F8F6B", // rewards available / redeemable
  accentLocked: "#B8AEA0", // locked characters, greyed rewards
  accentAlert: "#D45B5B", // rate-limit / error states

  tabActive: "#2B2320",
  tabInactive: "#B8AEA0",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  card: 12,
  pill: 999,
} as const;

// The bottom tab bar (RootNavigator) floats over content — position:
// "absolute", height 68 + bottom offset 16 — rather than pushing it up, so
// any scrollable screen's last item needs at least this much bottom
// padding or it renders underneath the tab bar and becomes untappable.
export const TAB_BAR_CLEARANCE = 100;
