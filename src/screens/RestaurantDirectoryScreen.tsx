import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { restaurantsCache, charactersCache } from "@/lib/prefetchCache";
import type { Restaurant } from "@/types/database";

interface CharacterRow {
  restaurant_id: string;
  name_stage1: string;
  name_stage2: string;
  name_stage3: string;
  art_url_stage1: string | null;
  art_url_stage2: string | null;
  art_url_stage3: string | null;
}

interface ProgressRow {
  restaurant_id: string;
  current_stage: 1 | 2 | 3;
}

// Directory-only accent — deliberately red rather than the shared
// accentEvolution orange, which stays reserved for evolution/XP progress
// elsewhere in the app (see the semantic-color note in theme/colors.ts).
const DIRECTORY_RED = "#D8342B";

// Directory's medallion deliberately does NOT reuse banner_url (the same
// photo shown on Home/deal cards) — a stand-in "logo" badge instead, so
// this list doesn't read as a second copy of the deal carousel. Picked
// deterministically per restaurant id so it's stable across reloads
// without needing a real logo asset.
const LOGO_COLORS = ["#B5651D", "#3F8F6B", "#8C5E3C", "#5B7C99", "#A6693C", "#6B7F45", "#9C5B6B", "#4F7F73"];
function logoColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

export function RestaurantDirectoryScreen() {
  const navigation = useNavigation<any>();
  const tabBarClearance = useTabBarClearance();
  // Seeded from the splash-time prefetch when available (see
  // src/lib/prefetchCache.ts) so this screen paints with real restaurants
  // on first render instead of an empty list + spinner — load() below still
  // runs as normal right after, refreshing this and filling in the
  // user-specific progress data the cache doesn't carry.
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => restaurantsCache ?? []);
  const [charactersByRestaurant, setCharactersByRestaurant] = useState<Map<string, CharacterRow>>(
    () => new Map((charactersCache ?? []).map((c) => [c.restaurant_id, c]))
  );
  const [progressByRestaurant, setProgressByRestaurant] = useState<Map<string, ProgressRow>>(
    new Map()
  );
  const [loading, setLoading] = useState(() => !(restaurantsCache && charactersCache));
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const [{ data: restaurantData }, { data: characterData }, progressResult] = await Promise.all([
      supabase.from("restaurants").select("*").eq("partner_status", "active").order("name"),
      supabase
        .from("foodling_characters")
        .select(
          "restaurant_id, name_stage1, name_stage2, name_stage3, art_url_stage1, art_url_stage2, art_url_stage3"
        ),
      user
        ? supabase
            .from("user_restaurant_progress")
            .select("restaurant_id, current_stage")
            .eq("user_id", user.id)
        : Promise.resolve({ data: [] as ProgressRow[] }),
    ]);

    setRestaurants(restaurantData ?? []);
    setCharactersByRestaurant(
      new Map((characterData ?? []).map((c: CharacterRow) => [c.restaurant_id, c]))
    );
    setProgressByRestaurant(
      new Map((progressResult.data ?? []).map((p: ProgressRow) => [p.restaurant_id, p]))
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Refetch every time this tab regains focus — a fresh check-in on
  // another tab shouldn't require a full app reload to show up here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live updates: subscribe to this user's progress rows so a check-in
  // reflects here immediately even while already sitting on this tab.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`restaurant-directory-progress-${userId}`)
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

  // Unlocked Foodlings float to the top so your progress is the first
  // thing you see; the query already returns restaurants alphabetically,
  // and Array.sort is stable, so this partition keeps each group (unlocked,
  // then locked) in that same A-Z order rather than shuffling either one.
  // Computed above the loading early-return since hooks can't be called
  // conditionally.
  const sortedRestaurants = useMemo(
    () =>
      [...restaurants].sort((a, b) => {
        const aUnlocked = progressByRestaurant.has(a.id) ? 0 : 1;
        const bUnlocked = progressByRestaurant.has(b.id) ? 0 : 1;
        return aUnlocked - bUnlocked;
      }),
    [restaurants, progressByRestaurant]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={DIRECTORY_RED} />
      </View>
    );
  }

  const unlockedCount = restaurants.filter((r) => progressByRestaurant.has(r.id)).length;

  return (
    <View style={styles.screen}>
      <View style={styles.progressSection}>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${restaurants.length ? (unlockedCount / restaurants.length) * 100 : 0}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {unlockedCount} / {restaurants.length} visited
          </Text>
        </View>
      </View>

      <FlatList
        data={sortedRestaurants}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={DIRECTORY_RED} />
        }
        style={styles.list}
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm, paddingBottom: tabBarClearance }}
        renderItem={({ item, index }) => {
          const character = charactersByRestaurant.get(item.id);
          const progress = progressByRestaurant.get(item.id);
          const isUnlocked = !!progress;
          const stage = progress?.current_stage ?? 1;
          const art =
            character &&
            (stage === 3
              ? character.art_url_stage3
              : stage === 2
                ? character.art_url_stage2
                : character.art_url_stage1);

          return (
            <Pressable
              style={[styles.row, index % 2 === 1 ? styles.rowAlt : null]}
              onPress={() => navigation.navigate("CharacterDetail", { restaurantId: item.id })}
            >
              {item.logo_url ? (
                <View style={styles.medallion}>
                  <Image source={{ uri: item.logo_url }} style={styles.medallionLogo} resizeMode="cover" />
                </View>
              ) : (
                <View style={[styles.medallion, { backgroundColor: logoColorFor(item.id) }]}>
                  <Text style={styles.medallionInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}

              <View style={styles.rowTextCol}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.metaRow}>
                  {item.neighborhood ? <Text style={styles.meta}>{item.neighborhood}</Text> : null}
                  {item.cuisine_type ? (
                    <View style={styles.cuisinePill}>
                      <Text style={styles.cuisinePillLabel}>{item.cuisine_type}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {isUnlocked ? (
                <View style={styles.unlockedBadge}>
                  {art ? (
                    <Image source={{ uri: art }} style={styles.unlockedBadgeArt} resizeMode="contain" />
                  ) : (
                    <Text style={styles.unlockedBadgeLabel}>✓</Text>
                  )}
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListFooterComponent={
          restaurants.length > 0 ? (
            <Text style={styles.footerNote}>More Denver spots added weekly.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  progressSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    marginRight: spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: DIRECTORY_RED,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowAlt: {
    backgroundColor: "#FBF3EA",
  },
  medallion: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    overflow: "hidden",
  },
  medallionLogo: {
    width: "100%",
    height: "100%",
  },
  medallionInitial: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  rowTextCol: {
    flex: 1,
  },
  name: {
    fontWeight: "700",
    color: colors.textPrimary,
    fontSize: 15,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginRight: spacing.sm,
  },
  cuisinePill: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  cuisinePillLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  unlockedBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: DIRECTORY_RED,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
    borderWidth: 2,
    borderColor: colors.surface,
    overflow: "hidden",
  },
  unlockedBadgeArt: {
    width: 26,
    height: 26,
  },
  unlockedBadgeLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 12,
  },
  footerNote: {
    textAlign: "center",
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
});