import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/theme/colors";

interface Props {
  currentXp: number;
  currentStage: 1 | 2 | 3;
  xpThresholdStage2: number;
  xpThresholdStage3: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

const RING_RED = "#D8342B";
const DEFAULT_SIZE = 64;

/**
 * A full-circle XP progress ring that wraps directly around the hero
 * character image (children), rather than sitting as a separate widget
 * below it — the character sits centered inside the ring itself, matching
 * a "status ring around the avatar" pattern rather than a standalone gauge.
 * `size` defaults to a compact footprint for standalone/no-children use
 * (e.g. the favorite-Foodling card on Profile); pass an explicit size for
 * the hero use on CharacterDetailScreen.
 */
export function XPBar({
  currentXp,
  currentStage,
  xpThresholdStage2,
  xpThresholdStage3,
  size = DEFAULT_SIZE,
  strokeWidth = 14,
  children,
}: Props) {
  const isMaxed = currentStage >= 3;

  const base = currentStage === 1 ? 0 : xpThresholdStage2;
  const goal = currentStage === 1 ? xpThresholdStage2 : xpThresholdStage3;
  const pct = isMaxed ? 1 : Math.max(0, Math.min(1, (currentXp - base) / (goal - base)));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const ringColor = isMaxed ? colors.accentReward : RING_RED;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.surfaceMuted}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress fill — starts at 12 o'clock, sweeps clockwise */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={ringColor}
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
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  svg: {
    position: "absolute",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
});
