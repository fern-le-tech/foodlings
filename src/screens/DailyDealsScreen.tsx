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
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

// Home breaks from the red family used on Directory/Leaderboard/Collection —
// it's the first screen people land on, so it gets its own identity: a
// fresh herb-teal gradient instead. The deal cards themselves stay
// white/cream (not teal) since they're showing real food photography,
// which reads as more appetizing against a neutral backdrop than a
// saturated color field.
const HOME_TEAL = "#1C7A66";
const HOME_TEAL_LIGHT = "#4ECDB0";
const HOME_TEAL_SOFT = "#E1F5F2";
// Brand red — used sparingly on this otherwise-teal screen for the two
// spots that are really about the Foodlings mark itself (the flame icon,
// and the "no photo yet" placeholder banner showing the f logo) rather
// than Home's own page identity.
const HOME_BRAND_RED = "#D8342B";
const HOME_BRAND_RED_LIGHT = "#E8776D";

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
  characterArt: string | null;
  isUnlocked: boolean;
}

function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ending soon";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// Great-circle distance, not straight DB distance — restaurants.lat/lng are
// plain floats (no PostGIS), so nearest-first sorting happens client-side
// against whatever the device's current GPS fix reports.
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return "Nearby";
  return `${miles.toFixed(1)} mi`;
}

const CARD_SIDE_PADDING = spacing.lg;

interface NearbyRestaurantRow {
  id: string;
  name: string;
  neighborhood: string | null;
  cuisine_type: string | null;
  lat: number | null;
  lng: number | null;
  banner_url: string | null;
}

interface NearbyCharacterRow {
  restaurant_id: string;
  art_url_stage1: string | null;
  art_url_stage2: string | null;
  art_url_stage3: string | null;
}

interface NearbyProgressRow {
  restaurant_id: string;
  current_stage: 1 | 2 | 3;
}

interface NearbyRestaurant {
  id: string;
  name: string;
  neighborhood: string | null;
  cuisine_type: string | null;
  distanceMi: number;
  art: string | null;
  banner: string | null;
  isUnlocked: boolean;
}

type NearbyStatus = "idle" | "loading" | "ready" | "denied" | "unavailable";

