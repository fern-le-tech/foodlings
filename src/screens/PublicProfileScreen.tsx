import { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet, ActivityIndicator, Linking, Pressable } from "react-native";
import { useRoute } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { XPBar } from "@/components/XPBar";
import type { User } from "@/types/database";

interface ProgressRow {
  restaurant_id: string;
  current_xp: number;
  current_stage: 1 | 2 | 3;
  restaurants: {
    name: string;
    city: string;
  } | null;
}

interface FavoriteCharacter {
  name_stage1: string;
  name_stage2: string;
  name_stage3: string;
  art_url_stage1: string | null;
  art_url_stage2: string | null;
  art_url_stage3: string | null;
  xp_threshold_stage2: number;
  xp_threshold_stage3: number;
}

/**
 * Read-only profile view for viewing *other* users, reached by tapping a
 * row on the Leaderboard. Mirrors ProfileScreen's stats/favorite logic but
 * scoped to route.params.userId instead of the logged-in user, and with no
 * edit/logout affordances.
 */
export function PublicProfileScreen() {
  const route = useRoute<any>();
  const { userId } = route.params as { userId: string };

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [collectedCount, setCollectedCount] = useState(0);
  const [regionCount, setRegionCount] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [favorite, setFavorite] = useState<ProgressRow | null>(null);
  const [favoriteChar, setFavoriteChar] = useState<FavoriteCharacter | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [{ data: userRow }, { count: characterCount }, { data: progressRows }, { data: checkins }] =
        await Promise.all([
          supabase.from("users").select("*").eq("id", userId).single(),
          supabase.from("foodiemon_characters").select("*", { count: "exact", head: true }),
          supabase
            .from("user_restaurant_progress")
            .select("restaurant_id, current_xp, current_stage, restaurants(name, city)")
            .eq("user_id", userId),
          supabase.from("checkins").select("points_awarded").eq("user_id", userId),
        ]);

      setUser(userRow);
      setTotalCharacters(characterCount ?? 0);

      const rows = (progressRows ?? []) as unknown as ProgressRow[];
      setCollectedCount(rows.length);
      setRegionCount(new Set(rows.map((r) => r.restaurants?.city).filter(Boolean)).size);
      setTotalXp(rows.reduce((sum, r) => sum + r.current_xp, 0));
      setTotalPoints((checkins ?? []).reduce((sum, c) => sum + (c.points_awarded ?? 0), 0));

      const topRow = rows.reduce<ProgressRow | null>((best, r) => {
        if (!best || r.current_xp > best.current_xp) return r;
        return best;
      }, null);
      setFavorite(topRow);

      if (topRow) {
        const { data: charRow } = await supabase
          .from("foodiemon_characters")
          .select(
            "name_stage1, name_stage2, name_stage3, art_url_stage1, art_url_stage2, art_url_stage3, xp_threshold_stage2, xp_threshold_stage3"
          )
          .eq("restaurant_id", topRow.restaurant_id)
          .single();
        setFavoriteChar(charRow ?? null);
      } else {
        setFavoriteChar(null);
      }

      setLoading(false);
    })();
  }, [userId]);

  if (loading || !user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accentEvolution} />
      </View>
    );
  }

  const joinedLabel = new Date(user.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const favoriteStage = favorite?.current_stage ?? 1;
  const favoriteName =
    favoriteChar &&
    (favoriteStage === 3
      ? favoriteChar.name_stage3
      : favoriteStage === 2
        ? favoriteChar.name_stage2
        : favoriteChar.name_stage1);
  const favoriteArt =
    favoriteChar &&
    (favoriteStage === 3
      ? favoriteChar.art_url_stage3
      : favoriteStage === 2
        ? favoriteChar.art_url_stage2
        : favoriteChar.art_url_stage1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{user.display_name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.displayName}>{user.display_name}</Text>
        <Text style={styles.joinedLabel}>Joined {joinedLabel}</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Foodiemons collected" value={`${collectedCount} / ${totalCharacters}`} />
        <StatCard label="Regions visited" value={String(regionCount)} />
        <StatCard label="Total XP (all-time)" value={totalXp.toLocaleString()} />
        <StatCard label="Reward points (all-time)" value={totalPoints.toLocaleString()} />
      </View>

      <Text style={styles.sectionLabel}>Favorite Foodiemon</Text>
      {favorite && favoriteChar ? (
        <View style={styles.favoriteCard}>
          <View style={styles.favoriteTopRow}>
            {favoriteArt ? (
              <Image source={{ uri: favoriteArt }} style={styles.favoriteArt} resizeMode="contain" />
            ) : (
              <View style={styles.favoriteArtPlaceholder} />
            )}
            <View style={styles.favoriteTextCol}>
              <Text style={styles.favoriteName}>{favoriteName}</Text>
              <Text style={styles.favoriteRestaurant}>{favorite.restaurants?.name}</Text>
            </View>
          </View>

          {favoriteStage < 3 && (
            <View style={styles.favoriteXpBarWrap}>
              <XPBar
                currentXp={favorite.current_xp}
                currentStage={favoriteStage}
                xpThresholdStage2={favoriteChar.xp_threshold_stage2}
                xpThresholdStage3={favoriteChar.xp_threshold_stage3}
              />
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.emptyText}>No check-ins yet.</Text>
      )}

      {user.instagram_handle && (
        <>
          <Text style={styles.sectionLabel}>Instagram</Text>
          <Pressable
            style={styles.instagramRow}
            onPress={() => Linking.openURL(`https://instagram.com/${user.instagram_handle}`)}
          >
            <MaterialCommunityIcons name="instagram" size={18} color={colors.accentEvolution} />
            <Text style={styles.instagramLink}>@{user.instagram_handle}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { alignItems: "center", marginTop: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontWeight: "700", color: colors.textPrimary },
  displayName: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginTop: spacing.sm },
  joinedLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xs,
  },
  statCard: {
    width: "50%",
    padding: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.accentEvolution,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  favoriteCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  favoriteTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  favoriteTextCol: { flex: 1 },
  favoriteArt: { width: 56, height: 56, marginRight: spacing.md },
  favoriteArtPlaceholder: {
    width: 56,
    height: 56,
    marginRight: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
  },
  favoriteName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  favoriteRestaurant: { fontSize: 13, color: colors.textSecondary },
  favoriteXpBarWrap: { marginTop: spacing.md },
  instagramRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  instagramLink: { fontSize: 15, color: colors.accentEvolution, fontWeight: "600" },
});