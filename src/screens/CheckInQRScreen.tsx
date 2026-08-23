import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/colors";

const ROTATE_INTERVAL_MS = 3 * 60 * 1000; // 3 min, per brief

// Same retro-handheld-device chrome as Collection/CharacterDetail — this
// screen is the other natural fit for it (a scanning gadget moment, no
// food photography to clash with), so it gets the full treatment rather
// than the lighter red-header pattern used on Home/Leaderboard/Profile.
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

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Full-screen QR for staff to scan. The QR payload is a signed, short-lived
 * token — NOT the raw user id — so a screenshot is useless after rotation.
 *
 * Token minting should happen server-side (Supabase Edge Function) so the
 * signing secret never ships in the app bundle. This screen just calls that
 * function on a timer. Swap the placeholder fetch below for your deployed
 * edge function URL.
 */
export function CheckInQRScreen() {
  const navigation = useNavigation<any>();
  const [token, setToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROTATE_INTERVAL_MS / 1000);
  const [refreshing, setRefreshing] = useState(false);

  const mintToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    // Edge function should verify the JWT, then return a short-lived signed
    // token like `${userId}.${expiresAt}.${hmacSignature}`.
    const { data, error } = await supabase.functions.invoke("mint-checkin-token", {
      body: {},
    });

    if (!error && data?.token) {
      setToken(data.token);
      setSecondsLeft(ROTATE_INTERVAL_MS / 1000);
    }
  }, []);

  useEffect(() => {
    mintToken();
    const rotateTimer = setInterval(mintToken, ROTATE_INTERVAL_MS);
    const tickTimer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearInterval(rotateTimer);
      clearInterval(tickTimer);
    };
  }, [mintToken]);

  // process_checkin() is only ever called from the staff portal, so this
  // device has no other way to learn a check-in happened — listen for the
  // resulting checkins row instead. evolved/new_stage aren't columns on
  // checkins itself; they're reconstructed from the progress row it leaves
  // behind: subtracting xp_awarded back out of current_xp gives the
  // pre-checkin xp, and running that through the same threshold logic
  // process_checkin uses gives the pre-checkin stage to diff against.
  // Deliberately not scoped to this screen's focus state — the celebration
  // should still fire even if the customer switched tabs while staff scan.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`checkins-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "checkins",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            const checkin = payload.new as {
              id: string;
              restaurant_id: string;
              xp_awarded: number;
              points_awarded: number;
              rate_limited: boolean;
            };

            const [{ data: restaurant }, { data: character }, { data: progress }] = await Promise.all([
              supabase.from("restaurants").select("name").eq("id", checkin.restaurant_id).single(),
              supabase
                .from("foodling_characters")
                .select("xp_threshold_stage2, xp_threshold_stage3")
                .eq("restaurant_id", checkin.restaurant_id)
                .single(),
              supabase
                .from("user_restaurant_progress")
                .select("current_xp, current_stage")
                .eq("user_id", user.id)
                .eq("restaurant_id", checkin.restaurant_id)
                .single(),
            ]);

            if (!restaurant || !character || !progress) return;

            const stageForXp = (xp: number): 1 | 2 | 3 =>
              xp >= character.xp_threshold_stage3 ? 3 : xp >= character.xp_threshold_stage2 ? 2 : 1;
            const oldStage = stageForXp(progress.current_xp - checkin.xp_awarded);

            navigation.navigate("CheckInSuccess", {
              checkin_id: checkin.id,
              xp_awarded: checkin.xp_awarded,
              points_awarded: checkin.points_awarded,
              rate_limited: checkin.rate_limited,
              new_stage: progress.current_stage,
              evolved: progress.current_stage > oldStage,
              new_cumulative_xp: progress.current_xp,
              restaurantName: restaurant.name,
            });
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigation]);

  // Pull-to-refresh here mints a fresh token immediately instead of
  // waiting out the rest of the 3-minute rotation — useful if staff's
  // scanner didn't catch the current code in time.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mintToken();
    setRefreshing(false);
  }, [mintToken]);

  return (
    <LinearGradient colors={[device.shellLight, device.shell]} style={styles.shell}>
      <View style={styles.statusRow}>
        <View style={styles.lensGroup}>
          <View style={[styles.lens, styles.lensTeal]} />
          <View style={[styles.lens, styles.lensAmber]} />
        </View>
        <View style={styles.readout}>
          <Text style={styles.readoutText}>{formatCountdown(secondsLeft)}</Text>
        </View>
      </View>

      <Text style={styles.title}>CHECK IN</Text>

      <View style={styles.seam} />

      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={device.shell} />
          }
        >
          <View style={styles.qrWrap}>
            {token ? (
              <QRCode value={token} size={220} backgroundColor={colors.surface} />
            ) : (
              <Text style={styles.loading}>Loading code…</Text>
            )}
          </View>
          <Text style={styles.subtitle}>Show this to staff</Text>
          <Text style={styles.rotateHint}>Refreshes in {formatCountdown(secondsLeft)}</Text>
        </ScrollView>
      </View>

      <View style={styles.footerDots}>
        <View style={styles.footerDot} />
        <View style={styles.footerDot} />
      </View>
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
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
    color: device.caseText,
    marginBottom: spacing.sm,
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
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  qrWrap: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loading: { color: colors.textSecondary, width: 220, textAlign: "center" },
  subtitle: {
    marginTop: spacing.lg,
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rotateHint: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: "monospace",
  },
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
});
