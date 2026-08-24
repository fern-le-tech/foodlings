import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing } from "@/theme/colors";
import { getCurrentBadge, getNextTier, getMilestoneProgress, getTierColor } from "@/constants/badges";

interface Props {
  collectedCount: number;
  size?: number;
  // Optional literal fact ("2 of 8 restaurants") shown under the tier
  // info — separate from the ring, which deliberately isn't tied to this
  // number (see getMilestoneProgress).
  caption?: string;
}

/**
 * Collection-progress badge: a milestone ring (fills toward the next rank,
 * not the ever-growing restaurant total) with the current rank's icon
 * centered inside, the rank name, and how many check-ins stand between
 * here and the next one.
 */
export function MilestoneBadge({ collectedCount, size = 64, caption }: Props) {
  const currentBadge = getCurrentBadge(collectedCount);
  const nextTier = getNextTier(collectedCount);
  const { pct } = getMilestoneProgress(collectedCount);
  const accent = getTierColor(currentBadge?.threshold);

  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View style={styles.row}>
      <View style={[styles.ringWrap, { width: size, height: size }]}>
        <Svg width={size} height={size} style={styles.svg}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.surfaceMuted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={accent}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference}, ${circumference}`}
            strokeDashoffset={circumference * (1 - pct)}
            rotation="-90"
            originX={center}
            originY={center}
          />
        </Svg>
        <MaterialCommunityIcons
          name={currentBadge?.icon ?? "silverware-fork-knife"}
          size={size * 0.4}
          color={currentBadge ? accent : colors.textDisabled}
        />
      </View>

      <View style={styles.textCol}>
        <Text style={styles.rankName}>{currentBadge?.name ?? "Newcomer"}</Text>
        {nextTier ? (
          <Text style={styles.nextHint}>
            Visit {nextTier.threshold - collectedCount} more partner
            {nextTier.threshold - collectedCount === 1 ? " restaurant" : " restaurants"} to unlock{" "}
            {nextTier.name} rank
          </Text>
        ) : (
          <Text style={styles.nextHint}>Max rank reached</Text>
        )}
        {caption && <Text style={styles.caption}>{caption}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  ringWrap: { alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  svg: { position: "absolute" },
  textCol: { flexShrink: 1 },
  rankName: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  nextHint: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  caption: { fontSize: 11, color: colors.textDisabled, marginTop: 3 },
});
