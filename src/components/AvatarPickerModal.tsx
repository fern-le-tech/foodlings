import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { AVATAR_OPTIONS } from "@/constants/avatarOptions";

interface Props {
  visible: boolean;
  currentUrl: string | null;
  userId: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

interface ProgressRow {
  restaurant_id: string;
  current_stage: 1 | 2 | 3;
}

interface CharacterRow {
  restaurant_id: string;
  name_stage1: string;
  name_stage2: string;
  name_stage3: string;
  art_url_stage1: string | null;
  art_url_stage2: string | null;
  art_url_stage3: string | null;
}

interface UnlockedFoodling {
  restaurantId: string;
  name: string;
  url: string;
}

/**
 * Avatar options come in two groups: the fixed food-icon set (always
 * available, never spoils a restaurant's actual Foodling) and any
 * Foodlings the person has personally unlocked by checking in — refetched
 * every time the sheet opens, plus a live subscription while it's open, so
 * a Foodling appears here the moment it's unlocked rather than needing an
 * app restart to show up.
 */
export function AvatarPickerModal({ visible, currentUrl, userId, onSelect, onClose }: Props) {
  const [unlocked, setUnlocked] = useState<UnlockedFoodling[]>([]);

  const loadUnlocked = useCallback(async () => {
    const [{ data: progressData }, { data: characterData }] = await Promise.all([
      supabase
        .from("user_restaurant_progress")
        .select("restaurant_id, current_stage")
        .eq("user_id", userId),
      supabase
        .from("foodling_characters")
        .select(
          "restaurant_id, name_stage1, name_stage2, name_stage3, art_url_stage1, art_url_stage2, art_url_stage3"
        ),
    ]);

    const charactersByRestaurant = new Map(
      ((characterData ?? []) as CharacterRow[]).map((c) => [c.restaurant_id, c])
    );

    const rows: UnlockedFoodling[] = ((progressData ?? []) as ProgressRow[])
      .map((p) => {
        const character = charactersByRestaurant.get(p.restaurant_id);
        if (!character) return null;
        const name = p.current_stage === 3 ? character.name_stage3 : p.current_stage === 2 ? character.name_stage2 : character.name_stage1;
        const url =
          p.current_stage === 3
            ? character.art_url_stage3
            : p.current_stage === 2
              ? character.art_url_stage2
              : character.art_url_stage1;
        if (!url) return null;
        return { restaurantId: p.restaurant_id, name, url };
      })
      .filter((row): row is UnlockedFoodling => row !== null);

    setUnlocked(rows);
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    loadUnlocked();

    const channel = supabase
      .channel(`avatar-picker-progress-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_restaurant_progress", filter: `user_id=eq.${userId}` },
        () => loadUnlocked()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, userId, loadUnlocked]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose an avatar</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeLabel}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.grid}>
              {AVATAR_OPTIONS.map((item) => {
                const selected = item.url === currentUrl;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.optionWrap, selected && styles.optionWrapSelected]}
                    onPress={() => onSelect(item.url)}
                  >
                    <Image source={{ uri: item.url }} style={styles.optionImage} resizeMode="contain" />
                    <Text style={styles.optionLabel}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {unlocked.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Your Foodlings</Text>
                <View style={styles.grid}>
                  {unlocked.map((item) => {
                    const selected = item.url === currentUrl;
                    return (
                      <Pressable
                        key={item.restaurantId}
                        style={[styles.optionWrap, selected && styles.optionWrapSelected]}
                        onPress={() => onSelect(item.url)}
                      >
                        <Image source={{ uri: item.url }} style={styles.optionImage} resizeMode="contain" />
                        <Text style={styles.optionLabel} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  closeLabel: { fontSize: 15, fontWeight: "600", color: colors.accentEvolution },
  scrollContent: { paddingBottom: spacing.md },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  optionWrap: {
    width: "31%",
    alignItems: "center",
    padding: spacing.sm,
    margin: spacing.xs,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionWrapSelected: {
    borderColor: colors.accentEvolution,
    borderWidth: 2,
  },
  optionImage: { width: 56, height: 56, marginBottom: spacing.xs },
  optionLabel: { fontSize: 11, color: colors.textSecondary, textAlign: "center" },
});
