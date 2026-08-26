import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Animated, Easing } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";

const CONFETTI_COLORS = ["#D8342B", "#E3A008", "#3F8F6B", "#B5651D", "#9C5B6B"];
// Precomputed once (not per-render) — each piece gets its own trajectory
// (angle/distance/rotation/color) and a small random stagger so the burst
// reads as organic rather than a uniform ring of identical dots.
const CONFETTI_PIECES = Array.from({ length: 14 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.6;
  const distance = 90 + Math.random() * 60;
  return {
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance - 30,
    rotate: (Math.random() - 0.5) * 720,
    delay: Math.random() * 120,
  };
});

/**
 * Shown right after a person taps "Redeem" on a reward. Points are already
 * reserved server-side (see create_pending_redemption) but NOT yet spent —
 * staff scanning this code and confirming is what actually deducts them via
 * fulfill_redemption. This keeps the QR payload dead simple (just the
 * redemption id) since the security boundary is the 10-minute expiry plus
 * server-side status checks, not the token itself.
 *
 * A realtime subscription on this exact redemption row means the person
 * sees a celebration the instant staff confirms the scan — no manual
 * refresh or navigating back needed.
 */
export function RedeemQRScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { redemptionId, rewardTitle, expiresAt } = route.params as {
    redemptionId: string;
    rewardTitle: string;
    expiresAt: string;
  };

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  const [fulfilled, setFulfilled] = useState(false);
  const cardScale = useRef(new Animated.Value(0.4)).current;
  const emojiScale = useRef(new Animated.Value(0)).current;
  const confettiProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fulfilled) return;
    cardScale.setValue(0.4);
    emojiScale.setValue(0);
    confettiProgress.setValue(0);

    Animated.sequence([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.spring(emojiScale, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(confettiProgress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fulfilled]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    const channel = supabase
      .channel(`redemption-${redemptionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "redemptions",
          filter: `id=eq.${redemptionId}`,
        },
        (payload) => {
          if (payload.new?.status === "fulfilled") {
            setFulfilled(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [redemptionId]);

  const expired = !fulfilled && secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{rewardTitle}</Text>
      <Text style={styles.subtitle}>Show this to staff to confirm</Text>

      <View style={[styles.qrWrap, expired && styles.qrWrapExpired]}>
        {expired ? (
          <Text style={styles.expiredText}>Expired</Text>
        ) : (
          <QRCode value={redemptionId} size={240} backgroundColor={colors.surface} />
        )}
      </View>

      <Text style={expired ? styles.expiredHint : styles.rotateHint}>
        {expired
          ? "This code has expired — go back and redeem again."
          : `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`}
      </Text>

      <Text style={styles.doneLink} onPress={() => navigation.goBack()}>
        Done
      </Text>

      <Modal visible={fulfilled} transparent animationType="fade">
        <View style={styles.overlay}>
          {CONFETTI_PIECES.map((piece, i) => {
            const startFrac = piece.delay / 900;
            const translateX = confettiProgress.interpolate({
              inputRange: [0, startFrac, 1],
              outputRange: [0, 0, piece.dx],
            });
            const translateY = confettiProgress.interpolate({
              inputRange: [0, startFrac, 1],
              outputRange: [0, 0, piece.dy],
            });
            const rotate = confettiProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", `${piece.rotate}deg`],
            });
            const opacity = confettiProgress.interpolate({
              inputRange: [0, startFrac, Math.min(startFrac + 0.15, 0.9), 1],
              outputRange: [0, 1, 1, 0],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.confettiPiece,
                  {
                    backgroundColor: piece.color,
                    opacity,
                    transform: [{ translateX }, { translateY }, { rotate }],
                  },
                ]}
              />
            );
          })}

          <Animated.View style={[styles.celebrationCard, { transform: [{ scale: cardScale }] }]}>
            <Animated.Text style={[styles.celebrationEmoji, { transform: [{ scale: emojiScale }] }]}>
              🎉
            </Animated.Text>
            <Text style={styles.celebrationTitle}>Congratulations!</Text>
            <Text style={styles.celebrationBody}>
              You've redeemed <Text style={styles.celebrationReward}>{rewardTitle}</Text>
            </Text>
            <Pressable
              style={styles.celebrationButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.celebrationButtonLabel}>Nice!</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  qrWrap: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 240,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  qrWrapExpired: { borderColor: colors.accentAlert ?? "#D45B5B" },
  expiredText: { fontSize: 18, fontWeight: "700", color: colors.accentAlert ?? "#D45B5B" },
  rotateHint: { marginTop: spacing.md, color: colors.textSecondary, fontSize: 13 },
  expiredHint: { marginTop: spacing.md, color: colors.accentAlert ?? "#D45B5B", fontSize: 13, fontWeight: "600" },
  doneLink: {
    marginTop: spacing.xl,
    color: colors.textSecondary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  // Rests at dead center (matching where the card itself sits) before its
  // translate transform bursts it outward — width/height + negative
  // margins is the simplest way to anchor an absolutely-positioned piece
  // on its own center point rather than its top-left corner.
  confettiPiece: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 8,
    height: 8,
    marginTop: -4,
    marginLeft: -4,
    borderRadius: 2,
  },
  celebrationCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  celebrationEmoji: { fontSize: 48, marginBottom: spacing.sm },
  celebrationTitle: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.xs },
  celebrationBody: { fontSize: 15, color: colors.textSecondary, textAlign: "center" },
  celebrationReward: { fontWeight: "700", color: colors.textPrimary },
  celebrationButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentReward,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  celebrationButtonLabel: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});