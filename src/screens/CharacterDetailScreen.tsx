import { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { EvolutionTimeline } from "@/components/EvolutionTimeline";
import { XPBar } from "@/components/XPBar";
import { StarRating } from "@/components/StarRating";
import type { FoodlingCharacter, Restaurant, RedeemableReward, UserRestaurantProgress } from "@/types/database";

type Tab = "about" | "rewards" | "reviews";

interface ReviewRow {
  id: string;
  user_id: string;
  body: string;
  rating: number | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  users: { display_name: string; avatar_url: string | null } | null;
}

const MAX_REVIEWS_PER_USER = 10;

function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ending soon";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

interface ActiveDeal {
  id: string;
  photo_url: string;
  description: string;
  expires_at: string;
}

const device = {
  shellLight: "#EE4A3E",
  shell: "#D8342B",
  shellDark: "#9C231C",
  bezel: "#262A2E",
  bezelHighlight: "#3B4046",
  lensTeal: "#2FBFAE",
  lensAmber: "#F5C518",
  readoutBg: "#3B4046",
  readoutText: "#EAF6F3",
  caseText: "#FFF3EF",
};

export function CharacterDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { restaurantId } = route.params as { restaurantId: string };

  const [tab, setTab] = useState<Tab>("about");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [character, setCharacter] = useState<FoodlingCharacter | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [progress, setProgress] = useState<UserRestaurantProgress | null>(null);
  const [rewards, setRewards] = useState<RedeemableReward[]>([]);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemMessage, setRedeemMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Reviews
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [reviewInput, setReviewInput] = useState("");
  const [ratingInput, setRatingInput] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [reviewThanks, setReviewThanks] = useState<{ xp: number; points: number } | null>(null);

  // Today's Deal
  const [activeDeal, setActiveDeal] = useState<ActiveDeal | null>(null);
  const [dealSaved, setDealSaved] = useState(false);
  const [dealModalVisible, setDealModalVisible] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);

  const loadActiveDeal = async (uid: string | null) => {
    const { data } = await supabase
      .from("daily_deals")
      .select("id, photo_url, description, expires_at")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    setActiveDeal(data ?? null);

    if (data && uid) {
      const { data: savedRow } = await supabase
        .from("saved_deals")
        .select("id")
        .eq("user_id", uid)
        .eq("deal_id", data.id)
        .maybeSingle();
      setDealSaved(!!savedRow);
    } else {
      setDealSaved(false);
    }
  };

  const toggleSaveDeal = async () => {
    if (!userId || !activeDeal) return;
    setSavingDeal(true);
    if (dealSaved) {
      await supabase.from("saved_deals").delete().eq("user_id", userId).eq("deal_id", activeDeal.id);
    } else {
      await supabase.from("saved_deals").insert({ user_id: userId, deal_id: activeDeal.id });
    }
    setDealSaved(!dealSaved);
    setSavingDeal(false);
  };

  const loadPointsAndRewards = async (uid: string) => {
    const [{ data: rewardsData }, { data: pointsRow }] = await Promise.all([
      supabase
        .from("redeemable_rewards")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .order("points_cost", { ascending: true }),
      supabase
        .from("user_restaurant_points")
        .select("points_balance")
        .eq("user_id", uid)
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
    ]);
    setRewards(rewardsData ?? []);
    setPointsBalance(pointsRow?.points_balance ?? 0);
  };

  const loadProgress = async (uid: string) => {
    const { data: progressData } = await supabase
      .from("user_restaurant_progress")
      .select("*")
      .eq("user_id", uid)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    setProgress(progressData);
  };

  const loadReviews = async (uid: string | null) => {
    const [{ data: reviewData }, { data: ratingRow }] = await Promise.all([
      supabase
        .from("reviews")
        .select("id, user_id, body, rating, photo_url, created_at, updated_at, users(display_name, avatar_url)")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("restaurant_ratings")
        .select("average_rating, rating_count")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
    ]);
    setReviews((reviewData ?? []) as unknown as ReviewRow[]);
    setAverageRating(ratingRow?.average_rating ?? null);
    setRatingCount(ratingRow?.rating_count ?? 0);

    if (uid) {
      const { count } = await supabase
        .from("checkins")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("restaurant_id", restaurantId);
      setHasCheckedIn((count ?? 0) > 0);
    }
  };

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [{ data: characterData }, { data: restaurantData }] = await Promise.all([
        supabase.from("foodling_characters").select("*").eq("restaurant_id", restaurantId).single(),
        supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
      ]);

      setCharacter(characterData);
      setRestaurant(restaurantData);

      await loadActiveDeal(user?.id ?? null);

      if (user) {
        await Promise.all([loadProgress(user.id), loadPointsAndRewards(user.id), loadReviews(user.id)]);
      } else {
        await loadReviews(null);
      }

      setLoading(false);
      setRefreshing(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restaurantId]
  );

  useFocusEffect(
    useCallback(() => {
      loadAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId])
  );

  const redeem = async (reward: RedeemableReward) => {
    if (!userId) return;
    setRedeemingId(reward.id);
    setRedeemMessage(null);

    const { data, error } = await supabase.rpc("create_pending_redemption", {
      p_reward_id: reward.id,
    });

    if (error) {
      setRedeemMessage({ text: error.message, ok: false });
      setRedeemingId(null);
      return;
    }

    const result = data?.[0];
    if (!result?.success) {
      setRedeemMessage({ text: result?.message ?? "Redemption failed.", ok: false });
      setRedeemingId(null);
      return;
    }

    await loadPointsAndRewards(userId);
    setRedeemingId(null);

    navigation.navigate("RedeemQR", {
      redemptionId: result.redemption_id,
      rewardTitle: reward.title,
      expiresAt: result.expires_at,
    });
  };

  const myReviewCount = reviews.filter((r) => r.user_id === userId).length;
  const atReviewLimit = myReviewCount >= MAX_REVIEWS_PER_USER;
  const editingReview = reviews.find((r) => r.id === editingReviewId) ?? null;

  const startEditReview = (review: ReviewRow) => {
    setEditingReviewId(review.id);
    setReviewInput(review.body);
    setRatingInput(review.rating);
    setPhotoUri(review.photo_url);
    setReviewError(null);
  };

  const cancelEditReview = () => {
    setEditingReviewId(null);
    setReviewInput("");
    setRatingInput(null);
    setPhotoUri(null);
    setReviewError(null);
  };

  const pickPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Enable access in your device settings to attach a photo.");
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.6,
          allowsEditing: true,
          aspect: [4, 3],
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhotoIfNeeded = async (): Promise<string | null> => {
    // Already an https URL (unchanged from an existing review being edited)
    // — nothing to upload.
    if (!photoUri || photoUri.startsWith("http")) return photoUri;
    if (!userId) return null;

    setUploadingPhoto(true);
    try {
      // fetch().blob() is unreliable for local file:// URIs on Android with
      // Supabase Storage uploads — reading as base64 and decoding to a
      // binary buffer is the approach that actually works reliably here.
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64);

      const ext = photoUri.split(".").pop()?.split("?")[0] || "jpg";
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const path = `${userId}/${restaurantId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("review-photos")
        .upload(path, arrayBuffer, { contentType });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveReview = async () => {
    if (!userId) return;
    const trimmed = reviewInput.trim();
    if (!trimmed) {
      setReviewError("Write something before saving.");
      return;
    }
    if (!ratingInput) {
      setReviewError("Tap a star to rate your visit.");
      return;
    }

    setSavingReview(true);
    setReviewError(null);

    let uploadedPhotoUrl: string | null = null;
    try {
      uploadedPhotoUrl = await uploadPhotoIfNeeded();
    } catch (err: any) {
      setReviewError(err.message ?? "Photo upload failed.");
      setSavingReview(false);
      return;
    }

    const isNewReview = !editingReviewId;

    if (isNewReview) {
      const { data: insertedRows, error } = await supabase
        .from("reviews")
        .insert({
          user_id: userId,
          restaurant_id: restaurantId,
          body: trimmed,
          rating: ratingInput,
          photo_url: uploadedPhotoUrl,
        })
        .select("xp_awarded, points_awarded");
        if (error) {
        setReviewError(error.message);
        setSavingReview(false);
        return;
      }

      const inserted = insertedRows?.[0];
      await Promise.all([loadReviews(userId), loadProgress(userId), loadPointsAndRewards(userId)]);
      setSavingReview(false);
      setReviewInput("");
      setRatingInput(null);
      setPhotoUri(null);

      if (inserted) {
        setReviewThanks({ xp: inserted.xp_awarded, points: inserted.points_awarded });
      }
    } else {
      const { error } = await supabase
        .from("reviews")
        .update({
          body: trimmed,
          rating: ratingInput,
          photo_url: uploadedPhotoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingReviewId);

      if (error) {
        setReviewError(error.message);
        setSavingReview(false);
        return;
      }

      await loadReviews(userId);
      setSavingReview(false);
      setEditingReviewId(null);
      setReviewInput("");
      setRatingInput(null);
      setPhotoUri(null);
    }
  };

  const deleteReview = (reviewId: string) => {
    Alert.alert("Delete review?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await supabase.from("reviews").delete().eq("id", reviewId);
          if (editingReviewId === reviewId) cancelEditReview();
          if (userId) await loadReviews(userId);
        },
      },
    ]);
  };

  if (loading || !character || !restaurant) {
    return (
      <View style={styles.shell}>
        <View style={styles.centered}>
          <ActivityIndicator color={device.caseText} />
        </View>
      </View>
    );
  }

  const isUnlocked = !!progress;
  const stage = progress?.current_stage ?? 1;
  const heroName = isUnlocked
    ? stage === 3
      ? character.name_stage3
      : stage === 2
        ? character.name_stage2
        : character.name_stage1
    : "???";
  const heroArt = isUnlocked
    ? stage === 3
      ? character.art_url_stage3
      : stage === 2
        ? character.art_url_stage2
        : character.art_url_stage1
    : null;

  const openInMaps = () => {
    const query = restaurant.address
      ? `${restaurant.address}, ${restaurant.city}`
      : `${restaurant.name}, ${restaurant.city}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    Linking.openURL(url);
  };

  return (
    <LinearGradient colors={[device.shellLight, device.shell]} style={styles.shell}>
      <View style={styles.statusRow}>
        <View style={styles.lensGroup}>
          <View style={[styles.lens, styles.lensTeal]} />
          <View style={[styles.lens, styles.lensAmber]} />
        </View>
        <View style={styles.readout}>
          <Text style={styles.readoutText}>{isUnlocked ? `STAGE ${stage}/3` : "LOCKED"}</Text>
        </View>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {restaurant.name.toUpperCase()}
        </Text>
        {averageRating !== null && (
          <View style={styles.ratingBadge}>
            <StarRating value={Math.round(averageRating)} readOnly size={16} color="#FFD23F" />
            <Text style={styles.ratingBadgeText}>
              {averageRating} ({ratingCount})
            </Text>
          </View>
        )}
      </View>

      <View style={styles.seam} />

      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={device.caseText} />
          }
        >
          <View style={styles.heroWrap}>
            <XPBar
              currentXp={progress?.current_xp ?? 0}
              currentStage={stage}
              xpThresholdStage2={character.xp_threshold_stage2}
              xpThresholdStage3={character.xp_threshold_stage3}
              size={210}
              strokeWidth={14}
            >
              {isUnlocked && heroArt ? (
                <Image source={{ uri: heroArt }} style={styles.heroArt} resizeMode="contain" />
              ) : (
                <View style={styles.heroLocked}>
                  <Text style={styles.heroLockedGlyph}>???</Text>
                </View>
              )}
            </XPBar>
            <Text style={styles.heroName}>{heroName}</Text>
            <Text style={styles.heroSubtitle}>{restaurant.name}</Text>
            {isUnlocked && (
              <Text style={styles.xpCaption}>
                {stage >= 3
                  ? "Max evolution"
                  : `${progress?.current_xp ?? 0} / ${stage === 1 ? character.xp_threshold_stage2 : character.xp_threshold_stage3} xp · ${
                      (stage === 1 ? character.xp_threshold_stage2 : character.xp_threshold_stage3) -
                      (progress?.current_xp ?? 0)
                    } to next stage`}
              </Text>
            )}
            {!isUnlocked && (
              <Text style={styles.lockedHint}>Check in here to reveal this Foodling.</Text>
            )}
          </View>

          <EvolutionTimeline
            character={character}
            progress={progress ?? { current_stage: 0, current_xp: 0 }}
          />

          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setTab("about")}
              style={[styles.tabButton, tab === "about" && styles.tabButtonActive]}
            >
              <Text style={[styles.tabLabel, tab === "about" && styles.tabLabelActive]}>About</Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("rewards")}
              style={[styles.tabButton, tab === "rewards" && styles.tabButtonActive]}
            >
              <Text style={[styles.tabLabel, tab === "rewards" && styles.tabLabelActive]}>Rewards</Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("reviews")}
              style={[styles.tabButton, tab === "reviews" && styles.tabButtonActive]}
            >
              <Text style={[styles.tabLabel, tab === "reviews" && styles.tabLabelActive]}>Reviews</Text>
            </Pressable>
          </View>

          {tab === "about" ? (
            <View style={styles.aboutBlock}>
              {(restaurant.cuisine_type || restaurant.neighborhood || restaurant.city) && (
                <View style={styles.subtitleRow}>
                  {restaurant.cuisine_type && <Text style={styles.subtitleText}>{restaurant.cuisine_type}</Text>}
                  {restaurant.cuisine_type && (restaurant.neighborhood || restaurant.city) && (
                    <Text style={styles.subtitleDot}>•</Text>
                  )}
                  {(restaurant.neighborhood || restaurant.city) && (
                    <Text style={styles.subtitleText}>{restaurant.neighborhood ?? restaurant.city}</Text>
                  )}
                </View>
              )}

              {activeDeal ? (
                <>
                  <Text style={styles.sectionLabel}>Today's Deal</Text>
                  <Pressable style={styles.dealCard} onPress={() => setDealModalVisible(true)}>
                    <Image source={{ uri: activeDeal.photo_url }} style={styles.dealCardImage} resizeMode="cover" />
                    <View style={styles.dealCardTimerBadge}>
                      <MaterialCommunityIcons name="clock-outline" size={12} color="#FFFFFF" />
                      <Text style={styles.dealCardTimerText}>{formatTimeRemaining(activeDeal.expires_at)}</Text>
                    </View>
                    <View style={styles.dealCardBody}>
                      <Text style={styles.dealCardDescription} numberOfLines={2}>
                        {activeDeal.description}
                      </Text>
                      <View style={styles.dealCardFooter}>
                        <Text style={styles.dealCardCta}>Tap for details</Text>
                        <MaterialCommunityIcons name="chevron-right" size={16} color={colors.accentEvolution} />
                      </View>
                    </View>
                  </Pressable>
                </>
              ) : (
                restaurant.signature_dish && (
                  <>
                    <Text style={styles.sectionLabel}>Signature dish</Text>
                    <View style={styles.dishCard}>
                      <View style={styles.dishCardIconWrap}>
                        <MaterialCommunityIcons name="silverware-fork-knife" size={26} color="#FFFFFF" />
                      </View>
                      <Text style={styles.dishCardName}>{restaurant.signature_dish}</Text>
                    </View>
                  </>
                )
              )}

              {rewards.length > 0 && (
                <>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel}>Rewards preview</Text>
                    <Pressable onPress={() => setTab("rewards")}>
                      <Text style={styles.sectionLabelAction}>See all →</Text>
                    </Pressable>
                  </View>
                  <View style={styles.rewardsPreviewCard}>
                    {rewards.slice(0, 3).map((reward, i) => (
                      <View
                        key={reward.id}
                        style={[styles.rewardsPreviewRow, i > 0 && styles.rewardsPreviewRowDivider]}
                      >
                        <View style={styles.rewardsPreviewIconWrap}>
                          <MaterialCommunityIcons name="gift-outline" size={16} color={colors.accentReward} />
                        </View>
                        <Text style={styles.rewardsPreviewName} numberOfLines={1}>
                          {reward.title}
                        </Text>
                        <Text style={styles.rewardsPreviewCost}>{reward.points_cost} pts</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.sectionLabel}>Address</Text>
              <Pressable style={styles.addressCard} onPress={openInMaps}>
                <View style={styles.addressCardIconWrap}>
                  <MaterialCommunityIcons name="map-marker" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.addressCardTextCol}>
                  <Text style={styles.addressCardText} numberOfLines={2}>
                    {restaurant.address ? `${restaurant.address}` : restaurant.name}
                  </Text>
                  <Text style={styles.addressCardCity}>{restaurant.city}</Text>
                </View>
                <View style={styles.addressCardCta}>
                  <Text style={styles.addressCardCtaLabel}>Open in Maps</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.accentEvolution} />
                </View>
              </Pressable>
            </View>
          ) : tab === "rewards" ? (
            <View style={styles.rewardsBlock}>
              <View style={styles.pointsHero}>
                <Text style={styles.pointsHeroLabel}>Your points here</Text>
                <Text style={styles.pointsHeroValue}>{pointsBalance}</Text>
              </View>

              {redeemMessage && (
                <View style={[styles.toast, redeemMessage.ok ? styles.toastOk : styles.toastError]}>
                  <Text style={styles.toastText}>{redeemMessage.text}</Text>
                </View>
              )}

              {rewards.length === 0 ? (
                <Text style={styles.emptyRewardsText}>No rewards available yet — check back soon.</Text>
              ) : (
                rewards.map((reward) => {
                  const affordable = pointsBalance >= reward.points_cost;
                  const isRedeeming = redeemingId === reward.id;
                  return (
                    <View key={reward.id} style={[styles.rewardRow, !affordable && styles.rewardRowLocked]}>
                      <View style={styles.rewardTextCol}>
                        <Text style={[styles.rewardTitle, !affordable && styles.rewardTitleLocked]}>
                          {reward.title}
                        </Text>
                        <Text style={styles.rewardCost}>{reward.points_cost} pts</Text>
                      </View>
                      <Pressable
                        disabled={!affordable || isRedeeming}
                        onPress={() => redeem(reward)}
                        style={[styles.redeemButton, (!affordable || isRedeeming) && styles.redeemButtonDisabled]}
                      >
                        {isRedeeming ? (
                          <ActivityIndicator size="small" color={colors.surface} />
                        ) : (
                          <Text style={styles.redeemButtonLabel}>{affordable ? "Redeem" : "Locked"}</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.reviewsBlock}>
              {hasCheckedIn && (
                <View style={styles.reviewEditor}>
                  <Text style={styles.reviewEditorLabel}>
                    {editingReview ? "Edit review" : `Write a review (${myReviewCount}/${MAX_REVIEWS_PER_USER})`}
                  </Text>
                  {atReviewLimit && !editingReview ? (
                    <Text style={styles.reviewErrorText}>
                      You've reached the {MAX_REVIEWS_PER_USER}-review limit for this restaurant. Edit or delete
                      one below to add another.
                    </Text>
                  ) : (
                    <>
                      <StarRating value={ratingInput} onChange={setRatingInput} size={26} />

                      <TextInput
                        style={styles.reviewInput}
                        value={reviewInput}
                        onChangeText={setReviewInput}
                        placeholder="What did you think of this place?"
                        placeholderTextColor={colors.textDisabled}
                        multiline
                        numberOfLines={3}
                      />

                      {photoUri ? (
                        <View style={styles.photoPreviewWrap}>
                          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                          <Pressable style={styles.photoRemoveButton} onPress={() => setPhotoUri(null)}>
                            <Text style={styles.photoRemoveLabel}>Remove photo</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.photoButtonRow}>
                          <Pressable style={styles.photoButton} onPress={() => pickPhoto(true)}>
                            <Text style={styles.photoButtonLabel}>📷 Take photo</Text>
                          </Pressable>
                          <Pressable style={styles.photoButton} onPress={() => pickPhoto(false)}>
                            <Text style={styles.photoButtonLabel}>🖼 Choose photo</Text>
                          </Pressable>
                        </View>
                      )}

                      {reviewError && <Text style={styles.reviewErrorText}>{reviewError}</Text>}

                      <View style={styles.reviewEditorButtons}>
                        <Pressable
                          style={styles.reviewSaveButton}
                          onPress={saveReview}
                          disabled={savingReview || uploadingPhoto}
                        >
                          <Text style={styles.reviewSaveButtonLabel}>
                            {uploadingPhoto
                              ? "Uploading photo…"
                              : savingReview
                                ? "Saving…"
                                : editingReview
                                  ? "Save changes"
                                  : "Post review"}
                          </Text>
                        </Pressable>
                        {editingReview && (
                          <Pressable onPress={cancelEditReview}>
                            <Text style={styles.reviewCancelLabel}>Cancel</Text>
                          </Pressable>
                        )}
                      </View>
                    </>
                  )}
                </View>
              )}

              {!hasCheckedIn && (
                <Text style={styles.emptyRewardsText}>Check in here to leave a review.</Text>
              )}

              {reviews.length === 0 ? (
                <Text style={styles.emptyRewardsText}>No reviews yet — be the first.</Text>
              ) : (
                reviews.map((review) => {
                  const isMine = review.user_id === userId;
                  return (
                    <View key={review.id} style={[styles.reviewCard, isMine && styles.reviewCardMine]}>
                      <View style={styles.reviewHeaderRow}>
                        {review.users?.avatar_url ? (
                          <Image source={{ uri: review.users.avatar_url }} style={styles.reviewAvatar} />
                        ) : (
                          <View style={styles.reviewAvatarFallback}>
                            <Text style={styles.reviewAvatarInitial}>
                              {(review.users?.display_name ?? "?").charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.reviewHeaderTextCol}>
                          <Text style={styles.reviewAuthor}>
                            {isMine ? "You" : (review.users?.display_name ?? "Someone")}
                          </Text>
                          <Text style={styles.reviewDate}>
                            {new Date(review.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </Text>
                        </View>
                        {isMine && (
                          <View style={styles.reviewCardActions}>
                            <Pressable onPress={() => startEditReview(review)}>
                              <Text style={styles.reviewCardActionLabel}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => deleteReview(review.id)}>
                              <Text style={[styles.reviewCardActionLabel, styles.reviewCardDeleteLabel]}>
                                Delete
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>

                      {review.rating && (
                        <View style={styles.reviewRatingRow}>
                          <StarRating value={review.rating} readOnly size={14} />
                        </View>
                      )}

                      <Text style={styles.reviewBody}>{review.body}</Text>

                      {review.photo_url && (
                        <Image source={{ uri: review.photo_url }} style={styles.reviewPhoto} resizeMode="cover" />
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </View>

      <View style={styles.footerDots}>
        <View style={styles.footerDot} />
        <View style={styles.footerDot} />
      </View>

      <Modal visible={!!reviewThanks} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.thanksCard}>
            <Text style={styles.thanksEmoji}>🎉</Text>
            <Text style={styles.thanksTitle}>Thanks for the review!</Text>
            {reviewThanks && (
              <Text style={styles.thanksBody}>
                You received <Text style={styles.thanksBold}>+{reviewThanks.xp} XP</Text> and{" "}
                <Text style={styles.thanksBold}>+{reviewThanks.points} points</Text>
              </Text>
            )}
            <Pressable style={styles.thanksButton} onPress={() => setReviewThanks(null)}>
              <Text style={styles.thanksButtonLabel}>Nice!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dealModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDealModalVisible(false)}
      >
        <View style={styles.dealModalBackdrop}>
          <View style={styles.dealModalSheet}>
            <Pressable
              style={styles.dealModalClose}
              onPress={() => setDealModalVisible(false)}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>

            {activeDeal && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Image source={{ uri: activeDeal.photo_url }} style={styles.dealModalImage} resizeMode="cover" />
                <View style={styles.dealModalBody}>
                  <View style={styles.dealModalTimerBadge}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                    <Text style={styles.dealModalTimerText}>{formatTimeRemaining(activeDeal.expires_at)}</Text>
                  </View>
                  <Text style={styles.dealModalDescription}>{activeDeal.description}</Text>

                  {userId && (
                    <Pressable
                      style={[styles.dealModalSaveButton, dealSaved && styles.dealModalSaveButtonActive]}
                      onPress={toggleSaveDeal}
                      disabled={savingDeal}
                    >
                      <MaterialCommunityIcons
                        name={dealSaved ? "bookmark" : "bookmark-outline"}
                        size={18}
                        color={dealSaved ? "#FFFFFF" : colors.accentEvolution}
                      />
                      <Text style={[styles.dealModalSaveLabel, dealSaved && styles.dealModalSaveLabelActive]}>
                        {dealSaved ? "Saved" : "Save deal"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: device.shell,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  lensGroup: { flexDirection: "row", alignItems: "center" },
  lens: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.15)",
  },
  lensTeal: { backgroundColor: device.lensTeal, width: 20, height: 20, borderRadius: 10 },
  lensAmber: { backgroundColor: device.lensAmber },
  readout: {
    backgroundColor: device.readoutBg,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  readoutText: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    color: device.readoutText,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: 1, color: device.caseText, flexShrink: 1 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginLeft: spacing.sm,
  },
  ratingBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: device.caseText,
    marginLeft: 4,
  },
  seam: {
    height: 3,
    borderRadius: 2,
    backgroundColor: device.shellDark,
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 6,
    borderColor: device.bezel,
    overflow: "hidden",
  },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  heroWrap: { alignItems: "center", marginBottom: spacing.lg },
  heroArt: { width: 180, height: 180 },
  heroLocked: {
    width: 180,
    height: 180,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLockedGlyph: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 28,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  heroName: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginTop: spacing.sm },
  heroSubtitle: { fontSize: 14, color: colors.textSecondary },
  lockedHint: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" },
  xpCaption: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radii.pill,
  },
  tabButtonActive: {
    backgroundColor: colors.accentEvolution,
  },
  tabLabel: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  tabLabelActive: { color: "#FFFFFF", fontWeight: "800" },
  aboutBlock: { marginTop: spacing.md },
  rewardsBlock: { marginTop: spacing.md },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  bodyText: { fontSize: 15, color: colors.textPrimary, marginTop: spacing.xs },
  locationLink: { color: colors.accentEvolution, fontWeight: "600" },

  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  subtitleText: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  subtitleDot: { fontSize: 14, color: colors.textSecondary, marginHorizontal: 6 },

  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionLabelAction: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accentEvolution,
    marginTop: spacing.md,
  },

  dealCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: "hidden",
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dealCardImage: { width: "100%", height: 130, backgroundColor: colors.surfaceMuted },
  dealCardTimerBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dealCardTimerText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  dealCardBody: { padding: spacing.md },
  dealCardDescription: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  dealCardFooter: { flexDirection: "row", alignItems: "center", marginTop: spacing.xs },
  dealCardCta: { fontSize: 12, fontWeight: "700", color: colors.accentEvolution, marginRight: 2 },

  dealModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  dealModalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    overflow: "hidden",
  },
  dealModalClose: {
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
  dealModalImage: { width: "100%", height: 240, backgroundColor: colors.surfaceMuted },
  dealModalBody: { padding: spacing.lg },
  dealModalTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: spacing.md,
  },
  dealModalTimerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  dealModalDescription: { fontSize: 16, color: colors.textPrimary, lineHeight: 23 },
  dealModalSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.accentEvolution,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dealModalSaveButtonActive: { backgroundColor: colors.accentEvolution },
  dealModalSaveLabel: { fontSize: 15, fontWeight: "700", color: colors.accentEvolution },
  dealModalSaveLabelActive: { color: "#FFFFFF" },

  dishCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accentEvolution,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  dishCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  dishCardName: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", flexShrink: 1 },

  rewardsPreviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  rewardsPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rewardsPreviewRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rewardsPreviewIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  rewardsPreviewName: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  rewardsPreviewCost: { fontSize: 12, fontWeight: "700", color: colors.accentReward },

  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  addressCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  addressCardTextCol: { flex: 1 },
  addressCardText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  addressCardCity: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  addressCardCta: { alignItems: "center" },
  addressCardCtaLabel: { fontSize: 11, fontWeight: "700", color: colors.accentEvolution },

  pointsHero: {
    backgroundColor: colors.accentReward,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  pointsHeroLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
  },
  pointsHeroValue: {
    fontSize: 48,
    fontWeight: "900",
    color: "#FFFFFF",
    marginTop: 4,
  },

  toast: {
    borderRadius: radii.card,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  toastOk: { backgroundColor: "#E4F5EC" },
  toastError: { backgroundColor: "#FBE7E7" },
  toastText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },

  emptyRewardsText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },

  rewardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  rewardRowLocked: { opacity: 0.6 },
  rewardTextCol: { flex: 1 },
  rewardTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  rewardTitleLocked: { color: colors.textDisabled },
  rewardCost: { fontSize: 13, color: colors.accentReward, fontWeight: "700", marginTop: 2 },
  redeemButton: {
    backgroundColor: colors.accentReward,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minWidth: 80,
    alignItems: "center",
  },
  redeemButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  redeemButtonLabel: {
    color: colors.surface,
    fontWeight: "700",
    fontSize: 13,
  },

  reviewsBlock: { marginTop: spacing.md },
  reviewEditor: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reviewEditorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  reviewInput: {
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 90,
    textAlignVertical: "top",
    marginTop: spacing.sm,
  },
  reviewErrorText: { fontSize: 12, color: colors.accentAlert, marginTop: spacing.xs },
  reviewEditorButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  reviewSaveButton: {
    backgroundColor: colors.accentEvolution,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginRight: spacing.md,
  },
  reviewSaveButtonLabel: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  reviewCancelLabel: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },

  photoButtonRow: { flexDirection: "row", marginTop: spacing.sm, gap: spacing.sm },
  photoButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  photoButtonLabel: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  photoPreviewWrap: { marginTop: spacing.sm },
  photoPreview: { width: "100%", height: 160, borderRadius: radii.card },
  photoRemoveButton: { marginTop: spacing.xs, alignSelf: "flex-start" },
  photoRemoveLabel: { fontSize: 13, color: colors.accentAlert, fontWeight: "600" },

  reviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  reviewCardMine: {
    borderColor: colors.accentEvolution,
    borderWidth: 1.5,
  },
  reviewHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm },
  reviewAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  reviewAvatarInitial: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  reviewHeaderTextCol: { flex: 1 },
  reviewAuthor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  reviewDate: { fontSize: 11, color: colors.textSecondary },
  reviewRatingRow: { marginBottom: spacing.xs },
  reviewBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  reviewPhoto: { width: "100%", height: 180, borderRadius: radii.card, marginTop: spacing.sm },
  reviewCardActions: { flexDirection: "row", gap: 10 },
  reviewCardActionLabel: { fontSize: 12, fontWeight: "600", color: colors.accentEvolution },
  reviewCardDeleteLabel: { color: colors.accentAlert },

  footerDots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: device.shellDark,
    marginHorizontal: 4,
    opacity: 0.7,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  thanksCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  thanksEmoji: { fontSize: 48, marginBottom: spacing.sm },
  thanksTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.xs },
  thanksBody: { fontSize: 15, color: colors.textSecondary, textAlign: "center" },
  thanksBold: { fontWeight: "700", color: colors.textPrimary },
  thanksButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentReward,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  thanksButtonLabel: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
