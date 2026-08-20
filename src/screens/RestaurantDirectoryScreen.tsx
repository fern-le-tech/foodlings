import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
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

export function RestaurantDirectoryScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [charactersByRestaurant, setCharactersByRestaurant] = useState<Map<string, CharacterRow>>(
    new Map()
  );
  const [progressByRestaurant, setProgressByRestaurant] = useState<Map<string, ProgressRow>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accentEvolution} />
      </View>
    );
  }

  const unlockedCount = restaurants.filter((r) => progressByRestaurant.has(r.id)).length;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[colors.accentEvolution, "#F0A57A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerPanel, { paddingTop: insets.top + spacing.sm }]}
      >
        <Text style={styles.eyebrow}>DENVER FOOD PASSPORT</Text>
        <Text style={styles.title}>Partner restaurants</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: (restaurants.length ? (unlockedCount / restaurants.length) * 100 : 0) + "%" },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {unlockedCount} / {restaurants.length} stamped
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.perforationRow}>
        <View style={styles.perforationNotchLeft} />
        <View style={styles.perforationLine} />
        <View style={styles.perforationNotchRight} />
      </View>

      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md }}
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
              <View style={[styles.medallion, !isUnlocked ? styles.medallionLocked : null]}>
                {isUnlocked && art ? (
                  <Image source={{ uri: art }} style={styles.medallionArt} resizeMode="contain" />
                ) : (
                  <Text style={styles.medallionUnknown}>???</Text>
                )}
              </View>

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
                  <Text style={styles.unlockedBadgeLabel}>✓</Text>
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
  headerPanel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
    marginRight: spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  perforationRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  perforationNotchLeft: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    marginLeft: -8,
  },
  perforationNotchRight: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    marginRight: -8,
  },
  perforationLine: {
    flex: 1,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    marginHorizontal: spacing.xs,
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
    backgroundColor: colors.accentEvolution,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    overflow: "hidden",
  },
  medallionLocked: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  medallionArt: {
    width: 40,
    height: 40,
  },
  medallionUnknown: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
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
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentEvolution,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
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