import { useEffect, useState } from "react";
import { View, Text, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import type { LeaderboardRow } from "@/types/database";

type SortMode = "collection_size" | "total_xp";

// Same red used on Directory/Collection — the header-panel treatment
// (gradient + eyebrow + perforation divider) is deliberately reused as-is
// so these screens read as one family rather than each inventing its own.
const BOARD_RED = "#D8342B";
const BOARD_RED_LIGHT = "#E8776D";
const MEDAL_GOLD = "#F5C518";
const MEDAL_SILVER = "#AEB4BD";
const MEDAL_BRONZE = "#C97B3D";

const PODIUM_ORDER: Array<{ rank: 1 | 2 | 3; height: number; medal: string }> = [
  { rank: 2, height: 108, medal: MEDAL_SILVER },
  { rank: 1, height: 140, medal: MEDAL_GOLD },
  { rank: 3, height: 88, medal: MEDAL_BRONZE },
];

export function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("collection_size");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .rpc("friends_leaderboard")
        .order(sortMode, { ascending: false })
        .limit(50);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [sortMode]);

  const valueFor = (row: LeaderboardRow) =>
    sortMode === "collection_size" ? row.collection_size : row.total_xp;

  const podiumRows = rows.slice(0, 3);
  const restRows = rows.slice(3);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[BOARD_RED, BOARD_RED_LIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerPanel, { paddingTop: insets.top + spacing.sm }]}
      >
        <Text style={styles.eyebrow}>LEADERBOARD</Text>
        <Text style={styles.title}>Friends ranking</Text>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, sortMode === "collection_size" && styles.toggleButtonActive]}
            onPress={() => setSortMode("collection_size")}
          >
            <Text
              style={[styles.toggleLabel, sortMode === "collection_size" && styles.toggleLabelActive]}
            >
              Collection
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, sortMode === "total_xp" && styles.toggleButtonActive]}
            onPress={() => setSortMode("total_xp")}
          >
            <Text style={[styles.toggleLabel, sortMode === "total_xp" && styles.toggleLabelActive]}>
              Total XP
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.perforationRow}>
        <View style={styles.perforationNotchLeft} />
        <View style={styles.perforationLine} />
        <View style={styles.perforationNotchRight} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={BOARD_RED} />
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>
          Invite a friend to see how you stack up — the leaderboard only shows people you're
          connected with.
        </Text>
      ) : (
        <FlatList
          data={restRows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm }}
          ListHeaderComponent={
            podiumRows.length > 0 ? (
              <View style={styles.podiumRow}>
                {PODIUM_ORDER.map(({ rank, height, medal }) => {
                  const row = podiumRows[rank - 1];
                  if (!row) return <View key={rank} style={styles.podiumSlotEmpty} />;
                  return (
                    <Pressable
                      key={rank}
                      style={styles.podiumSlot}
                      onPress={() => navigation.navigate("PublicProfile", { userId: row.user_id })}
                    >
                      {row.avatar_url ? (
                        <Image source={{ uri: row.avatar_url }} style={styles.podiumAvatar} />
                      ) : (
                        <View style={[styles.podiumAvatar, styles.podiumAvatarFallback]}>
                          <Text style={styles.podiumAvatarInitial}>
                            {row.display_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {row.display_name}
                      </Text>
                      <Text style={[styles.podiumValue, { color: medal }]}>{valueFor(row)}</Text>
                      <View style={[styles.podiumBlock, { height, backgroundColor: medal }]}>
                        <Text style={styles.podiumRank}>{rank}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("PublicProfile", { userId: item.user_id })}
            >
              <Text style={styles.rank}>{index + 4}</Text>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{item.display_name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.value}>{valueFor(item)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  title: { fontSize: 26, fontWeight: "800", color: "#FFFFFF" },
  toggleRow: { flexDirection: "row", marginTop: spacing.md },
  toggleButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    marginRight: spacing.sm,
  },
  toggleButtonActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  toggleLabel: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  toggleLabelActive: { color: BOARD_RED },
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
  emptyText: {
    padding: spacing.lg,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  podiumSlot: { flex: 1, alignItems: "center", marginHorizontal: spacing.xs },
  podiumSlotEmpty: { flex: 1, marginHorizontal: spacing.xs },
  podiumAvatar: { width: 56, height: 56, borderRadius: 28, marginBottom: spacing.xs },
  podiumAvatarFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumAvatarInitial: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  podiumName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, maxWidth: 90 },
  podiumValue: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  podiumBlock: {
    width: "100%",
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: spacing.xs,
  },
  podiumRank: {
    fontFamily: "monospace",
    fontSize: 20,
    fontWeight: "800",
    color: "rgba(0,0,0,0.35)",
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
  },
  rank: {
    width: 28,
    fontFamily: "monospace",
    fontWeight: "700",
    color: colors.textSecondary,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  name: { flex: 1, fontWeight: "600", color: colors.textPrimary },
  value: { fontFamily: "monospace", fontWeight: "700", color: BOARD_RED },
});
