import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii } from "@/theme/colors";

interface Props {
  onDone: () => void;
}

type Slide = {
  key: string;
  title: string;
  body: string;
  // Each slide gets its own accent instead of one flat color for all
  // four — picked from colors the app already uses meaningfully elsewhere
  // (not new hues) so the walkthrough previews the real palette rather
  // than inventing one just for itself.
  accent: string;
  // Either a single centered icon, or a 3-circle evolution silhouette row —
  // only one of `icon` / `evolutionArt` is set per slide.
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  evolutionArt?: string[]; // stage 1 -> 2 -> 3 art URLs, rendered as silhouettes
};

const SLIDE_RED = "#D8342B"; // brand red — the opening "take action" slide
const SLIDE_GOLD = "#E3A008"; // matches the real evolution timeline/XP ring exactly
const SLIDE_GREEN = colors.accentReward; // matches the real Rewards tab exactly
const SLIDE_ORANGE = colors.accentEvolution; // warm finale for the collection journey

// Real City O City evolution line, used here purely as illustrative art for
// the walkthrough — every restaurant has its own line, this is just the
// example. Rendered as silhouettes (tintColor over transparent PNGs) rather
// than full color so it reads as "this is illustrative," not "this is
// literally what you'll get."
const EVOLUTION_EXAMPLE_ART = [
  "https://svndowiisksyzorvqxjn.supabase.co/storage/v1/object/public/character-art/20192d56-03a0-4efc-acab-5e7037e991c5/art_url_stage1.png",
  "https://svndowiisksyzorvqxjn.supabase.co/storage/v1/object/public/character-art/20192d56-03a0-4efc-acab-5e7037e991c5/art_url_stage2.png",
  "https://svndowiisksyzorvqxjn.supabase.co/storage/v1/object/public/character-art/20192d56-03a0-4efc-acab-5e7037e991c5/art_url_stage3.png",
];

const SLIDES: Slide[] = [
  {
    key: "checkin",
    icon: "qrcode-scan",
    accent: SLIDE_RED,
    title: "Scan to earn at restaurants",
    body:
      "Scan the QR code at any partner restaurant when you dine in. Every dollar you spend earns you 1 XP and 1 reward point at that restaurant.",
  },
  {
    key: "evolve",
    evolutionArt: EVOLUTION_EXAMPLE_ART,
    accent: SLIDE_GOLD,
    title: "Watch your character evolve",
    body:
      "Each restaurant has its own collectible character. Keep scanning in and it evolves through three stages as your XP there grows — from a first form all the way to its final evolution.",
  },
  {
    key: "redeem",
    icon: "gift-outline",
    accent: SLIDE_GREEN,
    title: "Redeem points for rewards",
    body:
      "Your points at each restaurant can be redeemed for real rewards there — just show your redemption QR code to staff and it's confirmed instantly.",
  },
  {
    key: "collect",
    icon: "cards",
    accent: SLIDE_ORANGE,
    title: "Collect all of Denver",
    body:
      "Leave reviews, invite friends, and scan in at new spots to grow your collection. Climb the leaderboard as you become a true Foodlings trainer.",
  },
];

export function HowItWorksScreen({ onDone }: Props) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const isLastSlide = activeIndex === SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== activeIndex) setActiveIndex(index);
  };

  const goNext = () => {
    if (isLastSlide) {
      onDone();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.skipButton} onPress={onDone} hitSlop={12}>
        <Text style={styles.skipLabel}>Skip</Text>
      </Pressable>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {item.evolutionArt ? (
              <View style={styles.evolutionRow}>
                {item.evolutionArt.map((url, i) => (
                  <View key={url} style={styles.evolutionStep}>
                    <View style={[styles.evolutionCircle, { backgroundColor: item.accent }]}>
                      <Image
                        source={{ uri: url }}
                        style={styles.evolutionImage}
                        resizeMode="contain"
                        // Renders the artwork as a flat white silhouette —
                        // replaces every non-transparent pixel with this
                        // color, so PNG transparency becomes the shape.
                        tintColor="#FFFFFF"
                      />
                    </View>
                    {i < item.evolutionArt!.length - 1 && (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={22}
                        color={colors.textSecondary}
                        style={styles.evolutionChevron}
                      />
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.iconCircle, { backgroundColor: item.accent }]}>
                <MaterialCommunityIcons name={item.icon!} size={56} color={colors.surface} />
              </View>
            )}
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && [styles.dotActive, { backgroundColor: slide.accent }],
              ]}
            />
          ))}
        </View>

        <Pressable style={styles.nextButton} onPress={goNext}>
          <Text style={styles.nextButtonLabel}>
            {isLastSlide ? "Let's go!" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.xs,
  },
  skipLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  evolutionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  evolutionStep: {
    flexDirection: "row",
    alignItems: "center",
  },
  evolutionCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  evolutionImage: {
    width: 44,
    height: 44,
  },
  evolutionChevron: {
    marginHorizontal: 2,
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  slideBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
  },
  nextButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
    alignItems: "center",
  },
  nextButtonLabel: {
    color: colors.surface,
    fontWeight: "700",
    fontSize: 16,
  },
});

