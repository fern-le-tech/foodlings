import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/colors";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { CharacterCard } from "@/components/CharacterCard";
import type { FoodlingCharacter, Restaurant, UserRestaurantProgress } from "@/types/database";

type Row = {
  character: FoodlingCharacter;
  restaurant: Pick<Restaurant, "id" | "name">;
  progress: UserRestaurantProgress | null;
};

const COLLECTION_RED = "#D8342B";

/**
 * "Foodlingdex" — grid of collected characters across partner restaurants.
 * Only characters the person has actually checked in for (a
 * user_restaurant_progress row exists) are shown as cards; everything
 * else stays hidden rather than appearing as a locked "???" tile, so the
 * dex reads as a growing collection rather than a checklist of unknowns.
 */
export function CollectionScreen() {
  const navigation = useNavigation<any>();
  const tabBarClearance = useTabBarClearance();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
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
    setRefreshing(false);
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLLECTION_RED} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ListEmptyComponent covers the before-anything's-collected state,
          rather than a separate non-scrollable View, so pull-to-refresh
          still works either way. */}
      <FlatList
        style={styles.grid}
        data={collectedRows}
        keyExtractor={(item) => item.character.id}
        numColumns={2}
        contentContainerStyle={[styles.gridContent, { flexGrow: 1, paddingBottom: tabBarClearance }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLLECTION_RED} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyGlyph}>???</Text>
            <Text style={styles.emptyText}>
              Explore Denver food spots to add Foodlings to your collection.
            </Text>
          </View>
        }
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  grid: { flex: 1 },
  gridContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.md },
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
});
