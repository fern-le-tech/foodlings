import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Linking } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/colors";

// This app and the staff portal (staff-portal/) are separate apps sharing
// one Supabase project — the same login works on either, but each only
// shows its own kind of dashboard, so someone with a staff account who
// opens this app instead just lands in the regular customer experience
// with no indication they're in the wrong place. Configure via app.json's
// expo.extra.staffPortalUrl (or EXPO_PUBLIC_STAFF_PORTAL_URL) once the
// staff portal has a real deployed URL — the link below hides itself if
// neither is set.
const STAFF_PORTAL_URL: string | undefined =
  Constants.expoConfig?.extra?.staffPortalUrl ?? process.env.EXPO_PUBLIC_STAFF_PORTAL_URL;

// Same red used for the "Foodlings" wordmark in the main app header —
// keeps the brand mark consistent instead of rendering it in plain body
// text color only here on the sign-in/sign-up screen.
const BRAND_RED = "#D8342B";

interface Props {
  // Fired right after a brand-new account is created (not on sign-in), so
  // RootNavigator can route to the one-time avatar-choice screen instead of
  // straight into the app.
  onSignUpSuccess?: () => void;
}

type Mode = "signIn" | "signUp" | "resetRequest" | "resetConfirm";

/**
 * Minimal email + password sign-up/sign-in, plus a mobile-friendly password
 * reset flow. Password reset uses an emailed 6-digit CODE rather than a
 * link — a link would need a hosted web page to land on to collect the new
 * password, which this project doesn't have. The code is typed back into
 * the app instead, so the whole flow stays in-app with no deep linking.
 *
 * IMPORTANT ONE-TIME SETUP: Supabase's default "Reset Password" email
 * template contains a link, not a plain code. To make this flow work,
 * edit that template in Supabase → Authentication → Emails → Reset
 * Password, and make sure the body includes {{ .Token }} somewhere
 * (e.g. "Your Foodlings reset code is {{ .Token }}") so the code actually
 * gets sent.
 */
export function OnboardingScreen({ onSignUpSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (mode === "signUp" && password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Double-check your password and confirmation match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || "New Trainer" },
            emailRedirectTo: "foodlings://confirmed",
          },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert(
            "Check your email",
            "We sent a confirmation link to " + email + " — tap it to activate your account and jump back in."
          );
        } else {
          onSignUpSuccess?.();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      Alert.alert("Something went wrong", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const sendResetCode = async () => {
    if (!email) {
      Alert.alert("Enter your email first", "We need your email to send a reset code.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert("Code sent", "Check your email for a 6-digit reset code.");
      setMode("resetConfirm");
    } catch (err: any) {
      Alert.alert("Something went wrong", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!resetCode || !newPassword) {
      Alert.alert("Missing info", "Enter both the code from your email and a new password.");
      return;
    }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: resetCode,
        type: "recovery",
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        // verifyOtp already established a session as a side effect, even
        // though the password itself was never actually changed (e.g. if
        // newPassword matches the old one and Supabase rejects it). Sign
        // back out rather than leaving the person logged in believing the
        // reset worked while their old password is still the real one —
        // they'll need to request a fresh code, since this one was already
        // consumed by verifyOtp.
        await supabase.auth.signOut();
        throw updateError;
      }

      Alert.alert("Password updated", "You're all set — you're now logged in.");
      // A successful verifyOtp + updateUser already establishes a session,
      // so RootNavigator's auth listener will pick it up and route into
      // the app automatically — no manual navigation needed here.
    } catch (err: any) {
      Alert.alert("Something went wrong", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "resetRequest") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>We'll email you a 6-digit code.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Pressable style={styles.button} onPress={sendResetCode} disabled={busy}>
          <Text style={styles.buttonLabel}>{busy ? "Sending…" : "Send reset code"}</Text>
        </Pressable>

        <Pressable onPress={() => setMode("signIn")}>
          <Text style={styles.switchLabel}>Back to log in</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === "resetConfirm") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter your code</Text>
        <Text style={styles.subtitle}>Sent to {email}</Text>

        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          placeholderTextColor={colors.textDisabled}
          keyboardType="number-pad"
          value={resetCode}
          onChangeText={setResetCode}
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="New password"
            placeholderTextColor={colors.textDisabled}
            secureTextEntry={!newPasswordVisible}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Pressable onPress={() => setNewPasswordVisible(!newPasswordVisible)}>
            <Text style={styles.showHideLabel}>{newPasswordVisible ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.button} onPress={confirmReset} disabled={busy}>
          <Text style={styles.buttonLabel}>{busy ? "Updating…" : "Set new password"}</Text>
        </Pressable>

        <Pressable onPress={() => setMode("resetRequest")}>
          <Text style={styles.switchLabel}>Didn't get a code? Send again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brandTitle}>Foodlings</Text>
      <Text style={styles.subtitle}>Collect Denver, one meal at a time.</Text>

      {mode === "signUp" && (
        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor={colors.textDisabled}
          value={displayName}
          onChangeText={setDisplayName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textDisabled}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={!passwordVisible}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable onPress={() => setPasswordVisible(!passwordVisible)}>
          <Text style={styles.showHideLabel}>{passwordVisible ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>

      {mode === "signUp" && (
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={!passwordVisible}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      )}

      {mode === "signIn" && (
        <Pressable onPress={() => setMode("resetRequest")} style={styles.forgotWrap}>
          <Text style={styles.forgotLabel}>Forgot password?</Text>
        </Pressable>
      )}

      <Pressable style={styles.button} onPress={submit} disabled={busy}>
        <Text style={styles.buttonLabel}>{mode === "signUp" ? "Create account" : "Log in"}</Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === "signUp" ? "signIn" : "signUp")}>
        <Text style={styles.switchLabel}>
          {mode === "signUp" ? "Already have an account? " : "New here? "}
          <Text style={styles.switchLabelAction}>{mode === "signUp" ? "Log in" : "Create an account"}</Text>
        </Text>
      </Pressable>

      {!!STAFF_PORTAL_URL && (
        <Pressable onPress={() => Linking.openURL(STAFF_PORTAL_URL)} style={styles.staffLinkWrap}>
          <Text style={styles.staffLinkLabel}>Restaurant staff? Log in here</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.lg },
  title: { fontSize: 32, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  brandTitle: { fontSize: 32, fontWeight: "800", color: BRAND_RED, textAlign: "center" },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  staffLinkWrap: { alignSelf: "center", marginTop: spacing.md },
  staffLinkLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginBottom: spacing.sm,
    paddingRight: spacing.md,
  },
  passwordInput: {
    flex: 1,
    padding: spacing.md,
    color: colors.textPrimary,
  },
  showHideLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentEvolution,
  },
  forgotWrap: { alignSelf: "flex-end", marginBottom: spacing.sm },
  forgotLabel: { fontSize: 13, color: colors.textSecondary },
  button: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonLabel: { color: colors.surface, fontWeight: "700" },
  switchLabel: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md, fontSize: 13 },
  switchLabelAction: { color: BRAND_RED, fontWeight: "700" },
});
