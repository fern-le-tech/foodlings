import { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Share, ActivityIndicator } from "react-native";
import * as Linking from "expo-linking";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors } from "@/theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  displayName: string | null;
};

export function InviteFriendsModal({ visible, onClose, userId, displayName }: Props) {
  const [sharing, setSharing] = useState(false);

  // Linking.createURL builds the right scheme automatically:
  // exp://<host>/--/invite/<id> in Expo Go during dev,
  // foodiemon://invite/<id> in a standalone/dev-client build.
  // Either way RootNavigator's linking config below knows how to route it.
  const inviteUrl = Linking.createURL(`invite/${userId}`);

  const handleShare = async () => {
    setSharing(true);
    try {
      await Share.share({
        message: `${displayName ?? "Someone"} wants to be your friend on FoodieMon! Tap to accept: ${inviteUrl}`,
        url: inviteUrl, // used on iOS
      });
    } catch {
      // user cancelled the share sheet — nothing to do
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="account-plus" size={28} color={colors.tabActive} />
            <Text style={styles.title}>Invite a Friend</Text>
          </View>

          <Text style={styles.subtitle}>
            Send this link to a friend. When they open it and accept, you'll both show up on
            each other's friends list.
          </Text>

          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={1}>
              {inviteUrl}
            </Text>
          </View>

          <Pressable style={styles.shareButton} onPress={handleShare} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" />
                <Text style={styles.shareButtonText}>Share Invite Link</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text ?? "#1A1A1A",
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted ?? "#666666",
    marginBottom: 16,
    lineHeight: 20,
  },
  linkBox: {
    backgroundColor: colors.border ?? "#EEEEEE",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  linkText: {
    fontSize: 13,
    color: colors.textMuted ?? "#444444",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.tabActive,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  closeButtonText: {
    color: colors.textMuted ?? "#888888",
    fontSize: 15,
  },
});
