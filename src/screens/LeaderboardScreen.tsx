import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { getCurrentBadge, getTierColor, TIER_GOLD, TIER_SILVER, TIER_BRONZE } from "@/constants/badges";
import type { LeaderboardRow } from "@/types/database";

type SortMode = "collection_size" | "total_xp";
type Scope = "global" | "friends";

// Same red used on Directory/Collection — the header-panel treatment
// (gradient + eyebrow + perforation divider) is deliberately reused as-is
// so these screens read as one family rather than each inventing its own.
const BOARD_RED = "#D8342B";

// Every row card is the same plain shape — the top 3 stand out through
// their ordinal number instead: solid gold/silver/bronze medal pills with
// bold white numerals, matching the real medal convention (and reusing the
// exact tier colors from the personal rank badges elsewhere in the app).
function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function rankAccent(rank: number) {
  if (rank === 1) {
    return { medal: TIER_GOLD, avatar: 44, rankSize: 18 };
  }
  if (rank === 2) {
    return { medal: TIER_SILVER, avatar: 38, rankSize: 16 };
  }
  if (rank === 3) {
    return { medal: TIER_BRONZE, avatar: 34, rankSize: 15 };
  }
  return { medal: null, avatar: 32, rankSize: 14 };
}

export function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const tabBarClearance = useTabBarClearance();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [scope, setScope] = useState<Scope>("global");
  const [sortMode, setSortMode] = useState<SortMode>("collection_size");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const { data } = await supabase
        .rpc(scope === "global" ? "global_leaderboard" : "friends_leaderboard")
        .order(sortMode, { ascending: false })
        .limit(50);
      setRows(data ?? []);
      setLoading(false);
      setRefreshing(false);
    },
    [scope, sortMode]
  );

  useEffect(() => {
    load();
  }, [load]);

  const valueFor = (row: LeaderboardRow) =>
    sortMode === "collection_size" ? row.collection_size : row.total_xp;

  return (
    <View style={styles.screen}>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, scope === "global" && styles.toggleButtonActive]}
          onPress={() => setScope("global")}
        >
          <Text style={[styles.toggleLabel, scope === "global" && styles.toggleLabelActive]}>
            Global
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, scope === "friends" && styles.toggleButtonActive]}
          onPress={() => setScope("friends")}
        >
          <Text style={[styles.toggleLabel, scope === "friends" && styles.toggleLabelActive]}>
            Friends
          </Text>
        </Pressable>
      </View>

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

      {/* Own row always shows even with zero friends added, so the
          rows.length === 0 empty state below never fires for a brand-new
          account on Friends scope — without this, seeing just yourself in
          "1st place" reads as a broken/empty leaderboard rather than an
          explained one. */}
      {!loading && scope === "friends" && rows.length > 0 && rows.length <= 1 && (
        <Text style={styles.friendsHint}>
          Only showing you and friends you've added — invite friends to see how you compare.
        </Text>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={BOARD_RED} />
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>
          {scope === "friends"
            ? "Invite a friend to see how you stack up — the leaderboard only shows people you're connected with."
            : "No one's on the board yet."}
        </Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm, paddingBottom: tabBarClearance }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BOARD_RED} />
          }
          ListHeaderComponent={
            // States each column's unit once for the whole list instead of
            // repeating it on every row — reads as a table header, and stays
            // legible no matter how many rows are in the list.
            <View style={styles.columnHeaderRow}>
              <Text style={[styles.columnHeader, styles.rankCol]}>Rank</Text>
              <Text style={[styles.columnHeader, styles.valueCol]}>
                {sortMode === "collection_size" ? "Foodlings" : "XP"}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const rank = index + 1;
            const accent = rankAccent(rank);
            const badge = getCurrentBadge(item.collection_size);
            const badgeColor = getTierColor(badge?.threshold);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("PublicProfile", { userId: item.user_id })}
              >
                {accent.medal ? (
                  <View style={[styles.rankMedal, { backgroundColor: accent.medal }]}>
                    <Text style={[styles.rankMedalLabel, { fontSize: accent.rankSize }]}>
                      {ordinal(rank)}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.rank, { fontSize: accent.rankSize }]}>{ordinal(rank)}</Text>
                )}
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
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                </View>
                <View style={styles.rankCol}>
                  {badge && (
                    <View style={[styles.rankIcon, { borderColor: badgeColor }]}>
                      <MaterialCommunityIcons name={badge.icon} size={16} color={badgeColor} />
                    </View>
                  )}
                </View>
                <Text style={[styles.value, styles.valueCol]}>{valueFor(item)}</Text>
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
  toggleRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  toggleButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  toggleButtonActive: { backgroundColor: BOARD_RED, borderColor: BOARD_RED },
  toggleLabel: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  toggleLabelActive: { color: "#FFFFFF" },
  emptyText: {
    padding: spacing.lg,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  friendsHint: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 17,
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
    width: 44,
    fontFamily: "monospace",
    fontWeight: "800",
    color: colors.textSecondary,
  },
  rankMedal: {
    width: 44,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rankMedalLabel: {
    fontFamily: "monospace",
    fontWeight: "800",
    color: "#FFFFFF",
  },
  avatar: { marginRight: spacing.sm },
  avatarFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  nameRow: { flex: 1, flexDirection: "row", alignItems: "center" },
  name: { flexShrink: 1, fontWeight: "600", color: colors.textPrimary },
  rankCol: { width: 44, alignItems: "center", justifyContent: "center" },
  rankIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: "monospace",
    fontWeight: "700",
    fontSize: 16,
    color: BOARD_RED,
    marginLeft: spacing.sm,
  },
  // Fixed width so the "Foodlings"/"XP" header label and each row's short
  // number both anchor to the same right edge — otherwise the differing
  // text widths shift the Rank column between the header and the rows.
  valueCol: { width: 72, textAlign: "right" },
  columnHeaderRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    // Row cards below have their own internal padding on top of the list's
    // outer padding — matching it here keeps the header's right edge lined
    // up with the rank icon/value inside each card instead of sitting
    // further right than them.
    paddingRight: spacing.md,
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
});
