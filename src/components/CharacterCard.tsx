import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/theme/colors";

interface Props {
  name: string;
  artUrl: string | null;
  restaurantName: string;
  isLocked: boolean;
  onPress: () => void;
}

/** A single card in the Foodidex grid. Locked cards show a "???" placeholder instead of art. */
export function CharacterCard({ name, artUrl, restaurantName, isLocked, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.artWrap, isLocked && styles.artWrapLocked]}>
        {isLocked ? (
          <Text style={styles.lockedGlyph}>???</Text>
        ) : artUrl ? (
          <Image source={{ uri: artUrl }} style={styles.art} resizeMode="contain" />
        ) : (
          <View style={styles.artPlaceholder} />
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {isLocked ? "???" : name}
      </Text>
      <Text style={styles.restaurant} numberOfLines={1}>
        {restaurantName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    margin: spacing.xs,
    alignItems: "center",
  },
  artWrap: {
    width: "100%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  artWrapLocked: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  lockedGlyph: {
    fontFamily: "monospace",
    fontWeight: "800",
    fontSize: 20,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  artPlaceholder: {
    width: "80%",
    height: "80%",
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
  },
  name: {
    marginTop: spacing.xs,
    fontWeight: "600",
    fontSize: 13,
    color: colors.textPrimary,
  },
  restaurant: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});