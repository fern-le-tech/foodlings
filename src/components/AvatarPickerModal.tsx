import { View, Text, Image, Pressable, Modal, StyleSheet, FlatList } from "react-native";
import { colors, spacing, radii } from "@/theme/colors";
import { AVATAR_OPTIONS } from "@/constants/avatarOptions";

interface Props {
  visible: boolean;
  currentUrl: string | null;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function AvatarPickerModal({ visible, currentUrl, onSelect, onClose }: Props) {
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
          <FlatList
            data={AVATAR_OPTIONS}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => {
              const selected = item.url === currentUrl;
              return (
                <Pressable
                  style={[styles.optionWrap, selected && styles.optionWrapSelected]}
                  onPress={() => onSelect(item.url)}
                >
                  <Image source={{ uri: item.url }} style={styles.optionImage} resizeMode="contain" />
                  <Text style={styles.optionLabel}>{item.label}</Text>
                </Pressable>
              );
            }}
          />
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
  grid: { paddingBottom: spacing.md },
  optionWrap: {
    flex: 1 / 3,
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
