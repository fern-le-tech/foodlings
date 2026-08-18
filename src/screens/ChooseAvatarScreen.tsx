import { useState } from "react";
import { View, Text, Image, Pressable, FlatList, StyleSheet, Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";
import { AVATAR_OPTIONS } from "@/constants/avatarOptions";

interface Props {
  onDone: () => void;
}

/**
 * Shown once, right after account creation (see RootNavigator's
 * awaitingAvatarChoice flow). Not shown again on later logins — this is
 * purely a first-run step, not a permanent gate. The Profile tab's avatar
 * picker covers changing it later.
 */
export function ChooseAvatarScreen({ onDone }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!selected) {
      onDone(); // skipping is fine — avatar stays null, initial-letter fallback shows
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("users").update({ avatar_url: selected }).eq("id", user.id);
      if (error) {
        Alert.alert("Couldn't save avatar", error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onDone();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your avatar</Text>
      <Text style={styles.subtitle}>You can always change this later from your profile.</Text>

      <FlatList
        data={AVATAR_OPTIONS}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const isSelected = selected === item.url;
          return (
            <Pressable
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => setSelected(isSelected ? null : item.url)}
            >
              <Image source={{ uri: item.url }} style={styles.optionImage} resizeMode="contain" />
              <Text style={styles.optionLabel}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.continueButton} onPress={confirm} disabled={saving}>
        <Text style={styles.continueLabel}>{saving ? "Saving…" : selected ? "Continue" : "Skip for now"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  grid: { paddingBottom: spacing.lg },
  option: {
    flex: 1 / 3,
    alignItems: "center",
    padding: spacing.sm,
    margin: spacing.xs,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.accentEvolution,
    borderWidth: 2,
  },
  optionImage: { width: 56, height: 56, marginBottom: spacing.xs },
  optionLabel: { fontSize: 11, color: colors.textSecondary, textAlign: "center" },
  continueButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  continueLabel: { color: colors.surface, fontWeight: "700" },
});
