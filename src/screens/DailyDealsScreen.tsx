import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";

// Same red used on Directory/Leaderboard/Collection — the header-panel
// treatment is deliberately reused as-is so these screens read as one
// family. The deal cards themselves stay white/cream (not red) since
// they're showing real food photography, which reads as more appetizing
// against a neutral backdrop than a saturated color field.
const HOME_RED = "#D8342B";
const HOME_RED_LIGHT = "#E8776D";

interface DealRow {
  id: string;
  restaurant_id: string;
  photo_url: string;
  description: string;
  expires_at: string;
  restaurants: {
    name: string;
    neighborhood: string | null;
    city: string | null;
  } | null;
}

function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ending soon";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

const CARD_SIDE_PADDING = spacing.lg;

export function DailyDealsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cardWidth = width - CARD_SIDE_PADDING * 2;
  const imageHeight = height * 0.28; // ~1/3 of screen, not half

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"all" | "saved">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<DealRow | null>(null);

  const listRef = useRef<FlatList<DealRow>>(null);

  const loadDeals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const [{ data: dealsData }, savedResult] = await Promise.all([
      supabase
        .from("daily_deals")
        .select("id, restaurant_id, photo_url, description, expires_at, restaurants(name, neighborhood, city)")
        .eq("active", true)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true }),
      user
        ? supabase.from("saved_deals").select("deal_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { deal_id: string }[] }),
    ]);

    setDeals((dealsData ?? []) as unknown as DealRow[]);
    setSavedIds(new Set((savedResult.data ?? []).map((r) => r.deal_id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await loadDeals();
        setLoading(false);
        setActiveIndex(0);
      })();
    }, [loadDeals])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDeals();
    setActiveIndex(0);
    setRefreshing(false);
  }, [loadDeals]);

  const toggleSave = async (dealId: string) => {
    if (!userId) return;
    const isSaved = savedIds.has(dealId);

    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(dealId);
      else next.add(dealId);
      return next;
    });

    if (isSaved) {
      await supabase.from("saved_deals").delete().eq("user_id", userId).eq("deal_id", dealId);
    } else {
      await supabase.from("saved_deals").insert({ user_id: userId, deal_id: dealId });
    }
  };

  const visibleDeals = viewMode === "saved" ? deals.filter((d) => savedIds.has(d.id)) : deals;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== activeIndex) setActiveIndex(index);
  };

  const goToRestaurant = (deal: DealRow) => {
    setSelectedDeal(null);
    navigation.navigate("CharacterDetail", { restaurantId: deal.restaurant_id });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={HOME_RED} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[HOME_RED, HOME_RED_LIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <Text style={styles.eyebrow}>HOME</Text>
        <Text style={styles.headerTitle}>Today's Deals</Text>
        <Text style={styles.headerSubtitle}>Swipe through fresh offers, live right now</Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, viewMode === "all" && styles.toggleButtonActive]}
            onPress={() => setViewMode("all")}
          >
            <Text style={[styles.toggleLabel, viewMode === "all" && styles.toggleLabelActive]}>All Deals</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, viewMode === "saved" && styles.toggleButtonActive]}
            onPress={() => setViewMode("saved")}
          >
            <Text style={[styles.toggleLabel, viewMode === "saved" && styles.toggleLabelActive]}>
              Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ""}
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.perforationRow}>
        <View style={styles.perforationNotchLeft} />
        <View style={styles.perforationLine} />
        <View style={styles.perforationNotchRight} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={HOME_RED} />
        }
      >
      {visibleDeals.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name={viewMode === "saved" ? "bookmark-outline" : "silverware-fork-knife"}
            size={48}
            color={colors.textDisabled}
          />
          <Text style={styles.emptyTitle}>{viewMode === "saved" ? "No saved deals yet" : "No deals right now"}</Text>
          <Text style={styles.emptyBody}>
            {viewMode === "saved"
              ? "Tap the bookmark on a deal to save it here."
              : "Check back later — restaurants post new deals throughout the day."}
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={visibleDeals}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item }) => {
              const isSaved = savedIds.has(item.id);
              return (
                <View style={{ width }}>
                  <Pressable
                    style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
                    onPress={() => setSelectedDeal(item)}
                  >
                    <Image
                      source={{ uri: item.photo_url }}
                      style={[styles.cardImage, { height: imageHeight }]}
                      resizeMode="cover"
                    />

                    <View style={styles.timerBadge}>
                      <MaterialCommunityIcons name="clock-outline" size={12} color="#FFFFFF" />
                      <Text style={styles.timerBadgeText}>{formatTimeRemaining(item.expires_at)}</Text>
                    </View>

                    <Pressable
                      style={styles.saveBadge}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleSave(item.id);
                      }}
                      hitSlop={8}
                    >
                      <MaterialCommunityIcons
                        name={isSaved ? "bookmark" : "bookmark-outline"}
                        size={18}
                        color={isSaved ? colors.accentReward : "#FFFFFF"}
                      />
                    </Pressable>

                    <View style={styles.cardBody}>
                      <View style={styles.cardRestaurantRow}>
                        <Text style={styles.cardRestaurantName} numberOfLines={1}>
                          {item.restaurants?.name ?? "Restaurant"}
                        </Text>
                        {item.restaurants?.neighborhood && (
                          <Text style={styles.cardNeighborhood} numberOfLines={1}>
                            {item.restaurants.neighborhood}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.cardDescription} numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View style={styles.cardFooter}>
                        <Text style={styles.cardCta}>Tap for details</Text>
                        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.accentEvolution} />
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            }}
          />

          {visibleDeals.length > 1 && (
            <View style={styles.dots}>
              {visibleDeals.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </>
      )}
      </ScrollView>

      <Modal visible={!!selectedDeal} animationType="slide" transparent onRequestClose={() => setSelectedDeal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Pressable style={styles.modalClose} onPress={() => setSelectedDeal(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>

            {selectedDeal && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Image source={{ uri: selectedDeal.photo_url }} style={styles.modalImage} resizeMode="cover" />

                <View style={styles.modalBody}>
                  <View style={styles.modalTimerBadge}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                    <Text style={styles.modalTimerText}>{formatTimeRemaining(selectedDeal.expires_at)}</Text>
                  </View>

                  <Text style={styles.modalRestaurantName}>{selectedDeal.restaurants?.name ?? "Restaurant"}</Text>
                  {selectedDeal.restaurants?.neighborhood && (
                    <Text style={styles.modalNeighborhood}>
                      {selectedDeal.restaurants.neighborhood}
                      {selectedDeal.restaurants.city ? `, ${selectedDeal.restaurants.city}` : ""}
                    </Text>
                  )}

                  <Text style={styles.modalDescription}>{selectedDeal.description}</Text>

                  <Pressable
                    style={[styles.modalSaveButton, savedIds.has(selectedDeal.id) && styles.modalSaveButtonActive]}
                    onPress={() => toggleSave(selectedDeal.id)}
                  >
                    <MaterialCommunityIcons
                      name={savedIds.has(selectedDeal.id) ? "bookmark" : "bookmark-outline"}
                      size={18}
                      color={savedIds.has(selectedDeal.id) ? "#FFFFFF" : colors.accentEvolution}
                    />
                    <Text
                      style={[
                        styles.modalSaveLabel,
                        savedIds.has(selectedDeal.id) && styles.modalSaveLabelActive,
                      ]}
                    >
                      {savedIds.has(selectedDeal.id) ? "Saved" : "Save deal"}
                    </Text>
                  </Pressable>

                  <Pressable style={styles.modalDirectionsButton} onPress={() => goToRestaurant(selectedDeal)}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#FFFFFF" />
                    <Text style={styles.modalDirectionsLabel}>View restaurant & get directions</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 4,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  toggleRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    alignSelf: "flex-start",
  },
  toggleButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    marginRight: spacing.sm,
  },
  toggleButtonActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  toggleLabel: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  toggleLabelActive: { color: HOME_RED },

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

  carouselContent: { alignItems: "center", paddingTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: "hidden",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  cardImage: { width: "100%", backgroundColor: colors.surfaceMuted },
  timerBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  timerBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  saveBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: spacing.md },
  cardRestaurantRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardRestaurantName: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, flexShrink: 1 },
  cardNeighborhood: { fontSize: 12, color: colors.textSecondary, marginLeft: spacing.sm },
  cardDescription: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  cardCta: { fontSize: 13, fontWeight: "700", color: colors.accentEvolution, marginRight: 2 },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accentEvolution,
    width: 16,
  },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary, marginTop: spacing.md },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    overflow: "hidden",
  },
  modalClose: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImage: { width: "100%", height: 260, backgroundColor: colors.surfaceMuted },
  modalBody: { padding: spacing.lg },
  modalTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  modalTimerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  modalRestaurantName: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  modalNeighborhood: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  modalDescription: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  modalSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.accentEvolution,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  modalSaveButtonActive: {
    backgroundColor: colors.accentEvolution,
  },
  modalSaveLabel: { fontSize: 15, fontWeight: "700", color: colors.accentEvolution },
  modalSaveLabelActive: { color: "#FFFFFF" },
  modalDirectionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalDirectionsLabel: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});