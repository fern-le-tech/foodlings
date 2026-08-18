import { View, Text, Image, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/theme/colors";
import type { FoodiemonCharacter, UserRestaurantProgress } from "@/types/database";

interface Props {
  character: Pick<
    FoodiemonCharacter,
    "name_stage1" | "name_stage2" | "name_stage3" | "art_url_stage1" | "art_url_stage2" | "art_url_stage3" | "xp_threshold_stage2" | "xp_threshold_stage3"
  >;
  progress: Pick<UserRestaurantProgress, "current_stage" | "current_xp">;
}

const STAGE_LABELS = ["name_stage1", "name_stage2", "name_stage3"] as const;
const STAGE_ART = ["art_url_stage1", "art_url_stage2", "art_url_stage3"] as const;

const LOCKED_RED = "#D8342B";
const LOCKED_TINT = "#FBEAE8";

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
              {i > 0 && <Text style={styles.threshold}>{thresholds[i]} xp</Text>}
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
  boxReached: {
    backgroundColor: colors.surface,
    borderColor: colors.accentEvolution,
  },
  boxCurrent: {
    borderWidth: 2,
  },
  boxLocked: {
    borderWidth: 1.5,
    borderColor: LOCKED_RED,
    borderStyle: "solid",
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
  connector: {
    height: 2,
    width: spacing.sm,
    backgroundColor: colors.border,
  },
  connectorReached: {
    backgroundColor: colors.accentEvolution,
  },
});
