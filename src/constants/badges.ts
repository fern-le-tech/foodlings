import type MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export interface BadgeTier {
  threshold: number;
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

// Smaller ranks build up to the one true flex — Top Foodie at 100 is
// deliberately the only tier styled in red instead of gold (see
// MilestoneBadge) so it reads as a different tier of achievement, not
// just "one more badge."
export const BADGE_TIERS: BadgeTier[] = [
  // A plain apple, not generic silverware — the first taste, before any
  // real exploration. (MDI has no bitten-apple glyph, so no bite mark.)
  { threshold: 1, name: "Taste Tester", icon: "food-apple-outline" },
  // A storefront — you're becoming a known face around town, not just
  // "eating food" (which every tier involves).
  { threshold: 5, name: "Local", icon: "storefront-outline" },
  { threshold: 10, name: "Explorer", icon: "compass-outline" },
  // A specific dish, not generic silverware — you've sampled real variety.
  { threshold: 25, name: "Foodie", icon: "noodles" },
  { threshold: 50, name: "Connoisseur", icon: "chef-hat" },
  // Outline crown — elite, but not the crown itself yet.
  { threshold: 75, name: "Epicurean", icon: "crown-outline" },
  // Filled crown — pays off the outline crown from Epicurean: you don't
  // just get *a* trophy, you finally wear the crown for real.
  { threshold: 100, name: "Top Foodie", icon: "crown" },
];

// Rank color climbs like real medal tiers as count rises, so gold stops
// meaning "generic progress" and a rank-up also reads as a color upgrade —
// bronze (1/5/10) -> silver (25/50) -> gold (75) -> red, Top Foodie only.
export const TIER_BRONZE = "#B5651D";
export const TIER_SILVER = "#9C9184";
export const TIER_GOLD = "#E3A008";
export const TIER_MAX_RED = "#D8342B";

export function getTierColor(threshold: number | undefined): string {
  if (threshold === undefined) return TIER_BRONZE;
  if (threshold >= 100) return TIER_MAX_RED;
  if (threshold >= 75) return TIER_GOLD;
  if (threshold >= 25) return TIER_SILVER;
  return TIER_BRONZE;
}

export function getCurrentBadge(count: number): BadgeTier | null {
  let current: BadgeTier | null = null;
  for (const tier of BADGE_TIERS) {
    if (count >= tier.threshold) current = tier;
  }
  return current;
}

export function getNextTier(count: number): BadgeTier | null {
  return BADGE_TIERS.find((tier) => count < tier.threshold) ?? null;
}

export function isMaxRank(count: number): boolean {
  return count >= BADGE_TIERS[BADGE_TIERS.length - 1].threshold;
}

// Ring fill is count-vs-next-milestone, never count-vs-total-restaurants —
// the restaurant total keeps growing as new partners join, and a ring tied
// to that would visually shrink every time one gets added even though the
// person didn't lose any progress. This way the ring only ever fills up
// and resets at each tier, regardless of how large the directory gets.
export function getMilestoneProgress(count: number): { target: number; pct: number } {
  const next = getNextTier(count);
  if (!next) return { target: BADGE_TIERS[BADGE_TIERS.length - 1].threshold, pct: 1 };
  return { target: next.threshold, pct: Math.min(1, count / next.threshold) };
}
