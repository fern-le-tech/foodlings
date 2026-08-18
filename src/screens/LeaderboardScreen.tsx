import { useEffect, useState } from "react";
import { View, Text, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import type { LeaderboardRow } from "@/types/database";

type SortMode = "collection_size" | "total_xp";

export function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("collection_size");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // TODO: scope this to the user's friends via the `friendships` table
      // (status = 'accepted') instead of the global leaderboard view.
      const { data } = await supabase
        .from("leaderboard")
        .select("*")
        .order(sortMode, { ascending: false })
        .limit(50);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [sortMode]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, sortMode === "collection_size" && styles.toggleButtonActive]}
            onPress={() => setSortMode("collection_size")}
          >
            <Text
              style={[
                styles.toggleLabel,
                sortMode === "collection_size" && styles.toggleLabelActive,
              ]}
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
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.accentEvolution} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item, index }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("PublicProfile", { userId: item.user_id })}
            >
              <Text style={styles.rank}>{index + 1}</Text>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {item.display_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.value}>
                {sortMode === "collection_size" ? item.collection_size : item.total_xp}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  toggleRow: { flexDirection: "row", marginTop: spacing.md },
  toggleButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  toggleButtonActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  toggleLabel: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  toggleLabelActive: { color: colors.surface },
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
  rank: { width: 28, fontWeight: "700", color: colors.textSecondary },
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
  value: { fontWeight: "700", color: colors.accentEvolution },
});