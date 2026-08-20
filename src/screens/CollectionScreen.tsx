import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/colors";
import { CharacterCard } from "@/components/CharacterCard";
import type { FoodlingCharacter, Restaurant, UserRestaurantProgress } from "@/types/database";

type Row = {
  character: FoodlingCharacter;
  restaurant: Pick<Restaurant, "id" | "name">;
  progress: UserRestaurantProgress | null;
};

// Local-only palette for the Foodlingdex "device" chrome — a retro red
// handheld-scanner look. Deliberately scoped to this screen rather than
// added to the shared theme, since the rest of the app stays on the warm
// cream design system.
const device = {
  shellLight: "#EE4A3E",
  shell: "#D8342B",
  shellDark: "#9C231C",
  bezel: "#262A2E",
  bezelHighlight: "#3B4046",
  lensTeal: "#2FBFAE",
  lensAmber: "#F5C518",
  readoutBg: "#3B4046",
  readoutText: "#EAF6F3",
  caseText: "#FFF3EF",
};

/**
 * "Foodlingdex" — grid of collected characters across partner restaurants.
 * Only characters the person has actually checked in for (a
 * user_restaurant_progress row exists) are shown as cards; everything
 * else stays hidden rather than appearing as a locked "???" tile, so the
 * dex reads as a growing collection rather than a checklist of unknowns.
 * The status readout still tracks collected-vs-total so there's a sense
 * of how much is left to discover.
 */
export function CollectionScreen() {
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const { data: characters } = await supabase
      .from("foodling_characters")
      .select("*, restaurants(id, name)");

    let progressByRestaurant = new Map<string, UserRestaurantProgress>();
    if (user) {
      const { data: progress } = await supabase
        .from("user_restaurant_progress")
        .select("*")
        .eq("user_id", user.id);
      progressByRestaurant = new Map((progress ?? []).map((p) => [p.restaurant_id, p]));
    }

    const merged: Row[] =
      (characters ?? []).map((c: any) => ({
        character: c,
        restaurant: c.restaurants,
        progress: progressByRestaurant.get(c.restaurant_id) ?? null,
      })) ?? [];

    setRows(merged);
    setLoading(false);
  }, []);

  // Refetch every time this tab regains focus (not just on first mount) —
  // otherwise a fresh check-in won't reveal the character here until the
  // app is fully reloaded, since React Navigation keeps tab screens mounted
  // in the background rather than remounting them on tab switch.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live updates: subscribe to this user's progress rows so a check-in
  // (or XP change) reflects here immediately even if the person is
  // already sitting on this tab, not just on next focus.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-restaurant-progress-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_restaurant_progress",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const collectedRows = rows.filter((r) => r.progress);
  const collectedCount = collectedRows.length;

  if (loading) {
    return (
      <View style={styles.shell}>
        <View style={styles.centered}>
          <ActivityIndicator color={device.caseText} />
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={[device.shellLight, device.shell]} style={styles.shell}>
      {/* Status lights + digital readout — the "device chrome" */}
      <View style={styles.statusRow}>
        <View style={styles.lensGroup}>
          <View style={[styles.lens, styles.lensTeal]} />
          <View style={[styles.lens, styles.lensAmber]} />
        </View>
        <View style={styles.readout}>
          <Text style={styles.readoutText}>
            {String(collectedCount).padStart(2, "0")} / {String(rows.length).padStart(2, "0")}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>FOODLINGDEX</Text>

      {/* Seam line simulating the case hinge before the screen begins */}
      <View style={styles.seam} />

      {/* Inset "screen" housing the grid — or an empty state before anything's collected */}
      <View style={styles.screen}>
        {collectedRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyGlyph}>???</Text>
            <Text style={styles.emptyText}>
              Explore Denver food spots to add Foodlings to your Foodlingdex.
            </Text>
          </View>
        ) : (
          <FlatList
            data={collectedRows}
            keyExtractor={(item) => item.character.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <CharacterCard
                name={
                  item.progress?.current_stage === 3
                    ? item.character.name_stage3
                    : item.progress?.current_stage === 2
                      ? item.character.name_stage2
                      : item.character.name_stage1
                }
                artUrl={
                  item.progress?.current_stage === 3
                    ? item.character.art_url_stage3
                    : item.progress?.current_stage === 2
                      ? item.character.art_url_stage2
                      : item.character.art_url_stage1
                }
                restaurantName={item.restaurant.name}
                isLocked={false}
                onPress={() =>
                  navigation.navigate("CharacterDetail", { restaurantId: item.restaurant.id })
                }
              />
            )}
          />
        )}
      </View>

      {/* A couple of small screw-style dots along the bottom edge for realism */}
      <View style={styles.footerDots}>
        <View style={styles.footerDot} />
        <View style={styles.footerDot} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: device.shell,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  lensGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  lens: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.15)",
  },
  lensTeal: { backgroundColor: device.lensTeal, width: 20, height: 20, borderRadius: 10 },
  lensAmber: { backgroundColor: device.lensAmber },
  readout: {
    backgroundColor: device.readoutBg,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  readoutText: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    color: device.readoutText,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
    color: device.caseText,
    marginBottom: spacing.sm,
  },
  seam: {
    height: 3,
    borderRadius: 2,
    backgroundColor: device.shellDark,
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 6,
    borderColor: device.bezel,
    overflow: "hidden",
  },
  grid: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyGlyph: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 32,
    letterSpacing: 2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  footerDots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: device.shellDark,
    marginHorizontal: 4,
    opacity: 0.7,
  },
});