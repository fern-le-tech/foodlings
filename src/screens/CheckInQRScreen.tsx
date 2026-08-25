import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/colors";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

const ROTATE_INTERVAL_MS = 3 * 60 * 1000; // 3 min, per brief

const CHECKIN_RED = "#D8342B";
// Dark bezel border around the QR card — the one surviving piece of the
// old retro-scanner chrome, kept because it reads as "device screen"
// around the code itself without needing the full red shell around it.
const BEZEL = "#262A2E";

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
  const tabBarClearance = useTabBarClearance();
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
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.centered, { paddingBottom: tabBarClearance }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={CHECKIN_RED} />
        }
      >
        <View style={styles.card}>
          <View style={styles.qrWrap}>
            {token ? (
              <QRCode value={token} size={220} backgroundColor={colors.surface} />
            ) : (
              <Text style={styles.loading}>Loading code…</Text>
            )}
          </View>
          <Text style={styles.subtitle}>Show this to staff at checkout</Text>
          <Text style={styles.rotateHint}>Refreshes in {formatCountdown(secondsLeft)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 6,
    borderColor: BEZEL,
    padding: spacing.xl,
    alignItems: "center",
  },
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
});
