import { useEffect, useRef } from "react";
import { View, Text, Animated, Pressable, StyleSheet } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { colors, spacing, radii } from "@/theme/colors";
import type { ProcessCheckinResult } from "@/types/database";

/**
 * Reached after process_checkin() resolves. Route params carry the RPC
 * result directly so this screen has zero extra fetching to do.
 */
export function CheckInSuccessScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const result = route.params as ProcessCheckinResult & { restaurantName: string };

  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {result.rate_limited ? (
          <>
            <Text style={styles.rateLimitTitle}>Check-in logged</Text>
            <Text style={styles.rateLimitBody}>
              You already checked in at {result.restaurantName} recently — xp and points will
              count again after the 4-hour window.
            </Text>
          </>
        ) : (
          <>
            {result.evolved && <Text style={styles.evolvedBanner}>Evolution!</Text>}
            <Text style={styles.title}>+{result.xp_awarded} xp</Text>
            <Text style={styles.subtitle}>+{result.points_awarded} points at {result.restaurantName}</Text>
            {result.evolved && (
              <Text style={styles.evolvedBody}>
                Your character reached stage {result.new_stage}!
              </Text>
            )}
          </>
        )}
        <Pressable style={styles.button} onPress={() => navigation.navigate("Collection")}>
          <Text style={styles.buttonLabel}>Nice</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  evolvedBanner: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accentEvolution,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: spacing.xs },
  evolvedBody: { fontSize: 15, color: colors.accentEvolution, marginTop: spacing.md, fontWeight: "600" },
  rateLimitTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  rateLimitBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.textPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
  },
  buttonLabel: { color: colors.surface, fontWeight: "700" },
});
