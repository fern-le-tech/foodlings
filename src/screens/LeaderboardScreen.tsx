import { useEffect, useState } from "react";
import { View, Text, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii, TAB_BAR_CLEARANCE } from "@/theme/colors";
import type { LeaderboardRow } from "@/types/database";

type SortMode = "collection_size" | "total_xp";

// Same red used on Directory/Collection — the header-panel treatment
// (gradient + eyebrow + perforation divider) is deliberately reused as-is
// so these screens read as one family rather than each inventing its own.
const BOARD_RED = "#D8342B";
const BOARD_RED_LIGHT = "#E8776D";
const BOARD_RED_SOFT = "#FBE4E1";

// One unified list rather than a separate podium block for the top 3 —
// a literal gold/silver/bronze podium is a pattern borrowed from generic
// sports-app templates and clashed with the app's own device-readout
// language elsewhere. Top ranks taper off using Foodlings' own red accent
// and monospace numerals instead: rank 1 gets a full tinted card, ranks
// 2-3 get progressively smaller call-outs, rank 4+ is the plain row.
function rankAccent(rank: number) {
  if (rank === 1) {
    return { card: styles.rowRank1, avatar: 44, rankSize: 22, rankColor: BOARD_RED };
  }
  if (rank === 2) {
    return { card: styles.rowRank2, avatar: 38, rankSize: 18, rankColor: BOARD_RED };
  }
  if (rank === 3) {
    return { card: styles.rowRank3, avatar: 34, rankSize: 16, rankColor: BOARD_RED };
  }
  return { card: null, avatar: 32, rankSize: 14, rankColor: colors.textSecondary };
}

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
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm, paddingBottom: TAB_BAR_CLEARANCE }}
          renderItem={({ item, index }) => {
            const rank = index + 1;
            const accent = rankAccent(rank);
            return (
              <Pressable
                style={[styles.row, accent.card]}
                onPress={() => navigation.navigate("PublicProfile", { userId: item.user_id })}
              >
                <Text style={[styles.rank, { fontSize: accent.rankSize, color: accent.rankColor }]}>
                  {rank}
                </Text>
                {item.avatar_url ? (
                  <Image
                    source={{ uri: item.avatar_url }}
                    style={[styles.avatar, { width: accent.avatar, height: accent.avatar, borderRadius: accent.avatar / 2 }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarFallback,
                      { width: accent.avatar, height: accent.avatar, borderRadius: accent.avatar / 2 },
                    ]}
                  >
                    <Text style={styles.avatarInitial}>{item.display_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.name}>{item.display_name}</Text>
                <Text style={styles.value}>{valueFor(item)}</Text>
              </Pressable>
            );
          }}
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
  // Tapering emphasis for the top 3 — full tint + thick border for #1,
  // white card with a red border for #2, white card with just a red
  // border-left accent for #3, plain for everyone else.
  rowRank1: {
    backgroundColor: BOARD_RED_SOFT,
    borderColor: BOARD_RED,
    borderWidth: 1.5,
  },
  rowRank2: {
    borderColor: BOARD_RED,
    borderWidth: 1.5,
  },
  rowRank3: {
    borderLeftColor: BOARD_RED,
    borderLeftWidth: 3,
  },
  rank: {
    width: 32,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  avatar: { marginRight: spacing.sm },
  avatarFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  name: { flex: 1, fontWeight: "600", color: colors.textPrimary },
  value: { fontFamily: "monospace", fontWeight: "700", color: BOARD_RED },
});
