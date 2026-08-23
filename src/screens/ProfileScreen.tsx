import { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii, TAB_BAR_CLEARANCE } from "@/theme/colors";
import { AvatarPickerModal } from "@/components/AvatarPickerModal";
import { XPBar } from "@/components/XPBar";
import type { User } from "@/types/database";

// Same red used on Directory/Leaderboard/Home/Collection — a "trainer
// card" banner behind the avatar rather than a full-page background, so
// the stat cards and favorite-Foodling art stay legible on the neutral
// body below it.
const PROFILE_RED = "#D8342B";
const PROFILE_RED_LIGHT = "#E8776D";
const BANNER_HEIGHT = 120;

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
 * Profile tab: avatar, lifetime stats, regions visited, favorite Foodling
 * (auto-picked as highest-xp for now — no manual favoriting UI yet), and an
 * optional Instagram link the person can add themselves.
 */
export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [collectedCount, setCollectedCount] = useState(0);
  const [regionCount, setRegionCount] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [favorite, setFavorite] = useState<ProgressRow | null>(null);
  const [favoriteChar, setFavoriteChar] = useState<FavoriteCharacter | null>(null);
  const [editingInstagram, setEditingInstagram] = useState(false);
  const [instagramInput, setInstagramInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [{ data: userRow }, { count: characterCount }, { data: progressRows }, { data: checkins }] =
      await Promise.all([
        supabase.from("users").select("*").eq("id", authUser.id).single(),
        supabase.from("foodling_characters").select("*", { count: "exact", head: true }),
        supabase
          .from("user_restaurant_progress")
          .select("restaurant_id, current_xp, current_stage, restaurants(name, city)")
          .eq("user_id", authUser.id),
        supabase.from("checkins").select("points_awarded").eq("user_id", authUser.id),
      ]);

    setUser(userRow);
    setInstagramInput(userRow?.instagram_handle ?? "");
    setNameInput(userRow?.display_name ?? "");
    setTotalCharacters(characterCount ?? 0);

    const rows = (progressRows ?? []) as unknown as ProgressRow[];
    setCollectedCount(rows.length);
    setRegionCount(new Set(rows.map((r) => r.restaurants?.city).filter(Boolean)).size);
    setTotalXp(rows.reduce((sum, r) => sum + r.current_xp, 0));
    setTotalPoints((checkins ?? []).reduce((sum, c) => sum + (c.points_awarded ?? 0), 0));

    // Favorite = whichever restaurant they've earned the most XP at, i.e.
    // the place they visit/check in at most.
    const topRow = rows.reduce<ProgressRow | null>((best, r) => {
      if (!best || r.current_xp > best.current_xp) return r;
      return best;
    }, null);
    setFavorite(topRow);

    // Fetch the character directly by restaurant_id rather than relying on
    // a nested join through user_restaurant_progress — the doubly-nested
    // join was unreliable and could silently come back empty even when
    // topRow itself was valid, which is why "favorite" was stuck showing
    // the empty state after the first check-in.
    if (topRow) {
      const { data: charRow } = await supabase
        .from("foodling_characters")
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
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const saveInstagram = async () => {
    if (!user) return;
    setSaving(true);
    const cleaned = instagramInput.trim().replace(/^@/, "");
    await supabase.from("users").update({ instagram_handle: cleaned || null }).eq("id", user.id);
    setUser({ ...user, instagram_handle: cleaned || null });
    setSaving(false);
    setEditingInstagram(false);
  };

  const saveName = async () => {
    if (!user) return;
    const cleaned = nameInput.trim();
    if (!cleaned) {
      Alert.alert("Name can't be empty");
      return;
    }
    setSavingName(true);
    await supabase.from("users").update({ display_name: cleaned }).eq("id", user.id);
    setUser({ ...user, display_name: cleaned });
    setSavingName(false);
    setEditingName(false);
  };

  const selectAvatar = async (url: string) => {
    if (!user) return;
    setUser({ ...user, avatar_url: url }); // optimistic — feels instant on tap
    setAvatarPickerVisible(false);
    await supabase.from("users").update({ avatar_url: url }).eq("id", user.id);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Couldn't log out", error.message);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your account, collection progress, reviews, and check-in history. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            const { error } = await supabase.rpc("delete_my_account");
            if (error) {
              setDeletingAccount(false);
              Alert.alert("Couldn't delete account", error.message);
              return;
            }
            // The RPC only removes the server-side rows — sign out locally
            // too so the cached session doesn't linger and cause confusing
            // "nothing works but no error shows" behavior for an account
            // that no longer exists server-side.
            await supabase.auth.signOut();
          },
        },
      ]
    );
  };

  if (loading || !user) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={PROFILE_RED} />
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={PROFILE_RED} />
      }
    >
      <LinearGradient
        colors={[PROFILE_RED, PROFILE_RED_LIGHT]}
        style={[styles.banner, { height: insets.top + BANNER_HEIGHT }]}
      />

      <View style={styles.body}>
        <View style={styles.header}>
          <Pressable onPress={() => setAvatarPickerVisible(true)}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{user.display_name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeLabel}>Edit</Text>
            </View>
          </Pressable>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor={colors.textDisabled}
                autoFocus
                maxLength={40}
              />
              <Pressable onPress={saveName} disabled={savingName}>
                <Text style={styles.saveLabel}>{savingName ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditingName(true)}>
              <Text style={styles.displayName}>{user.display_name} ✎</Text>
            </Pressable>
          )}

          <Text style={styles.joinedLabel}>Joined {joinedLabel}</Text>
        </View>

        <AvatarPickerModal
          visible={avatarPickerVisible}
          currentUrl={user.avatar_url}
          onSelect={selectAvatar}
          onClose={() => setAvatarPickerVisible(false)}
        />

        <View style={styles.statsGrid}>
          <StatCard label="Foodlings collected" value={`${collectedCount} / ${totalCharacters}`} />
          <StatCard label="Regions visited" value={String(regionCount)} />
          <StatCard label="Total XP (all-time)" value={totalXp.toLocaleString()} />
          <StatCard label="Reward points (all-time)" value={totalPoints.toLocaleString()} />
        </View>

        <Text style={styles.sectionLabel}>Favorite Foodling</Text>
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
          <Text style={styles.emptyText}>Check in somewhere to get your first Foodling.</Text>
        )}

        <Text style={styles.sectionLabel}>Instagram</Text>
        {editingInstagram ? (
          <View style={styles.instagramEditRow}>
            <Text style={styles.instagramAt}>@</Text>
            <TextInput
              style={styles.instagramInput}
              value={instagramInput}
              onChangeText={setInstagramInput}
              placeholder="yourhandle"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="none"
              autoFocus
            />
            <Pressable onPress={saveInstagram} disabled={saving}>
              <Text style={styles.saveLabel}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>
        ) : user.instagram_handle ? (
          <Pressable
            style={styles.instagramRow}
            onPress={() => Linking.openURL(`https://instagram.com/${user.instagram_handle}`)}
            onLongPress={() => setEditingInstagram(true)}
          >
            <MaterialCommunityIcons name="instagram" size={18} color={PROFILE_RED} />
            <Text style={styles.instagramLink}>@{user.instagram_handle}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.instagramRow} onPress={() => setEditingInstagram(true)}>
            <MaterialCommunityIcons name="instagram" size={18} color={colors.textSecondary} />
            <Text style={styles.addInstagramLabel}>Add your Instagram</Text>
          </Pressable>
        )}

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutLabel}>Log out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        >
          <Text style={styles.deleteAccountLabel}>
            {deletingAccount ? "Deleting…" : "Delete account"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statCardInner}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  content: { paddingBottom: TAB_BAR_CLEARANCE },
  banner: { width: "100%" },
  body: { paddingHorizontal: spacing.md },
  // Pulls the avatar up so it straddles the banner/body boundary, "trainer
  // card" style — everything below (name, joined date) stays in normal
  // flow, so only the avatar itself overlaps.
  header: { alignItems: "center", marginTop: -50, marginBottom: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontWeight: "700", color: colors.textPrimary },
  avatarEditBadge: {
    position: "absolute",
    bottom: -4,
    alignSelf: "center",
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  avatarEditBadgeLabel: { fontSize: 10, fontWeight: "700", color: colors.surface },
  displayName: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginTop: spacing.sm },
  joinedLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 2,
    marginRight: spacing.md,
    minWidth: 120,
    textAlign: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xs,
  },
  statCard: {
    width: "50%",
    padding: spacing.xs,
  },
  statCardInner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  statValue: {
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "800",
    color: PROFILE_RED,
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
  instagramLink: { fontSize: 15, color: PROFILE_RED, fontWeight: "600" },
  addInstagramLabel: { fontSize: 14, color: colors.textSecondary },
  instagramEditRow: { flexDirection: "row", alignItems: "center" },
  instagramAt: { fontSize: 15, color: colors.textSecondary, marginRight: 2 },
  instagramInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    marginRight: spacing.md,
  },
  saveLabel: { fontSize: 14, fontWeight: "700", color: PROFILE_RED },
  logoutButton: {
    marginTop: spacing.xl,
    alignSelf: "center",
  },
  logoutLabel: { fontSize: 14, color: colors.accentAlert, fontWeight: "600" },
  // Deliberately quieter than Log out — same destructive color, but
  // smaller and lower on the screen so it can't be tapped by mistake
  // reaching for the far more common logout action just above it.
  deleteAccountButton: {
    marginTop: spacing.md,
    alignSelf: "center",
  },
  deleteAccountLabel: { fontSize: 12, color: colors.accentAlert, opacity: 0.7 },
});