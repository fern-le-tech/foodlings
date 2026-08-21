import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

type InviterInfo = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function AcceptFriendRequestScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { inviterId } = route.params as { inviterId: string };
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [result, setResult] = useState<"accepted" | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInviter() {
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name, avatar_url")
        .eq("id", inviterId)
        .single();

      if (cancelled) return;
      if (error || !data) {
        setResult("error");
      } else {
        setInviter(data);
      }
      setLoading(false);
    }

    loadInviter();
    return () => {
      cancelled = true;
    };
  }, [inviterId]);

  const handleAccept = async () => {
    setResponding(true);
    const { error } = await supabase.rpc("accept_friend_invite", {
      p_inviter_id: inviterId,
    });
    setResponding(false);

    if (error) {
      setResult("error");
    } else {
      setResult("accepted");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.tabActive} />
      </View>
    );
  }

  if (result === "error" || !inviter) {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.textSecondary} />
        <Text style={styles.errorText}>
          This invite link isn't valid, or something went wrong. Try asking your friend to send
          a new one.
        </Text>
        <Pressable style={styles.doneButton} onPress={() => navigation.replace("Main")}>
          <Text style={styles.doneButtonText}>Back to Foodlings</Text>
        </Pressable>
      </View>
    );
  }

  if (result === "accepted") {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="check-circle" size={56} color={colors.tabActive} />
        <Text style={styles.successTitle}>You're friends now!</Text>
        <Text style={styles.successSubtitle}>
          You and {inviter.display_name ?? "your friend"} are now connected on Foodlings.
        </Text>
        <Pressable style={styles.doneButton} onPress={() => navigation.replace("Main")}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      {inviter.avatar_url ? (
        <Image source={{ uri: inviter.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>
            {(inviter.display_name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <Text style={styles.inviteText}>
        <Text style={styles.inviteName}>{inviter.display_name ?? "Someone"}</Text> wants to be
        your friend on Foodlings
      </Text>

      <Pressable style={styles.acceptButton} onPress={handleAccept} disabled={responding}>
        {responding ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.acceptButtonText}>Accept</Text>
        )}
      </Pressable>

      <Pressable style={styles.declineButton} onPress={() => navigation.replace("Main")}>
        <Text style={styles.declineButtonText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: colors.background ?? "#FFF8EF",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 20,
  },
  avatarFallback: {
    backgroundColor: colors.tabActive,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  inviteText: {
    fontSize: 18,
    textAlign: "center",
    color: colors.textPrimary,
    marginBottom: 28,
    lineHeight: 26,
  },
  inviteName: {
    fontWeight: "700",
  },
  acceptButton: {
    backgroundColor: colors.tabActive,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginBottom: 12,
    minWidth: 200,
    alignItems: "center",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  declineButton: {
    paddingVertical: 10,
  },
  declineButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    textAlign: "center",
    color: colors.textSecondary,
    marginBottom: 28,
  },
  doneButton: {
    backgroundColor: colors.tabActive,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