export function DailyDealsScreen() {
  const navigation = useNavigation<any>();
  const tabBarClearance = useTabBarClearance();
  const { width, height } = useWindowDimensions();
  const cardWidth = width - CARD_SIDE_PADDING * 2;
  const imageHeight = height * 0.28; // ~1/3 of screen, not half
  const nearbyBannerHeight = height * 0.22; // a step down from the deal hero image — keeps Top Deals as the visual lead

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"all" | "saved">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<DealRow | null>(null);
  const [nearby, setNearby] = useState<NearbyRestaurant[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<NearbyStatus>("idle");

  const listRef = useRef<FlatList<DealRow>>(null);

  const loadDeals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    // Each deal card also carries its restaurant's Foodling — the app is
    // fundamentally about knowing which character lives where, so that
    // tie should be visible even from a deal post, not just the directory.
    const [{ data: dealsData }, savedResult, { data: characterData }, progressResult] = await Promise.all([
      supabase
        .from("daily_deals")
        .select("id, restaurant_id, photo_url, description, expires_at, restaurants(name, neighborhood, city)")
        .eq("active", true)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true }),
      user
        ? supabase.from("saved_deals").select("deal_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { deal_id: string }[] }),
      supabase
        .from("foodling_characters")
        .select("restaurant_id, art_url_stage1, art_url_stage2, art_url_stage3"),
      user
        ? supabase
            .from("user_restaurant_progress")
            .select("restaurant_id, current_stage")
            .eq("user_id", user.id)
        : Promise.resolve({ data: [] as NearbyProgressRow[] }),
    ]);

    const charactersByRestaurant = new Map(
      (characterData ?? []).map((c: NearbyCharacterRow) => [c.restaurant_id, c])
    );
    const progressByRestaurant = new Map(
      (progressResult.data ?? []).map((p: NearbyProgressRow) => [p.restaurant_id, p])
    );

    const dealsWithCharacters: DealRow[] = ((dealsData ?? []) as unknown as DealRow[]).map((d) => {
      const character = charactersByRestaurant.get(d.restaurant_id);
      const progress = progressByRestaurant.get(d.restaurant_id);
      const stage = progress?.current_stage ?? 1;
      const art = character
        ? stage === 3
          ? character.art_url_stage3
          : stage === 2
            ? character.art_url_stage2
            : character.art_url_stage1
        : null;
      return { ...d, characterArt: art, isUnlocked: !!progress };
    });

    setDeals(dealsWithCharacters);
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

  // Live GPS fix on every focus, not a cached location — "closest first"
  // should reflect where the user actually is right now, not where they
  // were last time they opened the app.
  const loadNearby = useCallback(async () => {
    setNearbyStatus("loading");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setNearbyStatus("denied");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [{ data: restaurantData }, { data: characterData }, {
        data: { user },
      }] = await Promise.all([
        supabase
          .from("restaurants")
          .select("id, name, neighborhood, cuisine_type, lat, lng, banner_url")
          .eq("partner_status", "active")
          .not("lat", "is", null)
          .not("lng", "is", null),
        supabase
          .from("foodling_characters")
          .select("restaurant_id, art_url_stage1, art_url_stage2, art_url_stage3"),
        supabase.auth.getUser(),
      ]);

      const progressResult = user
        ? await supabase
            .from("user_restaurant_progress")
            .select("restaurant_id, current_stage")
            .eq("user_id", user.id)
        : { data: [] as NearbyProgressRow[] };

      const charactersByRestaurant = new Map(
        (characterData ?? []).map((c: NearbyCharacterRow) => [c.restaurant_id, c])
      );
      const progressByRestaurant = new Map(
        (progressResult.data ?? []).map((p: NearbyProgressRow) => [p.restaurant_id, p])
      );

      const withDistance: NearbyRestaurant[] = ((restaurantData ?? []) as NearbyRestaurantRow[])
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => {
          const character = charactersByRestaurant.get(r.id);
          const progress = progressByRestaurant.get(r.id);
          const stage = progress?.current_stage ?? 1;
          const art = character
            ? stage === 3
              ? character.art_url_stage3
              : stage === 2
                ? character.art_url_stage2
                : character.art_url_stage1
            : null;

          return {
            id: r.id,
            name: r.name,
            neighborhood: r.neighborhood,
            cuisine_type: r.cuisine_type,
            distanceMi: haversineMiles(
              position.coords.latitude,
              position.coords.longitude,
              r.lat as number,
              r.lng as number
            ),
            art,
            banner: r.banner_url,
            isUnlocked: !!progress,
          };
        })
        .sort((a, b) => a.distanceMi - b.distanceMi)
        .slice(0, 10);

      setNearby(withDistance);
      setNearbyStatus("ready");
    } catch {
      setNearbyStatus("unavailable");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNearby();
    }, [loadNearby])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDeals(), loadNearby()]);
    setActiveIndex(0);
    setRefreshing(false);
  }, [loadDeals, loadNearby]);

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

  // A saved_deals row can outlive the deal it points to (expired or
  // deleted) — loadDeals() only ever fetches currently-active, unexpired
  // deals, so savedIds.size alone would count stale rows the person would
  // never actually see. Counting against the deals that are actually
  // loaded keeps the "Saved (N)" badge honest.
  const savedActiveCount = deals.filter((d) => savedIds.has(d.id)).length;
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
        <ActivityIndicator size="large" color={HOME_TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: tabBarClearance }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={HOME_TEAL} />
        }
      >
      <View style={[styles.sectionHeaderRow, styles.sectionHeaderSpacing, styles.topDealsHeaderRow]}>
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons name="fire" size={21} color={HOME_BRAND_RED} />
          <Text style={styles.sectionLabel}>Top Deals</Text>
        </View>
        <View style={styles.dealsToggleRow}>
          <Pressable
            style={[styles.dealsToggleButton, viewMode === "all" && styles.dealsToggleButtonActive]}
            onPress={() => setViewMode("all")}
          >
            <Text style={[styles.dealsToggleLabel, viewMode === "all" && styles.dealsToggleLabelActive]}>
              All
            </Text>
          </Pressable>
          <Pressable
            style={[styles.dealsToggleButton, viewMode === "saved" && styles.dealsToggleButtonActive]}
            onPress={() => setViewMode("saved")}
          >
            <Text style={[styles.dealsToggleLabel, viewMode === "saved" && styles.dealsToggleLabelActive]}>
              Saved{savedActiveCount > 0 ? ` (${savedActiveCount})` : ""}
            </Text>
          </Pressable>
        </View>
      </View>

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
                    <View style={styles.cardImageWrap}>
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

                      <View style={[styles.dealMedallion, !item.isUnlocked && styles.dealMedallionLocked]}>
                        {item.isUnlocked && item.characterArt ? (
                          <Image
                            source={{ uri: item.characterArt }}
                            style={styles.dealMedallionArt}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.dealMedallionUnknown}>???</Text>
                        )}
                      </View>
                    </View>

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

      <View style={styles.sectionDivider} />

      <View style={styles.nearbySection}>
        <View style={styles.sectionHeaderRow}>
          <MaterialCommunityIcons name="map-marker-radius" size={21} color={HOME_TEAL} />
          <Text style={styles.sectionLabel}>Restaurants Near You</Text>
        </View>

        {nearbyStatus === "loading" || nearbyStatus === "idle" ? (
          <View style={styles.nearbyStateBox}>
            <ActivityIndicator color={HOME_TEAL} />
            <Text style={styles.nearbyStateText}>Finding restaurants near you…</Text>
          </View>
        ) : nearbyStatus === "denied" ? (
          <View style={styles.nearbyStateBox}>
            <Text style={styles.nearbyStateText}>
              Turn on location access to see partner restaurants closest to you.
            </Text>
            <Pressable style={styles.nearbyRetryButton} onPress={loadNearby}>
              <Text style={styles.nearbyRetryLabel}>Enable location</Text>
            </Pressable>
          </View>
        ) : nearbyStatus === "unavailable" ? (
          <View style={styles.nearbyStateBox}>
            <Text style={styles.nearbyStateText}>
              Couldn't get your location. Check your device's location settings and try again.
            </Text>
            <Pressable style={styles.nearbyRetryButton} onPress={loadNearby}>
              <Text style={styles.nearbyRetryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : nearby.length === 0 ? (
          <View style={styles.nearbyStateBox}>
            <Text style={styles.nearbyStateText}>No partner restaurants nearby yet.</Text>
          </View>
        ) : (
          nearby.map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.nearbyCard, pressed && styles.nearbyRowPressed]}
              onPress={() => navigation.navigate("CharacterDetail", { restaurantId: r.id })}
            >
              <View style={styles.nearbyBannerWrap}>
                {r.banner ? (
                  <Image
                    source={{ uri: r.banner }}
                    style={[styles.nearbyBanner, { height: nearbyBannerHeight }]}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={[HOME_BRAND_RED, HOME_BRAND_RED_LIGHT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.nearbyBanner, { height: nearbyBannerHeight }]}
                  >
                    <Image
                      source={require("../../assets/adaptive-icon-v2.png")}
                      style={styles.nearbyBannerMark}
                      resizeMode="contain"
                    />
                  </LinearGradient>
                )}

                <View style={styles.distancePill}>
                  <MaterialCommunityIcons name="map-marker-distance" size={12} color={HOME_TEAL} />
                  <Text style={styles.distancePillLabel}>{formatDistance(r.distanceMi)}</Text>
                </View>

                <View style={[styles.nearbyMedallion, !r.isUnlocked && styles.nearbyMedallionLocked]}>
                  {r.isUnlocked && r.art ? (
                    <Image source={{ uri: r.art }} style={styles.nearbyMedallionArt} resizeMode="contain" />
                  ) : (
                    <Text style={styles.nearbyMedallionUnknown}>???</Text>
                  )}
                </View>
              </View>

              <View style={styles.nearbyCardBody}>
                <Text style={styles.nearbyName} numberOfLines={1}>
                  {r.name}
                </Text>
                <View style={styles.nearbyMetaRow}>
                  <Text style={styles.nearbyMeta}>{formatDistance(r.distanceMi)}</Text>
                  {r.cuisine_type ? <Text style={styles.nearbyMeta}> · {r.cuisine_type}</Text> : null}
                  {r.neighborhood ? <Text style={styles.nearbyMeta}> · {r.neighborhood}</Text> : null}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>
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

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeaderSpacing: { marginTop: spacing.md },
  sectionLabel: { fontSize: 19, fontWeight: "800", letterSpacing: 0.3, color: colors.textPrimary },
  topDealsHeaderRow: { justifyContent: "space-between" },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  dealsToggleRow: { flexDirection: "row" },
  dealsToggleButton: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginLeft: spacing.xs,
  },
  dealsToggleButtonActive: { backgroundColor: HOME_TEAL, borderColor: HOME_TEAL },
  dealsToggleLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  dealsToggleLabelActive: { color: "#FFFFFF" },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
  },

  nearbySection: { paddingHorizontal: spacing.lg },
  nearbyStateBox: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.sm },
  nearbyStateText: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  nearbyRetryButton: {
    backgroundColor: HOME_TEAL,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  nearbyRetryLabel: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },

  nearbyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: "hidden",
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  nearbyRowPressed: { opacity: 0.94 },
  nearbyBannerWrap: {
    width: "100%",
    backgroundColor: colors.surfaceMuted,
    position: "relative",
  },
  nearbyBanner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  nearbyBannerMark: { width: 64, height: 64, opacity: 0.9 },
  nearbyMedallion: {
    position: "absolute",
    bottom: -28,
    left: spacing.md,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: HOME_TEAL,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.surface,
  },
  nearbyMedallionLocked: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  nearbyMedallionArt: { width: 54, height: 54 },
  nearbyMedallionUnknown: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
    color: "#D8342B",
  },
  nearbyCardBody: { paddingTop: 36, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  nearbyName: { fontWeight: "800", color: colors.textPrimary, fontSize: 18 },
  nearbyMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 3, flexWrap: "wrap" },
  nearbyMeta: { color: colors.textSecondary, fontSize: 13 },
  distancePill: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  distancePillLabel: { fontSize: 11, fontWeight: "800", color: HOME_TEAL },

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
  cardImageWrap: { position: "relative" },
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
  dealMedallion: {
    position: "absolute",
    bottom: -20,
    left: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: HOME_TEAL,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.surface,
  },
  dealMedallionLocked: {
    backgroundColor: colors.surfaceMuted,
  },
  dealMedallionArt: { width: 42, height: 42 },
  dealMedallionUnknown: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
    color: "#D8342B",
  },
  cardBody: { paddingTop: spacing.md + 20, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
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