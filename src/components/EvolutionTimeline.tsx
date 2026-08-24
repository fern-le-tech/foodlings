import { View, Text, Image, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/theme/colors";
import type { FoodlingCharacter } from "@/types/database";

interface Props {
  character: Pick<
    FoodlingCharacter,
    "name_stage1" | "name_stage2" | "name_stage3" | "art_url_stage1" | "art_url_stage2" | "art_url_stage3" | "xp_threshold_stage2" | "xp_threshold_stage3"
  >;
  // 0 = not yet checked in (locked/unrevealed), distinct from any real progress row
  progress: { current_stage: 0 | 1 | 2 | 3; current_xp: number };
}

const STAGE_LABELS = ["name_stage1", "name_stage2", "name_stage3"] as const;
const STAGE_ART = ["art_url_stage1", "art_url_stage2", "art_url_stage3"] as const;

const LOCKED_RED = "#D8342B";
const LOCKED_TINT = "#FBEAE8";
// Warm gold rather than the shared colors.accentEvolution orange — reads
// as an "achievement" accent and sits better against the red device shell
// these boxes usually appear inside (Collection, Character Detail). Shared
// exact value with XPBar's ring and CharacterDetailScreen's XP caption so
// all three read as one consistent gold, not three near-misses.
const REACHED_GOLD = "#E3A008";

/**
 * The single evolution-progress component used on the Collection screen
 * (compact) and Character Detail screen (full width with xp counts).
 * Kept dumb/presentational so both call sites can size it as needed.
 *
 * Locked stages show a plain "???" placeholder rather than a tinted
 * silhouette of the art — this keeps the tease consistent regardless of
 * whether the source art has a transparent background, and reads as
 * intentional anticipation-building rather than a half-revealed image.
 * Given a punchier red/tinted treatment (rather than flat grey) so locked
 * stages read as an active tease, not a disabled state.
 */
export function EvolutionTimeline({ character, progress }: Props) {
  const thresholds = [0, character.xp_threshold_stage2, character.xp_threshold_stage3];

  return (
    <View style={styles.row}>
      {STAGE_LABELS.map((key, i) => {
        const stageNumber = i + 1;
        const isReached = progress.current_stage >= stageNumber;
        const isCurrent = progress.current_stage === stageNumber;

        return (
          <View key={key} style={styles.stageWrap}>
            <View
              style={[
                styles.box,
                isReached && styles.boxReached,
                isCurrent && styles.boxCurrent,
                !isReached && styles.boxLocked,
              ]}
            >
              {isReached && character[STAGE_ART[i]] ? (
                <Image
                  source={{ uri: character[STAGE_ART[i]]! }}
                  style={styles.art}
                  resizeMode="contain"
                />
              ) : isReached ? (
                <View style={styles.artPlaceholder} />
              ) : (
                <Text style={styles.lockedGlyph}>???</Text>
              )}
              <Text style={[styles.stageName, isReached && styles.stageNameReached]}>
                {isReached ? character[key] : "???"}
              </Text>
              {/* Stage 1 has no "reach" threshold (it's the starting
                  point), but the line still renders — invisible — so its
                  box reserves the same height as stages 2/3 instead of
                  shrinking to fit one less line of content. */}
              <Text style={[styles.threshold, i === 0 && styles.thresholdHidden]}>
                {i > 0 ? `${thresholds[i]} xp` : " "}
              </Text>
            </View>
            {i < STAGE_LABELS.length - 1 && (
              <View style={[styles.connector, isReached && styles.connectorReached]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  stageWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  box: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
  boxReached: {
    backgroundColor: colors.surface,
    borderColor: REACHED_GOLD,
  },
  // "Current" stage is marked with a glow rather than a thicker border, so
  // border weight stays identical across all three boxes regardless of
  // state — only color (and this shadow) carries the distinction.
  boxCurrent: {
    shadowColor: REACHED_GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  boxLocked: {
    borderColor: LOCKED_RED,
    backgroundColor: LOCKED_TINT,
    shadowColor: LOCKED_RED,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  art: {
    width: 48,
    height: 48,
    marginBottom: spacing.xs,
  },
  artPlaceholder: {
    width: 48,
    height: 48,
    marginBottom: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
  },
  lockedGlyph: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 1,
    color: LOCKED_RED,
    width: 48,
    height: 48,
    textAlign: "center",
    textAlignVertical: "center",
    marginBottom: spacing.xs,
  },
  stageName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textDisabled,
    textAlign: "center",
  },
  stageNameReached: {
    color: colors.textPrimary,
  },
  threshold: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  thresholdHidden: {
    opacity: 0,
  },
  connector: {
    height: 2,
    width: spacing.sm,
    backgroundColor: colors.border,
  },
  connectorReached: {
    backgroundColor: REACHED_GOLD,
  },
});
