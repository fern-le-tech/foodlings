import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/colors";

const ROTATE_INTERVAL_MS = 3 * 60 * 1000; // 3 min, per brief

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
  const [token, setToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROTATE_INTERVAL_MS / 1000);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Show this to staff</Text>
      <View style={styles.qrWrap}>
        {token ? (
          <QRCode value={token} size={240} backgroundColor={colors.surface} />
        ) : (
          <Text style={styles.loading}>Loading code…</Text>
        )}
      </View>
      <Text style={styles.rotateHint}>Refreshes in {secondsLeft}s</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.lg },
  qrWrap: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loading: { color: colors.textSecondary },
  rotateHint: { marginTop: spacing.md, color: colors.textSecondary, fontSize: 13 },
});
